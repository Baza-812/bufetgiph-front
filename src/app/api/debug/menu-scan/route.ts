import { NextRequest, NextResponse } from 'next/server';

const API = process.env.AIRTABLE_API_URL || 'https://api.airtable.com/v0';
const BASE = process.env.AIRTABLE_BASE!;
const TOKEN = process.env.AIRTABLE_TOKEN!;

async function at(path: string) {
  const r = await fetch(`${API}/${BASE}/${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: 'no-store',
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, json: text ? JSON.parse(text) : null, text };
}

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date') || ''; // опц.
    const limit = Math.max(1, Math.min(200, Number(req.nextUrl.searchParams.get('limit') || 50)));

    // без формулы — просто смотрим живые записи Menu
    const r = await at(`Menu?pageSize=${limit}`);
    if (!r.ok) return NextResponse.json({ ok:false, status:r.status, body:r.text }, { status:500 });

    const rows = (r.json?.records || []).map((rec: any) => {
      const f = rec.fields || {};
      return {
        id: rec.id,
        Date: f.Date ?? null,
        DateISO: f.DateISO ?? null,
        Zapekanka: Array.isArray(f.Zapekanka) ? f.Zapekanka.length : (typeof f.Zapekanka === 'string' ? 1 : 0),
        Salad:     Array.isArray(f.Salad)     ? f.Salad.length     : (typeof f.Salad === 'string'     ? 1 : 0),
        Soup:      Array.isArray(f.Soup)      ? f.Soup.length      : (typeof f.Soup === 'string'      ? 1 : 0),
        Main:      Array.isArray(f.Main)      ? f.Main.length      : (typeof f.Main === 'string'      ? 1 : 0),
        Side:      Array.isArray(f.Side)      ? f.Side.length      : (typeof f.Side === 'string'      ? 1 : 0),
      };
    });

    const filtered = date
      ? rows.filter((x:any) => x.DateISO === date || (typeof x.Date === 'string' && x.Date.includes(date)))
      : rows;

    return NextResponse.json({ ok:true, total: rows.length, filtered: filtered.length, rows: filtered });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error:e.message || String(e) }, { status:500 });
  }
}
