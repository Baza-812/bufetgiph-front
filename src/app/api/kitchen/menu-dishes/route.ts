import { NextRequest, NextResponse } from 'next/server';

// ---- ENV (под ваши имена) ----
const API   = process.env.AIRTABLE_API_URL || 'https://api.airtable.com/v0';
const BASE  = process.env.AIRTABLE_BASE_ID || process.env.AIRTABLE_BASE || '';   // ваша переменная
const TOKEN = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN || '';  // ваша переменная

// ЯВНЫЕ tableId (желательно задать в .env, но не обязательно)
const MENU_TID   = (process.env.KITCHEN_MENU_TABLE_ID   || '').trim();   // tblXXXXXXXXXXXXXX
const DISHES_TID = (process.env.KITCHEN_DISHES_TABLE_ID || '').trim();   // tblYYYYYYYYYYYY

const MENU_LABEL   = 'Menu';
const DISHES_LABEL = 'Dishes';

// Какие ISO-поля пробуем в Menu (строки вида YYYY-MM-DD)
const ISO_FIELDS = (process.env.KITCHEN_MENU_DATEISO_FIELDS || 'DateISO,MenuDateISO,OrderDateISO')
  .split(',').map(s=>s.trim()).filter(Boolean);

// Категории в Menu (линк-поля на Dishes)
const CAT_KEYS: Array<{ key: string; title: 'Zapekanka'|'Salad'|'Soup'|'Main'|'Side' }> = [
  { key: 'Zapekanka', title: 'Zapekanka' },
  { key: 'Salad',     title: 'Salad'     },
  { key: 'Soup',      title: 'Soup'      },
  { key: 'Main',      title: 'Main'      },
  { key: 'Side',      title: 'Side'      },
];

// ---- Fail-fast: нет критичных env ----
function missingEnv() {
  const miss: string[] = [];
  if (!BASE)  miss.push('AIRTABLE_BASE_ID');
  if (!TOKEN) miss.push('AIRTABLE_API_KEY');
  return miss;
}

function authHeaders() {
  return { Authorization: `Bearer ${TOKEN}` };
}

function menuPath(suffix: string) {
  return `${MENU_TID ? MENU_TID : encodeURIComponent(MENU_LABEL)}/${suffix}`;
}
function dishesPath(suffix: string) {
  return `${DISHES_TID ? DISHES_TID : encodeURIComponent(DISHES_LABEL)}/${suffix}`;
}

async function at(path: string) {
  const r = await fetch(`${API}/${BASE}/${path}`, { headers: authHeaders(), cache: 'no-store' });
  const text = await r.text();
  return { ok: r.ok, status: r.status, json: text ? JSON.parse(text) : null, text };
}

// Формулы для поиска записи Menu на день
function buildFormulaByISO(dateISO: string) {
  const ors = ISO_FIELDS.map(f => `{${f}}='${dateISO.replace(/'/g, "''")}'`);
  return ors.length === 1 ? ors[0] : `OR(${ors.join(',')})`;
}
function f_IS_SAME(dateISO: string) {
  return `IS_SAME({Date}, DATETIME_PARSE('${dateISO}'), 'day')`;
}
function f_FMT(dateISO: string) {
  return `DATETIME_FORMAT({Date}, 'YYYY-MM-DD')='${dateISO}'`;
}
function f_EQ(dateISO: string) {
  return `{Date}='${dateISO}'`;
}

async function getMenuByDate(dateISO: string) {
  // 1) ISO-поля (строгое равенство строки)
  {
    const formula = encodeURIComponent(buildFormulaByISO(dateISO));
    const r = await at(`${menuPath(`?filterByFormula=${formula}&maxRecords=1`)}`);
    if (r.ok && r.json?.records?.[0]) return { rec: r.json.records[0], how: 'iso_fields', path: menuPath('') };
  }
  // 2) IS_SAME
  {
    const formula = encodeURIComponent(f_IS_SAME(dateISO));
    const r = await at(`${menuPath(`?filterByFormula=${formula}&maxRecords=1`)}`);
    if (r.ok && r.json?.records?.[0]) return { rec: r.json.records[0], how: 'is_same', path: menuPath('') };
  }
  // 3) DATETIME_FORMAT
  {
    const formula = encodeURIComponent(f_FMT(dateISO));
    const r = await at(`${menuPath(`?filterByFormula=${formula}&maxRecords=1`)}`);
    if (r.ok && r.json?.records?.[0]) return { rec: r.json.records[0], how: 'date_fmt', path: menuPath('') };
  }
  // 4) прямое равенство
  {
    const formula = encodeURIComponent(f_EQ(dateISO));
    const r = await at(`${menuPath(`?filterByFormula=${formula}&maxRecords=1`)}`);
    if (r.ok && r.json?.records?.[0]) return { rec: r.json.records[0], how: 'date_eq', path: menuPath('') };
  }

  return { rec: null as any, how: 'not_found' as const, path: menuPath('') };
}

async function getDishesByIds(ids: string[]) {
  if (!ids?.length) return [];
  const params = ids.map(id => `records[]=${encodeURIComponent(id)}`).join('&');
  const r = await at(`${dishesPath(`?${params}`)}`);
  if (!r.ok) return [];
  return r.json?.records ?? [];
}

export async function GET(req: NextRequest) {
  // fail-fast, чтобы сразу подсветить неподготовленную среду
  const miss = missingEnv();
  if (miss.length) {
    return NextResponse.json(
      { ok:false, error:`Missing env: ${miss.join(', ')}`, hint:'set these in Vercel → Environment Variables' },
      { status: 500 }
    );
  }

  try {
    const date  = req.nextUrl.searchParams.get('date') || '';
    const debug = req.nextUrl.searchParams.get('debug') === '1';
    if (!date) return NextResponse.json({ ok:false, error:'date required' }, { status:400 });

    const { rec: menu, how, path } = await getMenuByDate(date);

    if (!menu) {
      return NextResponse.json({
        ok: true,
        dishes: [],
        debug: debug ? {
          reason: 'menu_not_found',
          date,
          how,
          base: BASE,
          menuPathTried: path,
          menuTableId: MENU_TID || null,
          dishesTableId: DISHES_TID || null,
          isoFields: ISO_FIELDS,
        } : undefined,
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
        base: BASE,
        menuId: menu.id,
        menuPathUsed: path,
        menuTableId: MENU_TID || null,
        dishesTableId: DISHES_TID || null,
        fieldsPresent: Object.keys(f),
        perCatCounts: Object.fromEntries(CAT_KEYS.map(({ key }) => [key, perCatIds[key]?.length ?? 0])),
      } : undefined,
    });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e.message || String(e) }, { status:500 });
  }
}
