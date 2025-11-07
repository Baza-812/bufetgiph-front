import { NextRequest, NextResponse } from 'next/server';

const API  = process.env.AIRTABLE_API_URL || 'https://api.airtable.com/v0';
const BASE = process.env.AIRTABLE_BASE!;
const TOKEN= process.env.AIRTABLE_TOKEN!;

function headers() {
  return { Authorization: `Bearer ${TOKEN}` };
}
async function atGet(path: string) {
  const r = await fetch(`${API}/${BASE}/${path}`, { headers: headers(), cache: 'no-store' });
  const text = await r.text();
  return { ok: r.ok, status: r.status, json: text ? JSON.parse(text) : null, text };
}

async function getDishById(dishId: string) {
  const r = await atGet(`Dishes/${encodeURIComponent(dishId)}`);
  if (!r.ok) {
    const err: any = new Error(`Airtable ${r.status} ${r.text}`);
    err.status = r.status;
    throw err;
  }
  return r.json;
}

/** Список возможных таблиц, где может жить "дневное меню" с recID */
function candidateMenuTables(): string[] {
  const fromEnv = (process.env.KITCHEN_MENU_TABLES || '')
    .split(',').map(s=>s.trim()).filter(Boolean);
  if (fromEnv.length) return fromEnv;

  // <-- добавьте/переименуйте под вашу базу по факту
  return [
    'Menu',
    'Daily Menu',
    'Menu Items',
    'MenuItems',
    'Menu Records',
    'Menu Dishes',
    'MenuDay',
    'Меню',           // на случай русских имён
    'Ежедневное меню'
  ];
}

/** Из записи меню (любой из candidateMenuTables) достать DishID */
async function extractDishFromMenuRecord(recJson: any, dishNameHint?: string): Promise<string | null> {
  const f = recJson?.fields || {};
  const customList = (process.env.KITCHEN_MENU_DISH_FIELD_LIST || '')
    .split(',').map(s=>s.trim()).filter(Boolean);

  const fieldsToCheck = [
    ...customList,
    // явная ссылка на блюдо
    'Dish','Dishes','DishId','DishID','DishRecId','DishRecordId','Dish (linked)','Linked Dish',
    // категории
    'Zapekanka','Salad','Soup','Main','Side',
    'Запеканка','Салат','Суп','Основное','Гарнир',
  ];

  const candidates: string[] = [];
  for (const key of fieldsToCheck) {
    const v = f[key];
    if (!v) continue;
    if (typeof v === 'string' && v.startsWith('rec')) candidates.push(v);
    else if (Array.isArray(v)) {
      for (const x of v) if (typeof x === 'string' && x.startsWith('rec')) candidates.push(x);
    }
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1 && !dishNameHint) return candidates[0];

  // если несколько — попробуем выбрать по имени
  if (dishNameHint) {
    const hint = dishNameHint.toLowerCase().trim();
    // точное
    for (const id of candidates) {
      const d = await atGet(`Dishes/${encodeURIComponent(id)}`);
      if (!d.ok) continue;
      const name = (d.json?.fields?.Name || '').toLowerCase().trim();
      if (name === hint) return id;
    }
    // contains
    for (const id of candidates) {
      const d = await atGet(`Dishes/${encodeURIComponent(id)}`);
      if (!d.ok) continue;
      const name = (d.json?.fields?.Name || '').toLowerCase();
      if (name.includes(hint)) return id;
    }
  }
  return candidates[0];
}

/** Попробовать трактовать id как RecID из одной из "меню-таблиц" */
async function tryDishFromAnyMenuTable(menuRecId: string, dishNameHint?: string): Promise<string | null> {
  for (const tbl of candidateMenuTables()) {
    const r = await atGet(`${encodeURIComponent(tbl)}/${encodeURIComponent(menuRecId)}`);
    if (!r.ok) continue; // в этой таблице такой rec нет
    const dishId = await extractDishFromMenuRecord(r.json, dishNameHint);
    if (dishId) return dishId;
  }
  return null;
}

function normalizeStr(s: string) {
  return s.toLowerCase().replace(/[.,;:!?"'«»(){}\[\]/\\|+=_*^%$#@~`<>-]/g, ' ').replace(/\s+/g, ' ').trim();
}
async function searchDishByName(name: string) {
  if (!name) return null;
  const exact = name.replace(/'/g, "''");
  // exact
  {
    const r = await atGet(`Dishes?filterByFormula=${encodeURIComponent(`{Name}='${exact}'`)}&maxRecords=1`);
    if (r.ok && r.json?.records?.[0]) return r.json.records[0];
  }
  // contains lower
  {
    const r = await atGet(`Dishes?filterByFormula=${encodeURIComponent(`SEARCH(LOWER('${exact}'), LOWER({Name}))`)}&maxRecords=1`);
    if (r.ok && r.json?.records?.[0]) return r.json.records[0];
  }
  // fuzzy
  const fuzzy = normalizeStr(name).replace(/'/g, "''");
  if (fuzzy) {
    const r = await atGet(`Dishes?filterByFormula=${encodeURIComponent(`SEARCH(LOWER('${fuzzy}'), LOWER({Name}))`)}&maxRecords=1`);
    if (r.ok && r.json?.records?.[0]) return r.json.records[0];
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const id   = req.nextUrl.searchParams.get('id') || '';   // может быть DishID ИЛИ RecID из таблицы меню
    const name = req.nextUrl.searchParams.get('name') || ''; // подсказка для выбора из нескольких линков

    if (!id && !name) {
      return NextResponse.json({ ok:false, error:'id or name required' }, { status: 400 });
    }

    let dishRec: any | null = null;

    // 1) Считаем, что это DishID
    if (id) {
      try {
        dishRec = await getDishById(id);
      } catch (e: any) {
        if (e?.status !== 404) throw e;
        // 2) Иначе пробуем трактовать id как RecID из любой "меню-таблицы"
        const viaMenu = await tryDishFromAnyMenuTable(id, name);
        if (viaMenu) {
          dishRec = await getDishById(viaMenu);
        }
      }
    }

    // 3) Если всё ещё пусто — ищем по имени
    if (!dishRec && name) {
      const byName = await searchDishByName(name);
      if (byName) dishRec = await getDishById(byName.id);
    }

    if (!dishRec) {
      return NextResponse.json({ ok:false, error:'Dish not found by id (Dish or any Menu table), or by name' }, { status: 404 });
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
    return NextResponse.json({ ok:true, dish });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e.message || String(e) }, { status: 500 });
  }
}
