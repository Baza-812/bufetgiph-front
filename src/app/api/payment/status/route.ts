// src/app/api/payment/status/route.ts
import { NextRequest, NextResponse } from 'next/server';

// Определяем backend API в зависимости от окружения
const isProd = process.env.VERCEL_ENV === 'production';
const API_BASE = isProd
  ? 'https://bufetgiph-api.vercel.app'
  : 'https://dev-bufetgiph-api.vercel.app';

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

    if (!paymentId) {
      return NextResponse.json({ error: 'paymentId required' }, { status: 400 });
    }

    // Вызываем backend для получения актуального статуса из ЮKassa
    const backendUrl = `${API_BASE}/api/payment_status?paymentId=${paymentId}`;
    
    const backendResp = await fetch(backendUrl, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!backendResp.ok) {
      return NextResponse.json({ error: 'Failed to fetch payment status' }, { status: backendResp.status });
    }

    const paymentData = await backendResp.json();

    // Получаем реквизиты из Airtable
    let bankInfo = null;
    if (AIRTABLE_BASE_ID && AIRTABLE_API_KEY && paymentId) {
      try {
        const paymentUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE.PAYMENTS)}/${paymentId}`;
        const paymentResp = await fetch(paymentUrl, {
          headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` },
        });

        if (paymentResp.ok) {
          const payment = await paymentResp.json();
          const providerLinks = payment.fields?.Provider;
          const providerRecordId = Array.isArray(providerLinks) ? providerLinks[0] : providerLinks;

          if (providerRecordId) {
            const bankUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE.BANKS)}/${providerRecordId}`;
            const bankResp = await fetch(bankUrl, {
              headers: { 'Authorization': `Bearer ${AIRTABLE_API_KEY}` },
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
          }
        }
      } catch (e) {
        console.error('Failed to fetch bank info:', e);
      }
    }

    return NextResponse.json({
      ...paymentData,
      bankInfo,
    });

  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Status check failed' },
      { status: 500 }
    );
  }
}
