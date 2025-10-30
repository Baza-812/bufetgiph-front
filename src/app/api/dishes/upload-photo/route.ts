import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

const API = process.env.AIRTABLE_API_URL || 'https://api.airtable.com/v0';
const BASE = process.env.AIRTABLE_BASE!;
const TOKEN = process.env.AIRTABLE_TOKEN!;

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file') as unknown as File;
    const dishId = String(form.get('dishId') || '');
    if (!dishId) return NextResponse.json({ error:'dishId required' }, { status: 400 });
    if (!file || !('name' in file)) return NextResponse.json({ error:'file required' }, { status: 400 });

    // ✅ передаём сам File (или можно использовать new Blob([await file.arrayBuffer()]))
    const blob = await put(`kitchen/${dishId}/${file.name}`, file, {
      access: 'public',
      addRandomSuffix: true,
      contentType: file.type,
      token: process.env.VERCEL_BLOB_READ_WRITE_TOKEN, // на всякий случай явно
    });

    // получить текущие вложения, чтобы не стереть
    const curR = await fetch(`${API}/${BASE}/Dishes/${dishId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      cache: 'no-store',
    });
    if (!curR.ok) throw new Error(`Airtable GET ${curR.status} ${await curR.text()}`);
    const curJ = await curR.json();
    const existing = Array.isArray(curJ.fields?.Photo) ? curJ.fields.Photo : [];

    const patchR = await fetch(`${API}/${BASE}/Dishes/${dishId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          Photo: [
            ...existing,
            { url: blob.url, filename: file.name },
          ],
        },
      }),
    });
    if (!patchR.ok) throw new Error(`Airtable PATCH ${patchR.status} ${await patchR.text()}`);

    return NextResponse.json({ ok:true, url: blob.url });
  } catch (e:any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
