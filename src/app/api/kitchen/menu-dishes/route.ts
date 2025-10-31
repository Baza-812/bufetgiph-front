import { NextRequest, NextResponse } from 'next/server';

const API  = process.env.AIRTABLE_API_URL || 'https://api.airtable.com/v0';
const BASE = process.env.AIRTABLE_BASE!;
const TOKEN= process.env.AIRTABLE_TOKEN!;

/** Как зовётся поле организации в Menu */
const ORG_FIELD = process.env.KITCHEN_MENU_ORG_FIELD || ''; // если известно точное имя — задай в .env

const CAT_KEYS: Array<{key: string; title: 'Zapekanka'|'Salad'|'Soup'|'Main'|'Side'}> = [
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

/** Сформировать filterByFormula под дату и (опц.) org */
function buildFormula(dateISO: string, org?: string) {
  const parts: string[] = [
    `DATETIME_FORMAT({Date}, 'YYYY-MM-DD')='${dateISO}'`
  ];
  if (org) {
    const candidates = [ORG_FIELD, 'Org', 'Organization', 'Organizations'].filter(Boolean);
    // Пробуем несколькими полями OR — чтобы не блокироваться, если точное имя нам неизвестно
    const orgOr = candidates.map(f => `{${f}}='${org.replace(/'/g, "''")}'`).join(', ');
    if (orgOr) parts.push(`OR(${orgOr})`);
  }
  return encodeURIComponent(parts.length > 1 ? `AND(${parts.join(',')})` : parts[0]);
}

/** Получить запись Menu на дату (и опц. org) */
async function getMenuByDate(dateISO: string, org?: string) {
  // 1) Поиск по дате (+ возможно org) через DATETIME_FORMAT
  let r = await at(`Menu?filterByFormula=${buildFormula(dateISO, org)}&maxRecords=1`);
  if (r.ok && r.json?.records?.[0]) return { rec: r.json.records[0], _how: 'date_fmt' };

  // 2) Фолбэк — без org вообще
  if (org) {
    r = await at(`Menu?filterByFormula=${buildFormula(dateISO)}&maxRecords=1`);
    if (r.ok && r.json?.records?.[0]) return { rec: r.json.records[0], _how: 'date_fmt_no_org' };
  }

  // 3) Крайний фолбэк — старое равенство (вдруг поле строгое date без времени)
  r = await at(`Menu?filterByFormula=${encodeURIComponent(`{Date}='${dateISO}'`)}&maxRecords=1`);
  if (r.ok && r.json?.records?.[0]) return { rec: r.json.records[0], _how: 'date_eq' };

  return { rec: null, _how: 'not_found' as const };
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
    const date = req.nextUrl.searchParams.get('date') || '';
    const org  = req.nextUrl.searchParams.get('org') || '';
    const debug= req.nextUrl.searchParams.get('debug') === '1';

    if (!date) return NextResponse.json({ ok:false, error:'date required' }, { status:400 });

    const { rec: menu, _how } = await getMenuByDate(date, org || undefined);

    if (!menu) {
      return NextResponse.json({
        ok: true,
        dishes: [],
        debug: debug ? { reason: 'menu_not_found', how: _how, date, org, base: BASE } : undefined
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
        const name = d?.fields?.Name ?? 'Без названия';
        const descr= d?.fields?.Description ?? '';
        return { id, name, description: descr, category: title };
      })
    );

    return NextResponse.json({
      ok: true,
      dishes,
      debug: debug ? {
        how: _how,
        date,
        org,
        menuId: menu.id,
        fieldsPresent: Object.keys(f),
        perCatCounts: Object.fromEntries(CAT_KEYS.map(({key}) => [key, perCatIds[key]?.length ?? 0])),
        base: BASE
      } : undefined
    });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e.message || String(e) }, { status:500 });
  }
}
