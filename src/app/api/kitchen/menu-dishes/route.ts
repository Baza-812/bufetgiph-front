import { NextRequest, NextResponse } from 'next/server';

const API  = process.env.AIRTABLE_API_URL || 'https://api.airtable.com/v0';
const BASE = process.env.AIRTABLE_BASE!;
const TOKEN= process.env.AIRTABLE_TOKEN!;

// простая обёртка
async function at(path: string) {
  const r = await fetch(`${API}/${BASE}/${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: 'no-store',
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, json: text ? JSON.parse(text) : null, text };
}

/** Получить запись Menu по дате YYYY-MM-DD */
async function getMenuByDate(iso: string) {
  const filter = encodeURIComponent(`{Date}='${iso}'`);
  const r = await at(`Menu?filterByFormula=${filter}&maxRecords=1`);
  if (!r.ok || !r.json?.records?.[0]) return null;
  return r.json.records[0];
}

/** Забрать записи Dishes по массиву recID */
async function getDishesByIds(ids: string[]) {
  if (!ids || !ids.length) return [];
  // batches by records[]=...
  const params = ids.map(id => `records[]=${encodeURIComponent(id)}`).join('&');
  const r = await at(`Dishes?${params}`);
  if (!r.ok) return [];
  return r.json.records ?? [];
}

export async function GET(req: NextRequest) {
  try {
    const date = req.nextUrl.searchParams.get('date') || '';
    if (!date) return NextResponse.json({ ok:false, error:'date required' }, { status:400 });

    // 1) Находим запись меню на дату
    const menu = await getMenuByDate(date);
    if (!menu) return NextResponse.json({ ok:true, dishes: [] });

    const f = menu.fields || {};
    // Категории, где лежат ЛИНКИ на блюда:
    const CAT_KEYS: Array<{key: string; title: string}> = [
      { key: 'Zapekanka', title: 'Zapekanka' },
      { key: 'Salad',     title: 'Salad'     },
      { key: 'Soup',      title: 'Soup'      },
      { key: 'Main',      title: 'Main'      },
      { key: 'Side',      title: 'Side'      },
    ];

    // 2) Собираем все dishIds по категориям
    const perCatIds: Record<string, string[]> = {};
    for (const { key } of CAT_KEYS) {
      const v = f[key];
      if (Array.isArray(v)) perCatIds[key] = v.filter((x:any)=> typeof x === 'string' && x.startsWith('rec'));
      else if (typeof v === 'string' && v.startsWith('rec')) perCatIds[key] = [v];
      else perCatIds[key] = [];
    }
    const allIds = [...new Set(Object.values(perCatIds).flat())];

    // 3) Тянем нужные блюда из Dishes одной пачкой
    const recs = await getDishesByIds(allIds);
    const byId: Record<string, any> = {};
    for (const r of recs) byId[r.id] = r;

    // 4) Формируем ровный ответ с dishId (id из Dishes)
    const dishes = CAT_KEYS.flatMap(({ key, title }) =>
      (perCatIds[key] || []).map(id => {
        const d = byId[id];
        const name = d?.fields?.Name ?? 'Без названия';
        const descr= d?.fields?.Description ?? '';
        return { id, name, description: descr, category: title };
      })
    );

    return NextResponse.json({ ok:true, dishes });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e.message || String(e) }, { status:500 });
  }
}
