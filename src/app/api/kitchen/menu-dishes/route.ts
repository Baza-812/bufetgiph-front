import { NextRequest, NextResponse } from 'next/server';

const API   = process.env.AIRTABLE_API_URL || 'https://api.airtable.com/v0';
const BASE  = process.env.AIRTABLE_BASE!;
const TOKEN = process.env.AIRTABLE_TOKEN!;

/** Категории меню и соответствующие ключи в таблице Menu */
const CAT_KEYS: Array<{ key: string; title: 'Zapekanka'|'Salad'|'Soup'|'Main'|'Side' }> = [
  { key: 'Zapekanka', title: 'Zapekanka' },
  { key: 'Salad',     title: 'Salad'     },
  { key: 'Soup',      title: 'Soup'      },
  { key: 'Main',      title: 'Main'      },
  { key: 'Side',      title: 'Side'      },
];

/** Поля с уже сформированной ISO-датой (строка YYYY-MM-DD) — можно переопределить через env */
function isoDateFields(): string[] {
  const fromEnv = (process.env.KITCHEN_MENU_DATEISO_FIELDS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  const defaults = ['DateISO', 'MenuDateISO', 'OrderDateISO'];
  return [...fromEnv, ...defaults].filter((v, i, a) => v && a.indexOf(v) === i);
}

async function at(path: string) {
  const r = await fetch(`${API}/${BASE}/${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: 'no-store',
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, json: text ? JSON.parse(text) : null, text };
}

/** Формула по ISO-полям: OR({DateISO}='2025-11-07', {MenuDateISO}='…', …) */
function buildFormulaByISO(dateISO: string) {
  const flds = isoDateFields();
  const ors = flds.map(f => `{${f}}='${dateISO.replace(/'/g, "''")}'`);
  if (!ors.length) return '';
  return encodeURIComponent(ors.length === 1 ? ors[0] : `OR(${ors.join(',')})`);
}

/** Резервные формулы по полю Date (тип Date, без времени) */
function buildFormulaByDate_IS_SAME(dateISO: string) {
  return encodeURIComponent(`IS_SAME({Date}, DATETIME_PARSE('${dateISO}'), 'day')`);
}
function buildFormulaByDate_FMT(dateISO: string) {
  return encodeURIComponent(`DATETIME_FORMAT({Date}, 'YYYY-MM-DD')='${dateISO}'`);
}
function buildFormulaByDate_EQ(dateISO: string) {
  return encodeURIComponent(`{Date}='${dateISO}'`);
}

/** Поиск записи Menu на заданную дату */
async function getMenuByDate(dateISO: string) {
  // 1) По ISO-полям (строгое равенство строки)
  const iso = buildFormulaByISO(dateISO);
  if (iso) {
    let r = await at(`Menu?filterByFormula=${iso}&maxRecords=1`);
    if (r.ok && r.json?.records?.[0]) return { rec: r.json.records[0], how: 'iso_fields' as const };
  }

  // 2) Резерв — по Date
  {
    let r = await at(`Menu?filterByFormula=${buildFormulaByDate_IS_SAME(dateISO)}&maxRecords=1`);
    if (r.ok && r.json?.records?.[0]) return { rec: r.json.records[0], how: 'is_same' as const };
  }
  {
    let r = await at(`Menu?filterByFormula=${buildFormulaByDate_FMT(dateISO)}&maxRecords=1`);
    if (r.ok && r.json?.records?.[0]) return { rec: r.json.records[0], how: 'date_fmt' as const };
  }
  {
    let r = await at(`Menu?filterByFormula=${buildFormulaByDate_EQ(dateISO)}&maxRecords=1`);
    if (r.ok && r.json?.records?.[0]) return { rec: r.json.records[0], how: 'date_eq' as const };
  }

  return { rec: null, how: 'not_found' as const };
}

/** Забрать записи Dishes по массиву recID */
async function getDishesByIds(ids: string[]) {
  if (!ids || !ids.length) return [];
  const params = ids.map(id => `records[]=${encodeURIComponent(id)}`).join('&');
  const r = await at(`Dishes?${params}`);
  if (!r.ok) return [];
  return r.json?.records ?? [];
}

export async function GET(req: NextRequest) {
  try {
    const date  = req.nextUrl.searchParams.get('date') || '';
    const debug = req.nextUrl.searchParams.get('debug') === '1';

    if (!date) {
      return NextResponse.json({ ok: false, error: 'date required' }, { status: 400 });
    }

    const { rec: menu, how } = await getMenuByDate(date);

    if (!menu) {
      return NextResponse.json({
        ok: true,
        dishes: [],
        debug: debug ? {
          reason: 'menu_not_found',
          how,
          date,
          base: BASE,
          isoFieldsTried: isoDateFields(),
        } : undefined,
      });
    }

    const f = menu.fields || {};
    const perCatIds: Record<string, string[]> = {};
    for (const { key } of CAT_KEYS) {
      const v = f[key];
      if (Array.isArray(v)) {
        perCatIds[key] = v.filter((x: any) => typeof x === 'string' && x.startsWith('rec'));
      } else if (typeof v === 'string' && v.startsWith('rec')) {
        perCatIds[key] = [v];
      } else {
        perCatIds[key] = [];
      }
    }

    const allIds = [...new Set(Object.values(perCatIds).flat())];
    const recs   = await getDishesByIds(allIds);
    const byId: Record<string, any> = {};
    for (const r of recs) byId[r.id] = r;

    const dishes = CAT_KEYS.flatMap(({ key, title }) =>
      (perCatIds[key] || []).map(id => {
        const d = byId[id];
        const name  = d?.fields?.Name ?? 'Без названия';
        const descr = d?.fields?.Description ?? '';
        return { id, name, description: descr, category: title };
      })
    );

    return NextResponse.json({
      ok: true,
      dishes,
      debug: debug ? {
        how,
        date,
        menuId: menu.id,
        fieldsPresent: Object.keys(f),
        perCatCounts: Object.fromEntries(CAT_KEYS.map(({ key }) => [key, perCatIds[key]?.length ?? 0])),
        base: BASE,
      } : undefined,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || String(e) }, { status: 500 });
  }
}
