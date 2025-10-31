import { NextRequest, NextResponse } from 'next/server';

const API = process.env.AIRTABLE_API_URL || 'https://api.airtable.com/v0';
const BASE = process.env.AIRTABLE_BASE!;
const TOKEN = process.env.AIRTABLE_TOKEN!;

async function fetchDishById(id: string) {
  const r = await fetch(`${API}/${BASE}/Dishes/${id}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: 'no-store',
  });
  if (!r.ok) {
    const t = await r.text();
    const err = new Error(`Airtable ${r.status} ${t}`);
    // прокинем статус наружу
    // @ts-ignore
    err.status = r.status;
    throw err;
  }
  return r.json();
}

async function fetchDishByName(name: string) {
  // экранируем одиночные кавычки для formula
  const safe = name.replace(/'/g, "''");
  const formula = encodeURIComponent(`{Name}='${safe}'`);
  const r = await fetch(`${API}/${BASE}/Dishes?filterByFormula=${formula}&maxRecords=1`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`Airtable ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.records?.[0];
}

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    const name = req.nextUrl.searchParams.get('name') || '';
    if (!id) return NextResponse.json({ ok:false, error:'id required' }, { status: 400 });

    let rec: any;
    try {
      rec = await fetchDishById(id);
    } catch (e: any) {
      // если это 404 — пытаемся по имени
      if ((e as any)?.status === 404 && name) {
        const byName = await fetchDishByName(name);
        if (!byName) throw e;
        rec = byName;
      } else {
        throw e;
      }
    }

    const f = rec.fields || {};
    const dish = {
      id: rec.id as string,
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
