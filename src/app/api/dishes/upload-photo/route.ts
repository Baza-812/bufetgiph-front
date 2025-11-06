import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';

const API   = process.env.AIRTABLE_API_URL || 'https://api.airtable.com/v0';
const BASE  = process.env.AIRTABLE_BASE || process.env.AIRTABLE_BASE_ID || '';
const TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY || '';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const dishId = String(form.get('dishId') || '');
    const file = form.get('file') as File | null;

    if (!dishId) return NextResponse.json({ ok:false, error:'dishId required' }, { status: 400 });
    if (!file || !('name' in file)) return NextResponse.json({ ok:false, error:'file required' }, { status: 400 });
    if (!BASE || !TOKEN) return NextResponse.json({ ok:false, error:'Missing env: AIRTABLE_BASE/AIRTABLE_TOKEN' }, { status:500 });

    // ВАЖНО: передаём сам File, а не Uint8Array — так `put` принимает корректно в Edge/Node
    const blob = await put(`kitchen/${dishId}/${file.name}`, file, {
      access: 'public',
      addRandomSuffix: true,
      contentType: file.type || 'application/octet-stream',
    });

    // Подхватим текущие вложения, чтобы не стереть их
    const getR = await fetch(`${API}/${BASE}/Dishes/${dishId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      cache: 'no-store',
    });
    if (!getR.ok) throw new Error(`Airtable GET ${getR.status} ${await getR.text()}`);
    const cur = await getR.json();
    const existing = Array.isArray(cur.fields?.Photo) ? cur.fields.Photo : [];

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
    return NextResponse.json({ ok:false, error: e.message || String(e) }, { status: 500 });
  }
}
