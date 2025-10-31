import { NextRequest, NextResponse } from 'next/server';

const API = process.env.AIRTABLE_API_URL || 'https://api.airtable.com/v0';
const BASE = process.env.AIRTABLE_BASE!;
const TOKEN = process.env.AIRTABLE_TOKEN!;

// Таблицы, через которые чаще всего можно дотянуться до блюда
function lookupTables(): string[] {
  const fromEnv = (process.env.KITCHEN_DISH_LOOKUP_TABLES || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (fromEnv.length) return fromEnv;

  // дефолтный список-кроссфит (можете сузить под свой бэйс)
  return [
    'Menu',
    'Menu Items',
    'MenuItems',
    'Meal Boxes',
    'Order Lines',
    'Menu Records',
    'Items',
    'MenuLines',
    'Daily Menu',
    'Menu Dishes',
  ];
}

async function fetchAirtableJson(url: string, init?: RequestInit) {
  const r = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(init?.headers || {}) },
    cache: 'no-store',
  });
  return { ok: r.ok, status: r.status, text: await r.text() };
}

async function getDishRecordById(id: string) {
  const { ok, status, text } = await fetchAirtableJson(`${API}/${BASE}/Dishes/${id}`);
  if (!ok) {
    const err: any = new Error(`Airtable ${status} ${text}`);
    err.status = status;
    throw err;
  }
  return JSON.parse(text);
}

async function tryResolveDishIdViaTables(anyId: string): Promise<string | null> {
  const tables = lookupTables();
  const dishFields = [
    'Dish','Dishes','DishId','DishID','DishRecId','DishRecordId',
    'Dish (linked)','Dish (from Dishes)','Main Dish','Linked Dish',
  ];

  for (const tbl of tables) {
    const { ok, text } = await fetchAirtableJson(`${API}/${BASE}/${encodeURIComponent(tbl)}/${anyId}`);
    if (!ok) continue;
    const rec = JSON.parse(text);
    const f = rec.fields || {};

    // Сначала пробуем «типичные» поля
    for (const k of dishFields) {
      const v = f[k];
      if (typeof v === 'string' && v.startsWith('rec')) return v;
      if (Array.isArray(v) && typeof v[0] === 'string' && v[0].startsWith('rec')) return v[0];
    }
    // Затем — перебор всех полей на предмет rec-строки
    for (const v of Object.values(f)) {
      if (typeof v === 'string' && v.startsWith('rec')) return v;
      if (Array.isArray(v) && typeof v[0] === 'string' && v[0].startsWith('rec')) return v[0];
    }
  }
  return null;
}

async function tryResolveDishIdByName(name: string): Promise<string | null> {
  if (!name) return null;
  const safe = name.replace(/'/g, "''");
  const formula = encodeURIComponent(`{Name}='${safe}'`);
  const { ok, text } = await fetchAirtableJson(`${API}/${BASE}/Dishes?filterByFormula=${formula}&maxRecords=1`);
  if (!ok) return null;
  const j = JSON.parse(text);
  const rec = j.records?.[0];
  return rec?.id ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const id   = req.nextUrl.searchParams.get('id') || '';   // может быть не-Dishes rec
    const name = req.nextUrl.searchParams.get('name') || ''; // фолбэк

    if (!id && !name) {
      return NextResponse.json({ ok: false, error: 'id or name required' }, { status: 400 });
    }

    let dishRec: any | null = null;

    // 1) Пытаемся как будто это уже DishID
    if (id) {
      try {
        dishRec = await getDishRecordById(id);
      } catch (e: any) {
        // если 404 — пробуем резолвить через связки
        if (e?.status === 404) {
          const viaLinked = await tryResolveDishIdViaTables(id);
          if (viaLinked) {
            dishRec = await getDishRecordById(viaLinked);
          } else {
            // последняя попытка — поиск по имени
            const viaName = await tryResolveDishIdByName(name);
            if (viaName) {
              dishRec = await getDishRecordById(viaName);
            } else {
              throw new Error('Dish not found by id, links, or name');
            }
          }
        } else {
          throw e;
        }
      }
    }

    // 2) Если id не было, но есть name — пробуем по имени
    if (!dishRec && name) {
      const viaName = await tryResolveDishIdByName(name);
      if (viaName) {
        dishRec = await getDishRecordById(viaName);
      }
    }

    if (!dishRec) {
      return NextResponse.json({ ok:false, error: 'Dish not resolvable' }, { status: 404 });
    }

    const f = dishRec.fields || {};
    const dish = {
      id: dishRec.id as string,
      name: f.Name as string | undefined,
      description: f.Description as string | undefined,
      dishURL: f.DishURL as string | undefined,
      howToCook: f.HowToCook as string | undefined,
      photos: Array.isArray(f.Photo) ? f.Photo.map((p:any)=>({ url:p.url, filename:p.filename, id:p.id })) : [],
    };

    return NextResponse.json({ ok: true, dish });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || String(e) }, { status: 500 });
  }
}
