import { NextRequest, NextResponse } from 'next/server';

// ---- ENV (ваши имена) ----
const API   = process.env.AIRTABLE_API_URL || 'https://api.airtable.com/v0';
const BASE  = process.env.AIRTABLE_BASE_ID || process.env.AIRTABLE_BASE || '';   // ваша переменная
const TOKEN = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN || '';  // ваша переменная

// ЯВНЫЕ tableId (не обязательно, но желательны)
const MENU_TID   = (process.env.KITCHEN_MENU_TABLE_ID   || '').trim();   // tblXXXXXXXXXXXXXX
const DISHES_TID = (process.env.KITCHEN_DISHES_TABLE_ID || '').trim();   // tblYYYYYYYYYYYY

const MENU_LABEL   = 'Menu';
const DISHES_LABEL = 'Dishes';

// ISO-поля для даты (если есть DateISO и т.п.)
const ISO_FIELDS = (process.env.KITCHEN_MENU_DATEISO_FIELDS || 'DateISO,MenuDateISO,OrderDateISO')
  .split(',').map(s=>s.trim()).filter(Boolean);

// --- Категории ---
type Cat =
  | 'Zapekanka'
  | 'Salad'
  | 'Soup'
  | 'Main'
  | 'Side'
  | 'Pastry'
  | 'Fruit'
  | 'Drink';

// Базовый порядок секций: сначала привычные 5, затем Pastry/Fruit/Drink.
// Любые остальные встреченные категории пойдут в конец по алфавиту.
const CANON_ORDER: Cat[] = [
  'Zapekanka','Salad','Soup','Main','Side','Pastry','Fruit','Drink'
] as const;

function missingEnv() {
  const miss: string[] = [];
  if (!BASE)  miss.push('AIRTABLE_BASE_ID');
  if (!TOKEN) miss.push('AIRTABLE_API_KEY');
  return miss;
}

function authHeaders() { return { Authorization: `Bearer ${TOKEN}` }; }
function menuPath(suffix: string)   { return `${MENU_TID   ? MENU_TID   : encodeURIComponent(MENU_LABEL)}/${suffix}`; }
function dishesPath(suffix: string) { return `${DISHES_TID ? DISHES_TID : encodeURIComponent(DISHES_LABEL)}/${suffix}`; }

async function at(path: string) {
  const r = await fetch(`${API}/${BASE}/${path}`, { headers: authHeaders(), cache: 'no-store' });
  const text = await r.text();
  return { ok: r.ok, status: r.status, json: text ? JSON.parse(text) : null, text };
}

// ---- Формулы поиска по дате ----
function buildFormulaByISO(dateISO: string) {
  const ors = ISO_FIELDS.map(f => `{${f}}='${dateISO.replace(/'/g, "''")}'`);
  return ors.length === 1 ? ors[0] : `OR(${ors.join(',')})`;
}
function f_IS_SAME(dateISO: string) { return `IS_SAME({Date}, DATETIME_PARSE('${dateISO}'), 'day')`; }
function f_FMT(dateISO: string)     { return `DATETIME_FORMAT({Date}, 'YYYY-MM-DD')='${dateISO}'`; }
function f_EQ(dateISO: string)      { return `{Date}='${dateISO}'`; }

/** Вытащить ВСЕ записи Menu за день (с пагинацией) по формуле */
async function getAllMenuRecordsByFormula(formula: string, max = 1000) {
  let recs: any[] = [];
  let offset: string | undefined;
  do {
    const q = `?filterByFormula=${encodeURIComponent(formula)}&pageSize=100${offset ? `&offset=${encodeURIComponent(offset)}` : ''}`;
    const r = await at(menuPath(q));
    if (!r.ok) return { ok:false, status:r.status, text:r.text, records:recs };
    recs = recs.concat(r.json?.records || []);
    offset = r.json?.offset;
  } while (offset && recs.length < max);
  return { ok:true, status:200, text:'', records:recs };
}

/** Главная функция: достать записи Menu за дату (все), пробуя несколько формул по очереди */
async function getMenuRecordsForDate(dateISO: string) {
  // 1) ISO-поля (если есть)
  if (ISO_FIELDS.length) {
    const r = await getAllMenuRecordsByFormula(buildFormulaByISO(dateISO));
    if (r.ok && r.records.length) return { records: r.records, how: 'iso_fields', path: menuPath('') };
  }
  // 2) IS_SAME
  {
    const r = await getAllMenuRecordsByFormula(f_IS_SAME(dateISO));
    if (r.ok && r.records.length) return { records: r.records, how: 'is_same', path: menuPath('') };
  }
  // 3) FORMAT
  {
    const r = await getAllMenuRecordsByFormula(f_FMT(dateISO));
    if (r.ok && r.records.length) return { records: r.records, how: 'date_fmt', path: menuPath('') };
  }
  // 4) EQ
  {
    const r = await getAllMenuRecordsByFormula(f_EQ(dateISO));
    if (r.ok && r.records.length) return { records: r.records, how: 'date_eq', path: menuPath('') };
  }
  return { records: [] as any[], how: 'not_found' as const, path: menuPath('') };
}

/** Забрать записи Dishes по массиву recID (batch) */
async function getDishesByIds(ids: string[]) {
  if (!ids?.length) return [];
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const params = chunk.map(id => `records[]=${encodeURIComponent(id)}`).join('&');
    const r = await at(dishesPath(`?${params}`));
    if (!r.ok) continue;
    out.push(...(r.json?.records || []));
  }
  return out;
}

/** Нормализация названий категорий из Menu.Category */
function normalizeCategory(raw: any): Cat {
  const s = String(raw ?? '').trim();

  // Если уже ровно одна из наших категорий — возвращаем как есть
  if ((CANON_ORDER as readonly string[]).includes(s)) return s as Cat;

  // Нормализация: нижний регистр, без пробелов/дефисов
  const n = s.toLowerCase().replace(/[\s\-]+/g, '');

  // рус/англ варианты
  if (n.includes('zapek')) return 'Zapekanka';
  if (n === 'salad' || n.includes('salat')) return 'Salad';
  if (n === 'soup'  || n.includes('sup'))   return 'Soup';
  if (n === 'side'  || n.includes('garn') || n.includes('гарнир')) return 'Side';

  // Новые категории:
  if (n.includes('pastry') || n.includes('выпеч') || n.includes('пирож')) return 'Pastry';
  if (n.includes('fruit')  || n.includes('фрукт') || n === 'banana' || n === 'банан') return 'Fruit';
  if (n.includes('drink')  || n.includes('napit') || n.includes('напит') || n.includes('сок')) return 'Drink';

  // По умолчанию — Main
  return 'Main';
}

export async function GET(req: NextRequest) {
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

    // 1) Тянем ВСЕ строки Menu на дату
    const { records: menuRows, how, path } = await getMenuRecordsForDate(date);
    if (!menuRows.length) {
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

    // 2) Собираем пары (dishId, category, displayName, description) из Menu
    type Pair = { id: string; category: Cat; displayName?: string; description?: string };
    const pairs: Pair[] = [];
    for (const row of menuRows) {
      const f = row.fields || {};
      const link = f.Dish;                 // линк на блюдо (строка rec… или массив)
      const cat  = normalizeCategory(f.Category);

      // фолбэки имени/описания из строки Menu
      const displayName =
        f['Dish Name (from Dish)'] ||
        f['Item'] ||
        undefined;
      const description = f['Description (from Dish)'] || undefined;

      const pushId = (id: any) => {
        if (typeof id === 'string' && id.startsWith('rec')) {
          pairs.push({ id, category: cat, displayName, description });
        }
      };

      if (Array.isArray(link)) { link.forEach(pushId); }
      else { pushId(link); }
    }

    const uniqueIds = [...new Set(pairs.map(p => p.id))];

    // 3) Пакетно тянем Dishes и делаем словарь
    const dishRecs = await getDishesByIds(uniqueIds);
    const byId: Record<string, any> = {};
    for (const r of dishRecs) byId[r.id] = r;

    // 4) Формируем ответ (строгие строки)
    const dishes = pairs.map(p => {
      const d = byId[p.id];
      const nameFromDishes = d?.fields?.Name;
      const nameRaw = (nameFromDishes ?? p.displayName ?? 'Без названия');
      const name = String(nameRaw);
      const descr = String(d?.fields?.Description ?? p.description ?? '');
      return { id: p.id, name, description: descr, category: p.category as Cat };
    });

    // 4.5) Фильтрация только базовых категорий для поварского портала
let filtered = dishes.filter(d => ALLOWED_CATS.includes(d.category as Cat));


   // 5) Сортировка
const catRank = (c: string) => {
  const idx = ALLOWED_CATS.indexOf(c as Cat);
  return idx === -1 ? 999 : idx;
};
filtered.sort((a, b) => {
  const ra = catRank(a.category);
  const rb = catRank(b.category);
  if (ra !== rb) return ra - rb;
  const an = String(a.name || '');
  const bn = String(b.name || '');
  return an.localeCompare(bn, 'ru', { sensitivity: 'base' });
});

// 6) Ответ
return NextResponse.json({
  ok: true,
  dishes: filtered,
  debug: debug ? {
    how,
    date,
    base: BASE,
    menuCount: menuRows.length,
    menuPathUsed: path,
    menuTableId: MENU_TID || null,
    dishesTableId: DISHES_TID || null,
    categoriesFound: Array.from(new Set(filtered.map(d => d.category))),
  } : undefined,
});
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e.message || String(e) }, { status:500 });
  }
}
