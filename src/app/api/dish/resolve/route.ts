import { NextRequest, NextResponse } from 'next/server';

const API = process.env.AIRTABLE_API_URL || 'https://api.airtable.com/v0';
const BASE = process.env.AIRTABLE_BASE!;
const TOKEN = process.env.AIRTABLE_TOKEN!;

// Проверяем, что запись существует в Dishes
async function tryDish(id: string) {
  const r = await fetch(`${API}/${BASE}/Dishes/${id}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: 'no-store',
  });
  if (r.ok) return id;
  return null;
}

// Пытаемся прочитать запись из "кандидатных" таблиц и достать оттуда линк на блюдо
async function tryViaTables(anyId: string) {
  const guessTables = (
    process.env.KITCHEN_DISH_LOOKUP_TABLES ??
    // Можно расширять по месту
    'Menu,Menu Items,Meal Boxes,Order Lines,Menu Records,Items'
  ).split(',').map(x => x.trim()).filter(Boolean);

  const dishLikeFields = [
    'Dish','Dishes','DishId','DishID','DishRecId','DishRecordId','Dish (linked)','Dish (from Dishes)','Main Dish','Linked Dish'
  ];

  for (const tbl of guessTables) {
    const r = await fetch(`${API}/${BASE}/${encodeURIComponent(tbl)}/${anyId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      cache: 'no-store',
    });
    if (!r.ok) continue;
    const j = await r.json();
    const f = j.fields || {};
    // перебираем поля, ищем rec…
    for (const key of dishLikeFields) {
      const v = f[key];
      if (typeof v === 'string' && v.startsWith('rec')) return v;
      if (Array.isArray(v) && v[0] && typeof v[0] === 'string' && v[0].startsWith('rec')) return v[0];
    }
    // на всякий случай пробежимся по всем полям
    for (const [_, v] of Object.entries(f)) {
      if (typeof v === 'string' && v.startsWith('rec')) return v;
      if (Array.isArray(v) && v[0] && typeof v[0] === 'string' && v[0].startsWith('rec')) return v[0];
    }
  }
  return null;
}

// Фолбэк: поиск в Dishes по Name
async function tryByName(name: string) {
  if (!name) return null;
  const safe = name.replace(/'/g, "''");
  const formula = encodeURIComponent(`{Name}='${safe}'`);
  const r = await fetch(`${API}/${BASE}/Dishes?filterByFormula=${formula}&maxRecords=1`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: 'no-store',
  });
  if (!r.ok) return null;
  const j = await r.json();
  const rec = j.records?.[0];
  return rec?.id ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const anyId = req.nextUrl.searchParams.get('anyId') || '';
    const name  = req.nextUrl.searchParams.get('name')  || '';
    if (!anyId && !name) return NextResponse.json({ ok:false, error:'anyId or name required' }, { status: 400 });

    // 1) вдруг это уже DishID
    if (anyId) {
      const direct = await tryDish(anyId);
      if (direct) return NextResponse.json({ ok:true, dishId: direct, via: 'direct' });

      // 2) попробуем через кандидатные таблицы (вытянуть линк на блюдо)
      const via = await tryViaTables(anyId);
      if (via) return NextResponse.json({ ok:true, dishId: via, via: 'linked' });
    }

    // 3) крайний случай — поиск по имени
    if (name) {
      const byName = await tryByName(name);
      if (byName) return NextResponse.json({ ok:true, dishId: byName, via: 'name' });
    }

    return NextResponse.json({ ok:false, error:'dish not resolvable' }, { status: 404 });
  } catch (e:any) {
    return NextResponse.json({ ok:false, error: e.message || String(e) }, { status: 500 });
  }
}
