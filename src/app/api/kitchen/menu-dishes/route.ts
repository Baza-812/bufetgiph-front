// src/app/api/kitchen/menu-dishes/route.ts
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const API   = process.env.AIRTABLE_API_URL || 'https://api.airtable.com/v0';
const BASE  = process.env.AIRTABLE_BASE || process.env.AIRTABLE_BASE_ID || '';
const TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY || '';

const MENU_TID   = (process.env.KITCHEN_MENU_TABLE_ID   || '').trim();   // tbl...
const DISHES_TID = (process.env.KITCHEN_DISHES_TABLE_ID || '').trim();   // tbl...

const MENU   = MENU_TID   ? MENU_TID   : 'Menu';
const DISHES = DISHES_TID ? DISHES_TID : 'Dishes';

type DishCategory = 'Zapekanka' | 'Salad' | 'Soup' | 'Main' | 'Side';

const CAT_KEYS: Array<{ key: string; title: DishCategory }> = [
  { key: 'Zapekanka', title: 'Zapekanka' },
  { key: 'Salad',     title: 'Salad'     },
  { key: 'Soup',      title: 'Soup'      },
  { key: 'Main',      title: 'Main'      },
  { key: 'Side',      title: 'Side'      },
];

async function at(path: string) {
  const r = await fetch(`${API}/${BASE}/${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: 'no-store',
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, json: text ? JSON.parse(text) : null, text };
}

function buildFormula(dateISO: string) {
  const fields = ['DateISO','Date','MenuDateISO','OrderDateISO'];
  const ors = fields.map(f => `DATETIME_FORMAT({${f}}, 'YYYY-MM-DD')='${dateISO}'`);
  return encodeURIComponent(`OR(${ors.join(',')})`);
}

async function getMenuByDate(dateISO: string) {
  let r = await at(`${encodeURIComponent(MENU)}?filterByFormula=${buildFormula(dateISO)}&maxRecords=1`);
  if (r.ok && r.json?.records?.[0]) return r.json.records[0];

  r = await at(`${encodeURIComponent(MENU)}?filterByFormula=${encodeURIComponent(`{Date}='${dateISO}'`)}&maxRecords=1`);
  if (r.ok && r.json?.records?.[0]) return r.json.records[0];

  return null;
}

async function getDishesByIds(ids: string[]) {
  if (!ids?.length) return [];
  const params = ids.map(id => `records[]=${encodeURIComponent(id)}`).join('&');
  const r = await at(`${encodeURIComponent(DISHES)}?${params}`);
  if (!r.ok) return [];
  return r.json?.records ?? [];
}

export async function GET(req: NextRequest) {
  try {
    if (!BASE || !TOKEN) {
      return NextResponse.json({ ok:false, error:'Missing env: AIRTABLE_BASE/AIRTABLE_TOKEN' }, { status:500 });
    }

    const date = req.nextUrl.searchParams.get('date') || '';
    const debug= req.nextUrl.searchParams.get('debug') === '1';
    if (!date) return NextResponse.json({ ok:false, error:'date required' }, { status:400 });

    const menu = await getMenuByDate(date);
    if (!menu) {
      return NextResponse.json({
        ok: true,
        dishes: [],
        debug: debug ? { reason:'menu_not_found', how:'not_found', date, base: BASE } : undefined
      });
    }

    const f = menu.fields || {};
    const perCatIds: Record<string, string[]> = {};
    for (const { key } of CAT_KEYS) {
      const v = f[key];
      if (Array.isArray(v)) perCatIds[key] = v.filter((x:any)=> typeof x === 'string' && x.startsWith('rec'));
      else if (typeof v === 'string' && v.startsWith('rec')) perCatIds[key] = [v];
      else perCatIds[key] = [];
    }

    const allIds = [...new Set(Object.values(perCatIds).flat())];
    const recs = await getDishesByIds(allIds);
    const byId: Record<string, any> = {};
    for (const r of recs) byId[r.id] = r;

    const dishes = CAT_KEYS.flatMap(({ key, title }) =>
      (perCatIds[key] || []).map(id => {
        const d = byId[id];
        const name  = d?.fields?.Name ?? 'Без названия';
        const descr = d?.fields?.Description ?? '';
        return { id, name, description: descr, category: title as DishCategory };
      })
    ).sort((a,b)=> String(a.name||'').localeCompare(String(b.name||''), 'ru'));

    return NextResponse.json({
      ok: true,
      dishes,
      debug: debug ? {
        how: 'is_same',
        date,
        base: BASE,
        menuId: menu.id,
        fieldsPresent: Object.keys(f),
        perCatCounts: Object.fromEntries(CAT_KEYS.map(({key}) => [key, perCatIds[key]?.length ?? 0]))
      } : undefined
    });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e.message || String(e) }, { status:500 });
  }
}
