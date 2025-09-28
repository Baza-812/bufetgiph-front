import { NextRequest, NextResponse } from 'next/server';
import { base, TBL, selectAll } from '@/lib/airtable';
import { kitchenDailyHTML } from '@/lib/templates/kitchenDaily';
import { renderPdfFromHtml } from '@/lib/pdf';
import { put } from '@vercel/blob';
import Airtable from 'airtable';


// NB: этот хэндлер работает в Node runtime (для puppeteer)
export const runtime = 'nodejs';

type Body = {
  recipientId: string;               // ReportRecipients recordId
  date?: string;                     // YYYY-MM-DD; если нет — возьмём "завтра"
};

export async function POST(req: NextRequest) {
  try {
    const { recipientId, date } = (await req.json()) as { recipientId?: string; date?: string };
    if (!recipientId) {
      return NextResponse.json({ ok: false, error: "recipientId required" }, { status: 400 });
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ ok: false, error: "Missing BLOB_READ_WRITE_TOKEN env" }, { status: 500 });
    }

    const dateISO = date || nextDayISO();

    // 1) получатель
    const rr = await base(TBL.REPORT_RECIPIENTS).find(recipientId).catch((e) => {
      throw new Error(`ReportRecipient not found by id=${recipientId}: ${String(e)}`);
    });

    const reportTypeId = (rr.get("ReportType") as any[] | undefined)?.[0];
    if (!reportTypeId) throw new Error("ReportType not linked in ReportRecipients");

    const rtype = await base(TBL.REPORT_TYPES).find(reportTypeId);
    const slug = String(rtype.get("Slug") || "kitchen_daily");

    // OrgsIncluded (если пусто — все)
    let orgIds = (rr.get("OrgsIncluded") as any[] | undefined) || [];
    if (!orgIds.length) {
      const all = await selectAll(TBL.ORGS, { fields: ["Name"] });
      orgIds = all.map((r) => r.getId());
    }

    const results: any[] = [];
    for (const orgId of orgIds) {
      const org = await base(TBL.ORGS).find(orgId);
      const orgName = String(org.get("Name") || "Организация");

      // собрать данные
      const { rows, counters } = await collectKitchenData(orgId, dateISO);

      // HTML -> PDF
      const html = kitchenDailyHTML({ orgName, dateLabel: toRu(dateISO), rows, counters });
      const pdf = await renderPdfFromHtml(html);

      // upload в Blob
      const filename = `${safe(orgName)}_${dateISO}_${slug}.pdf`.replace(/\s+/g, "_");
      const buf = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
      const blob = await put(`reports/${filename}`, buf, {
        access: "public",
        addRandomSuffix: false,
        contentType: "application/pdf",
        token: process.env.BLOB_READ_WRITE_TOKEN!,
      });

      // запись в Reports
      const subj = `Заказы на ${toRu(dateISO)} — ${orgName}`;
      const body = [
        `Добрый день!`,
        ``,
        `Во вложении отчёт по заказам на ${toRu(dateISO)} для ${orgName}.`,
        `• Таблица 1 — сотрудники и их заказы`,
        `• Таблица 2 — агрегаты по блюдам (салаты, супы, блинчики/запеканки, милбоксы, выпечка, фрукты/напитки).`,
        ``,
        `Если нужны корректировки — напишите в ответ.`,
      ].join("\n");

      const created = await base(TBL.REPORTS).create([
        {
          ReportType: [reportTypeId],
          Recipient: [recipientId],
          OrgsCovered: [orgId],
          ReportDate: dateISO,
          Status: "ready",
          SubjectFinal: subj,
          BodyFinal: body,
          File: [{ url: blob.url, filename }],
        } as any,
      ]);

      // created имеет тип Records<FieldSet>, забираем первый
      const first = (created as any[])[0];
      const reportId =
        typeof first?.getId === "function" ? first.getId() : (first?.id as string | undefined) || "unknown";

      results.push({ reportId, url: blob.url, orgId, orgName, rows: rows.length });
    }

    return NextResponse.json({ ok: true, date: dateISO, results });
  } catch (e: any) {
    console.error("report/generate error:", e);
    return NextResponse.json(
      { ok: false, error: String(e?.message || e), stack: e?.stack },
      { status: 500 }
    );
  }
}


/** Сбор данных для отчёта кухни */
async function collectKitchenData(orgId: string, dateISO: string) {
  // 1) заказы (Orders) конкретной организации на дату, кроме Cancelled
  const orders = await selectAll(TBL.ORDERS, {
    fields: ['Order Date','Employee','Org','Status','Meal Boxes','Order Lines'],
    filterByFormula: `
      AND(
        DATETIME_FORMAT({Order Date}, 'YYYY-MM-DD')='${dateISO}',
        FIND('${orgId}', ARRAYJOIN({Org})),
        OR({Status}="", {Status}!="Cancelled")
      )
    `.replace(/\s+/g,' ')
  });

  // собрать Ids для последующих выборок
  const employeeIds = new Set<string>();
  const mealBoxIds  = new Set<string>();
  const lineIds     = new Set<string>();

  orders.forEach(o => {
    ((o.get('Employee') as any[]) || []).forEach(id => employeeIds.add(id));
    ((o.get('Meal Boxes') as any[]) || []).forEach(id => mealBoxIds.add(id));
    ((o.get('Order Lines') as any[]) || []).forEach(id => lineIds.add(id));
  });

  // 2) карты имен сотрудников
  const employees = employeeIds.size
    ? await selectAll(TBL.EMPLOYEES, { fields: ['First Name','Last Name','Full Name'],
        filterByFormula: `OR(${[...employeeIds].map(id=>`RECORD_ID()='${id}'`).join(',')})` })
    : [];
  const empName = new Map<string,string>();
  employees.forEach(e => {
    const full = (e.get('Full Name') as string) ||
                 `${e.get('Last Name')||''} ${e.get('First Name')||''}`.trim();
    empName.set(e.id, full);
  });

  // 3) карты mealbox label
  const mealBoxes = mealBoxIds.size
    ? await selectAll(TBL.MEAL_BOXES, { fields:['Main Name','Side Name','MB Label'],
        filterByFormula: `OR(${[...mealBoxIds].map(id=>`RECORD_ID()='${id}'`).join(',')})` })
    : [];
  const mbLabel = new Map<string,string>();
  mealBoxes.forEach(mb => {
    const label = (mb.get('MB Label') as string) ||
                  `${mb.get('Main Name')||''} + ${mb.get('Side Name')||''}`.trim();
    mbLabel.set(mb.id, label);
  });

  // 4) order lines (+ категории через Dishes)
  const lines = lineIds.size
    ? await selectAll(TBL.ORDER_LINES, { fields:['Order','Item (Menu Item)','Item Name','Quantity'],
        filterByFormula: `OR(${[...lineIds].map(id=>`RECORD_ID()='${id}'`).join(',')})` })
    : [];

  const dishIds = new Set<string>();
  lines.forEach(l => ((l.get('Item (Menu Item)') as any[])||[]).forEach(id=>dishIds.add(id)));

  const dishes = dishIds.size
    ? await selectAll(TBL.DISHES, { fields:['Category','Description','DishID','Menu','Name'],
        filterByFormula: `OR(${[...dishIds].map(id=>`RECORD_ID()='${id}'`).join(',')})` })
    : [];

  const dishCat = new Map<string,string>();
  dishes.forEach(d => dishCat.set(d.id, String(d.get('Category') || '')));

  // маппинг: orderId -> []
  const orderLineMap = new Map<string, {name:string; qty:number; cat:string}[]>();
  for (const l of lines) {
    const orderRef = ((l.get('Order') as any[])||[])[0];
    if (!orderRef) continue;
    const itemId = ((l.get('Item (Menu Item)') as any[])||[])[0];
    const name = String(l.get('Item Name') || '');
    const qty  = Number(l.get('Quantity') || 1);
    const cat  = dishCat.get(itemId) || '';
    if (!orderLineMap.has(orderRef)) orderLineMap.set(orderRef, []);
    orderLineMap.get(orderRef)!.push({ name, qty, cat });
  }

  // маппинг: orderId -> first mealbox label (если их несколько — выведем построчно дальше)
  const orderMBMap = new Map<string, string[]>();
  for (const o of orders) {
    const id = o.id;
    const mbs = ((o.get('Meal Boxes') as any[])||[]).map((mbId: string)=> mbLabel.get(mbId) || '').filter(Boolean);
    orderMBMap.set(id, mbs);
  }

  // 5) собрать строки Таблица 1
  type Row = { fullName:string; mealBox:string; extra1?:string; extra2?:string };
  const rows: Row[] = [];

  for (const o of orders) {
    const fullName = empName.get(((o.get('Employee') as any[])||[])[0]) || '—';
    const mbs = orderMBMap.get(o.id) || [''];
    const extrasAll = (orderLineMap.get(o.id) || [])
      .filter(x => ['Salad','Soup','Zapekanka','Fruit','Pastry','Drink'].includes(x.cat));

    // каждая пара "сотрудник+конкретный mealbox" — отдельной строкой
    for (const oneMB of mbs.length ? mbs : ['']) {
      const r: Row = { fullName, mealBox: oneMB };
      if (extrasAll.length > 0) r.extra1 = extrasAll[0].name;
      if (extrasAll.length > 1) r.extra2 = extrasAll[1].name;
      if (extrasAll.length > 2) r.extra2 = `${r.extra2 || ''} (+${extrasAll.length-2})`.trim();
      rows.push(r);
    }
  }

  // сортировка по ФИО
  rows.sort((a,b) => a.fullName.localeCompare(b.fullName, 'ru'));

  // 6) агрегаты (Таблица 2)
  const cSalad = new Map<string,number>();
  const cSoup  = new Map<string,number>();
  const cZap   = new Map<string,number>();
  const cPastry= new Map<string,number>();
  const cFD    = new Map<string,number>(); // fruit+drink
  const cMB    = new Map<string,number>();

  // mealboxes
  for (const arr of orderMBMap.values()) {
    for (const label of arr) if (label) cMB.set(label, (cMB.get(label)||0)+1);
  }
  // lines
  for (const arr of orderLineMap.values()) {
    for (const l of arr) {
      const add = (m:Map<string,number>, key:string, inc:number)=> m.set(key, (m.get(key)||0)+inc);
      if (l.cat === 'Salad') add(cSalad, l.name, l.qty);
      else if (l.cat === 'Soup') add(cSoup, l.name, l.qty);
      else if (l.cat === 'Zapekanka') add(cZap, l.name, l.qty);
      else if (l.cat === 'Pastry') add(cPastry, l.name, l.qty);
      else if (l.cat === 'Fruit' || l.cat === 'Drink') add(cFD, l.name, l.qty);
    }
  }

  const toPairs = (m:Map<string,number>) => [...m.entries()].sort((a,b)=> a[0].localeCompare(b[0],'ru'));

  return {
    rows,
    counters: {
      salads: toPairs(cSalad),
      soups: toPairs(cSoup),
      zap: toPairs(cZap),
      mealboxes: toPairs(cMB),
      pastry: toPairs(cPastry),
      fruitdrink: toPairs(cFD),
    }
  };
}

function nextDayISO() {
  const d = new Date();
  d.setDate(d.getDate()+1);
  return d.toISOString().slice(0,10);
}
function toRu(iso: string) {
  const [y,m,d] = iso.split('-'); return `${d}.${m}.${y}`;
}
function safe(s:string){ return s.replace(/[^\w.\-]+/g,'_'); }
