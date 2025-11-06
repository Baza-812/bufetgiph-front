import { NextRequest, NextResponse } from 'next/server';

const API   = process.env.AIRTABLE_API_URL || 'https://api.airtable.com/v0';
const BASE  = process.env.AIRTABLE_BASE || process.env.AIRTABLE_BASE_ID || '';
const TOKEN = process.env.AIRTABLE_TOKEN || process.env.AIRTABLE_API_KEY || '';

const DISHES_TID = (process.env.KITCHEN_DISHES_TABLE_ID || '').trim(); // tbl...
const MENU_TID   = (process.env.KITCHEN_MENU_TABLE_ID   || '').trim(); // tbl...

const DISHES = DISHES_TID ? DISHES_TID : 'Dishes';
const MENU   = MENU_TID   ? MENU_TID   : 'Menu';

function p(path: string) { return `${API}/${BASE}/${path}`; }

async function atGet(path: string) {
  const r = await fetch(p(path), {
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: 'no-store',
  });
  const text = await r.text();
  return { ok: r.ok, status: r.status, json: text ? JSON.parse(text) : null, text };
}

export async function GET(req: NextRequest) {
  if (!BASE || !TOKEN) {
    return NextResponse.json(
      { ok: false, error: 'Missing env: AIRTABLE_BASE/AIRTABLE_TOKEN' },
      { status: 500 }
    );
  }

  const id   = req.nextUrl.searchParams.get('id')   || '';
  const name = req.nextUrl.searchParams.get('name') || '';

  if (!id && !name) {
    return NextResponse.json({ ok: false, error: 'id or name required' }, { status: 400 });
  }

  try {
    // 1) Попробуем как Dishes recId
    if (id) {
      let r = await atGet(`${encodeURIComponent(DISHES)}/${encodeURIComponent(id)}`);
      if (r.ok && r.json?.id) {
        const f = r.json.fields || {};
        return NextResponse.json({
          ok: true,
          dish: {
            id: r.json.id,
            name: f.Name || '',
            description: f.Description || '',
            url: f.DishURL || '',
            howToCook: f.HowToCook || '',
            photos: Array.isArray(f.Photo) ? f.Photo : [],
          }
        });
      }

      // 2) Иначе как Menu recId → достаём linked Dish (поле "Dish")
      r = await atGet(`${encodeURIComponent(MENU)}/${encodeURIComponent(id)}`);
      if (r.ok && r.json?.id) {
        const f = r.json.fields || {};
        const linked = Array.isArray(f.Dish) ? f.Dish : (typeof f.Dish === 'string' ? [f.Dish] : []);
        const dishId = linked.find((x: any) => typeof x === 'string' && x.startsWith('rec'));
        if (dishId) {
          const r2 = await atGet(`${encodeURIComponent(DISHES)}/${encodeURIComponent(dishId)}`);
          if (r2.ok && r2.json?.id) {
            const f2 = r2.json.fields || {};
            return NextResponse.json({
              ok: true,
              dish: {
                id: r2.json.id,
                name: f2.Name || '',
                description: f2.Description || '',
                url: f2.DishURL || '',
                howToCook: f2.HowToCook || '',
                photos: Array.isArray(f2.Photo) ? f2.Photo : [],
              }
            });
          }
        }
        return NextResponse.json({ ok:false, error:'Dish not linked from Menu.Dish' }, { status:404 });
      }
    }

    // 3) По имени
    if (name) {
      const formula = encodeURIComponent(`{Name}='${name.replace(/'/g, "''")}'`);
      const r = await atGet(`${encodeURIComponent(DISHES)}?filterByFormula=${formula}&maxRecords=1`);
      if (r.ok && r.json?.records?.[0]) {
        const rec = r.json.records[0];
        const f = rec.fields || {};
        return NextResponse.json({
          ok: true,
          dish: {
            id: rec.id,
            name: f.Name || '',
            description: f.Description || '',
            url: f.DishURL || '',
            howToCook: f.HowToCook || '',
            photos: Array.isArray(f.Photo) ? f.Photo : [],
          }
        });
      }
    }

    return NextResponse.json({ ok:false, error:'Dish not found by id (Dish or Menu) or by name' }, { status:404 });
  } catch (e: any) {
    return NextResponse.json({ ok:false, error: e.message || String(e) }, { status:500 });
  }
}
