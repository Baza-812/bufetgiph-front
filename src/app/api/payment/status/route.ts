// src/app/api/payment/status/route.ts
import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.baza.menu';
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;

function env(k: string, d: string) { return process.env[k] ?? d; }

const TABLE = {
  PAYMENTS: env('TBL_PAYMENTS', 'Payments'),
  BANKS: env('TBL_BANKS', 'Banks'),
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const paymentId = searchParams.get('paymentId');
    const orderId = searchParams.get('orderId');

    if (!paymentId) {
      return NextResponse.json({ error: 'paymentId required' }, { status: 400 });
    }

    if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) {
      return NextResponse.json({ error: 'Missing Airtable config' }, { status: 500 });
    }

    // Получаем Payment record из Airtable
    const atUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE.PAYMENTS)}/${paymentId}`;
    
    const atResp = await fetch(atUrl, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
      },
    });

    if (!atResp.ok) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    const payment = await atResp.json();
    const fields = payment.fields || {};

    const status = fields.Status || 'pending';
    const paid = status === 'succeeded';
    const amount = fields.Amount || 0;
    const providerLinks = fields.Provider;
    const providerRecordId = Array.isArray(providerLinks) ? providerLinks[0] : providerLinks;

    // Получаем реквизиты из Banks
    let bankInfo = null;
    if (providerRecordId) {
      try {
        const bankUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE.BANKS)}/${providerRecordId}`;
        const bankResp = await fetch(bankUrl, {
          headers: {
            'Authorization': `Bearer ${AIRTABLE_API_KEY}`,
          },
        });

        if (bankResp.ok) {
          const bank = await bankResp.json();
          const bf = bank.fields || {};
          bankInfo = {
            legalName: bf.LegalName || '',
            inn: bf.INN || '',
            kpp: bf.KPP || '',
            footer: bf.FooterText || '',
          };
        }
      } catch (e) {
        console.error('Failed to fetch bank info:', e);
      }
    }

    return NextResponse.json({
      ok: true,
      status,
      paid,
      amount,
      bankInfo,
    });

  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Status check failed' },
      { status: 500 }
    );
  }
}
