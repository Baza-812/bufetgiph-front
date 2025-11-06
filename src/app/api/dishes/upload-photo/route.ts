import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

const API   = process.env.AIRTABLE_API_URL || 'https://api.airtable.com/v0';
const BASE  = process.env.AIRTABLE_BASE_ID || process.env.AIRTABLE_BASE || '';
const TOKEN = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN || '';
const DISHES_TID = (process.env.KITCHEN_DISHES_TABLE_ID || '').trim();
const DISHES_LABEL = 'Dishes';

// требуются права на запись в Blob: BLOB_READ_WRITE_TOKEN в Vercel env
function dishesPath(suffix: string) {
  return `${DISHES_TID ? DISHES_TID : encodeURIComponent(DISHES_LABEL)}/${suffix}`;
}

async function atPatch(path: string, body: any) {
  const r = await fetch(`${API}/${BASE}/${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify(body),
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, json: text ? JSON.parse(text) : null, text };
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const dishId = String(form.get('dishId') || '');
    const file = form.get('file') as File | null;

    if (!dishId || !file) {
      return NextResponse.json({ ok:false, error:'dishId and file required' }, { status:400 });
    }

    // грузим как File — так корректно для @vercel/blob
    const blob = await put(`kitchen/${dishId}/${file.name}`, file, {
      access: 'public',
      addRandomSuffix: true,
      contentType: file.type || 'application/octet-stream',
    });

    // добавляем в Airtable в поле Photo
    const patch = await atPatch(dishesPath(encodeURIComponent(dishId)), {
      records: [{
        id: dishId,
        fields: {
          Photo: [{ url: blob.url, filename: file.name }]
        }
      }]
    });

    if (!patch.ok) {
      return NextResponse.json({ ok:false, error:`Airtable patch failed: ${patch.text}` }, { status:500 });
    }

    return NextResponse.json({ ok:true, url: blob.url });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e.message || String(e) }, { status:500 });
  }
}

export const runtime = 'nodejs'; // не edge, т.к. используем @vercel/blob put
