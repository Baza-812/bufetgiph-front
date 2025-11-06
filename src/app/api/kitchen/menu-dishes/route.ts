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

async function at(path: string) {
  const r = await fetch(`${API}/${BASE}/${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: 'no-store',
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, json: text ? JSON.parse(text) : null, text };
}

/** Основная формула: точное совпадение дня по полю Date (без времени) */
function buildFormulaByDate(dateISO: string) {
  // Срабатывает независимо от TZ/формата
  return encodeURIComponent(
    `IS_SAME({Date}, DATETIME_PARSE('${dateISO}'), 'day')`
  );
}

/** Поиск записи Menu на заданную дату */
async function getMenuByDate(dateISO: string) {
  // 1) Надёжный путь — IS_SAME
  let r = await at(`Menu?filterByFormula=${buildFormulaByDate(dateISO)}&maxRecords=1`);
  if (r.ok && r.json?.records?.[0]) return { rec: r.json.records[0], how: 'is_same' as const };

  // 2) Запасной — форматированием в YYYY-MM-DD
  r = await at(`Menu?filterByFormula=${encodeURIComponent(`DATETIME_FORMAT({Date}, 'YYYY-MM-DD')='${dateISO}'`)}&maxRecords=1`);
  if (r.ok && r.json?.records?.[0]) return { rec: r.json.records[0], how: 'date_fmt' as const };

  // 3) Последний шанс — прямое равенство (если вдруг поле действительно хранится как строка даты)
  r = await at(`Menu?filterByFormula=${encodeURIComponent(`{Date}='${dateISO}'`)}&maxRecords=1`);
  if (r.ok && r.json?.records?.[0]) return { rec: r.json.records[0], how: 'date_eq' as const };

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
        debug: debug ? { reason: 'menu_not_found', how, date, base: BASE } : undefined,
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
