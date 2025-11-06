export async function GET() {
  const API   = process.env.AIRTABLE_API_URL || 'https://api.airtable.com/v0';
  const BASE  = process.env.AIRTABLE_BASE!;
  const TOKEN = process.env.AIRTABLE_TOKEN!;

  const MENU_TID   = (process.env.KITCHEN_MENU_TABLE_ID   || '').trim();
  const DISHES_TID = (process.env.KITCHEN_DISHES_TABLE_ID || '').trim();

  const menuPath   = `${API}/${BASE}/${MENU_TID ? MENU_TID : 'Menu'}?maxRecords=1`;
  const dishesPath = `${API}/${BASE}/${DISHES_TID ? DISHES_TID : 'Dishes'}?maxRecords=1`;

  async function ping(url: string) {
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` }, cache:'no-store' });
      return { ok: r.ok, status: r.status, body: await r.text() };
    } catch (e:any) {
      return { ok:false, status: 0, body: String(e) };
    }
  }

  const menuRes   = await ping(menuPath);
  const dishesRes = await ping(dishesPath);

  return new Response(JSON.stringify({
    ok: menuRes.ok && dishesRes.ok,
    base: BASE,
    usingTableIds: { menu: !!MENU_TID, dishes: !!DISHES_TID },
    menu:   { path: menuPath,   ...menuRes },
    dishes: { path: dishesPath, ...dishesRes },
  }), { headers: { 'content-type': 'application/json' }});
}
