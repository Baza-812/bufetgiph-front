import { NextRequest, NextResponse } from 'next/server';

const API = process.env.AIRTABLE_API_URL || 'https://api.airtable.com/v0';
const BASE = process.env.AIRTABLE_BASE!;
const TOKEN = process.env.AIRTABLE_TOKEN!;

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

/** Попытаться понять блюдо из записи Menu/{menuRecId} */
async function tryDishFromMenu(menuRecId: string, dishNameHint?: string) {
  const r = await atGet(`Menu/${encodeURIComponent(menuRecId)}`);
  if (!r.ok) return null;

  const f = r.json?.fields || {};
  // 1) самые вероятные поля-ссылки на блюдо
  const candidateFields = (process.env.KITCHEN_MENU_DISH_FIELD_LIST || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const defaultCandidates = [
    'Dish','Dishes','DishId','DishID','DishRecId','DishRecordId','Dish (linked)','Linked Dish',
    // категории как линк-поля:
    'Zapekanka','Salad','Soup','Main','Side',
  ];

  const fieldsToCheck = [...candidateFields, ...defaultCandidates];

  // собрать все recID из перечисленных полей
  const found: string[] = [];
  for (const key of fieldsToCheck) {
    const v = f[key];
    if (!v) continue;
    if (typeof v === 'string' && v.startsWith('rec')) found.push(v);
    else if (Array.isArray(v)) {
      for (const x of v) if (typeof x === 'string' && x.startsWith('rec')) found.push(x);
    }
  }

  if (found.length === 0) return null;

  // если один кандидат — готово
  if (found.length === 1 && !dishNameHint) return found[0];

  // если несколько — попробуем выбрать по имени
  if (dishNameHint) {
    const safeHint = dishNameHint.toLowerCase().trim();
    for (const id of found) {
      const d = await atGet(`Dishes/${encodeURIComponent(id)}`);
      if (!d.ok) continue;
      const name = (d.json?.fields?.Name || '').toLowerCase().trim();
      if (name === safeHint) return id;
    }
    // мягкое совпадение (contains)
    for (const id of found) {
      const d = await atGet(`Dishes/${encodeURIComponent(id)}`);
      if (!d.ok) continue;
      const name = (d.json?.fields?.Name || '').toLowerCase();
      if (name.includes(safeHint)) return id;
    }
  }

  // иначе берём первый
  return found[0];
}

function normalizeStr(s: string) {
  return s.toLowerCase().replace(/[.,;:!?"'«»(){}\[\]/\\|+=_*^%$#@~`<>-]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function searchDishByName(name: string) {
  if (!name) return null;
  const exact = name.replace(/'/g, "''");
  // 1) exact
  {
    const r = await atGet(`Dishes?filterByFormula=${encodeURIComponent(`{Name}='${exact}'`)}&maxRecords=1`);
    if (r.ok && r.json?.records?.[0]) return r.json.records[0];
  }
  // 2) contains (LOWER)
  {
    const r = await atGet(
      `Dishes?filterByFormula=${encodeURIComponent(`SEARCH(LOWER('${exact}'), LOWER({Name}))`)}&maxRecords=1`
    );
    if (r.ok && r.json?.records?.[0]) return r.json.records[0];
  }
  // 3) fuzzy (нормализуем запрос)
  const fuzzy = normalizeStr(name).replace(/'/g, "''");
  if (fuzzy) {
    const r = await atGet(
      `Dishes?filterByFormula=${encodeURIComponent(`SEARCH(LOWER('${fuzzy}'), LOWER({Name}))`)}&maxRecords=1`
    );
    if (r.ok && r.json?.records?.[0]) return r.json.records[0];
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const id   = req.nextUrl.searchParams.get('id') || '';   // может быть Menu recId или Dish recId
    const name = req.nextUrl.searchParams.get('name') || ''; // подсказка

    if (!id && !name) {
      return NextResponse.json({ ok:false, error:'id or name required' }, { status: 400 });
    }

    let dishRec: any | null = null;

    // 1) Сначала считаем, что это DishID
    if (id) {
      try {
        dishRec = await getDishById(id);
      } catch (e: any) {
        if (e?.status !== 404) throw e; // иная ошибка — пробрасываем
        // 2) Если 404 — пробуем трактовать id как Menu/{id} и достать линк на блюдо
        const dishIdFromMenu = await tryDishFromMenu(id, name);
        if (dishIdFromMenu) {
          dishRec = await getDishById(dishIdFromMenu);
        }
      }
    }

    // 3) Если всё ещё нет — ищем в Dishes по имени
    if (!dishRec && name) {
      const byName = await searchDishByName(name);
      if (byName) dishRec = await getDishById(byName.id);
    }

    if (!dishRec) {
      return NextResponse.json({ ok:false, error:'Dish not found by id (Dish or Menu), or by name' }, { status: 404 });
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
