import { NextRequest, NextResponse } from 'next/server';

const API = process.env.AIRTABLE_API_URL || 'https://api.airtable.com/v0';
const BASE = process.env.AIRTABLE_BASE!;
const TOKEN = process.env.AIRTABLE_TOKEN!;

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ ok:false, error:'id required' }, { status: 400 });

    const r = await fetch(`${API}/${BASE}/Dishes/${id}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      cache: 'no-store',
    });
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`Airtable ${r.status} ${t}`);
    }
    const j = await r.json();
    const f = j.fields || {};
    const dish = {
      id: j.id as string,
      name: f.Name as string | undefined,
      description: f.Description as string | undefined,
      dishURL: f.DishURL as string | undefined,
      howToCook: f.HowToCook as string | undefined,
      photos: Array.isArray(f.Photo) ? f.Photo.map((p:any)=>({ url:p.url, filename:p.filename, id:p.id })) : [],
    };
    return NextResponse.json({ ok:true, dish });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e.message || String(e) }, { status: 500 });
  }
}
