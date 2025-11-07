import { NextRequest, NextResponse } from 'next/server';

const API  = process.env.AIRTABLE_API_URL || 'https://api.airtable.com/v0';
const BASE = process.env.AIRTABLE_BASE!;
const TOKEN= process.env.AIRTABLE_TOKEN!;

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id') || '';
    if (!id) return NextResponse.json({ ok:false, error:'id required' }, { status:400 });

    const r = await fetch(`${API}/${BASE}/Menu/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      cache: 'no-store',
    });

    const text = await r.text();
    const status = r.status;

    return NextResponse.json({
      ok: r.ok,
      status,
      base: BASE,
      table: 'Menu',
      id,
      body: text,
    }, { status: r.ok ? 200 : 500 });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e.message || String(e) }, { status:500 });
  }
}
