// src/app/api/report/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';
import { put } from '@vercel/blob';

import { base, TBL, selectAll } from '@/lib/airtable';
import { renderKitchenDailyXLSX } from '@/lib/xlsx';

export const runtime = 'nodejs';

type Body = { recipientId?: string; date?: string };

export async function POST(req: NextRequest) {
  try {
    const { recipientId, date } = (await req.json()) as Body;
    const debug = req.nextUrl.searchParams.get('debug') === '1';

    if (!recipientId) {
      return NextResponse.json({ ok: false, error: 'recipientId required' }, { status: 400 });
    }

    const dateISO = (date || nextDayISO()).slice(0, 10);

    // 1) Получатель и тип отчёта
    const rr = await base(TBL.REPORT_RECIPIENTS).find(recipientId).catch((e) => {
      throw new Error(`ReportRecipient not found by id=${recipientId}: ${String(e)}`);
    });

    const reportTypeId = (rr.get('ReportType') as any[] | undefined)?.[0];
    if (!reportTypeId) throw new Error('ReportType not linked in ReportRecipients');

    const rtype = await base(TBL.REPORT_TYPES).find(reportTypeId);
    const slug = String(rtype.get('Slug') || 'kitchen_daily');

    // 2) Разрешаем список организаций у получателя
    const allOrgs = await selectAll(TBL.ORGS, { fields: ['Name', 'OrgID'] });
    const resolver = makeOrgResolver(allOrgs);

    const rawIncluded = rr.get('OrgsIncluded');
    let includedTokens: string[] = [];
    if (Array.isArray(rawIncluded)) {
      includedTokens = rawIncluded.map((x: any) => x?.id || String(x));
    } else if (typeof rawIncluded === 'string') {
      includedTokens = rawIncluded.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    }
    if (!includedTokens.length) includedTokens = allOrgs.map((o) => o.getId());

    const orgsResolved = includedTokens
      .map((t) => resolver(t))
      .filter(Boolean) as { recId: string; orgName: string; orgKey: string }[];

    if (!orgsResolved.length) {
      return NextResponse.json({ ok: false, error: 'No organizations resolved from OrgsIncluded' }, { status: 400 });
    }

    // 3) Все заказы (минимально нужные поля)
    const ordersAll = await selectAll(TBL.ORDERS, {
      fields: ['OrderDateISO', 'Order Date', 'Status', 'Org', 'Employee', 'Meal Boxes', 'Order Lines'],
    });

    if (debug) {
      const F_STATUS = ['Status', 'Order Status'];
      const F_ORG = ['Org', 'Organization', 'Organisation', 'Company'];
      const F_ORDER_DATE = ['OrderDateISO', 'Order Date', 'Delivery Date', 'Date', 'Day'];
      const byDate = ordersAll.filter((o) => hasDate(o, F_ORDER_DATE, dateISO));
      const byOrg = (orgId: string) => ordersAll.filter((o) => getLinks(o, F_ORG).includes(orgId));

      const diag = orgsResolved.map(({ recId, orgName, orgKey }) => {
        const both = ordersAll.filter(
          (o) => hasDate(o, F_ORDER_DATE, dateISO) && getLinks(o, F_ORG).includes(recId),
        );
        return {
          orgName,
          orgKey,
          orgRecId: recId,
          totals: {
            allOrders: ordersAll.length,
            byDate: byDate.length,
            byOrg: byOrg(recId).length,
            both: both.length,
          },
          samples: {
            byDate: sampleOrders(byDate),
            byOrg: sampleOrders(byOrg(recId)),
            both: sampleOrders(both),
          },
        };
      });

      return NextResponse.json({
        ok: true,
        mode: 'debug',
        date: dateISO,
        organizationsChecked: diag.length,
        diag,
      });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ ok: false, error: 'Missing BLOB_READ_WRITE_TOKEN env' }, { status: 500 });
    }

    // 4) Генерация по организациям
    const results: Array<{
      reportId: string;
      url: string;
      orgId: string;
      orgKey: string;
      orgName: string;
      rows: number;
    }> = [];

    for (const { recId: orgId, orgName, orgKey } of orgsResolved) {
      const { rows, counters } = await collectKitchenDataFromArrays(ordersAll, orgId, dateISO);

      const xlsxBuf = await renderKitchenDailyXLSX({
        orgName,
        dateLabel: toRu(dateISO),
        rows,
        counters,
      });

      const filename = `${safe(orgName)}_${dateISO}_${slug}.xlsx`.replace(/\s+/g, '_');
      const blob = await put(`reports/${filename}`, xlsxBuf, {
        access: 'public',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        addRandomSuffix: false,
        allowOverwrite: true,
        token: process.env.BLOB_READ_WRITE_TOKEN!,
      });

      const subj = `Заказы на ${toRu(dateISO)} — ${orgName}`;
      const body = [
        `Добрый день!`,
        ``,
        `Во вложении Excel-отчёт по заказам на ${toRu(dateISO)} для ${orgName}.`,
        `• Лист «Сотрудники» — сотрудники и их заказы`,
        `• Лист «Агрегаты» — свод по блюдам.`,
      ].join('\n');

      const created = await (base(TBL.REPORTS) as any).create([
        {
          fields: {
            ReportType: [reportTypeId],
            Recipient: [recipientId],
            OrgsCovered: [orgId],
            ReportDate: dateISO,
            Status: 'ready',
            SubjectFinal: subj,
            BodyFinal: body,
            File: [{ url: blob.url, filename }] as any[],
          },
        },
      ]);

      const first = (created as any[])[0];
      const reportId: string =
        (first && typeof first.getId === 'function' && first.getId()) || first?.id || 'unknown';

      results.push({ reportId, url: blob.url, orgId, orgKey, orgName, rows: rows.length });
    }

    return NextResponse.json({ ok: true, date: dateISO, results });
  } catch (e: any) {
    console.error('report/generate error:', e);
    return NextResponse.json(
      { ok: false, error: String(e?.message || e), stack: e?.stack },
      { status: 500 },
    );
  }
}

/* ===================== Хелперы и сбор данных ===================== */

function makeOrgResolver(all: Airtable.Record<any>[]) {
  const byId = new Map<string, Airtable.Record<any>>();
  const byOrgKey = new Map<string, Airtable.Record<any>>();
  const byName = new Map<string, Airtable.Record<any>>();
  for (const r of all) {
    byId.set(r.getId(), r);
    const key = (r.get('OrgID') as string) || '';
    if (key) byOrgKey.set(key, r);
    const name = (r.get('Name') as string) || '';
    if (name) byName.set(name, r);
  }
  return (token: string) => {
    if (!token) return null;
    let rec: Airtable.Record<any> | undefined;
    if (token.startsWith('rec')) rec = byId.get(token);
    if (!rec && token.startsWith('org')) rec = byOrgKey.get(token);
    if (!rec) rec = byName.get(token);
    if (!rec) return null;
    return {
      recId: rec.getId(),
      orgKey: (rec.get('OrgID') as string) || rec.getId(),
      orgName: (r.get('Name') as string) || 'Организация',
    };
  };
}

function getStr(r: Airtable.Record<any>, names: string[]): string | undefined {
  for (const n of names) {
    const v = r.get(n);
    if (typeof v === 'string' && v.trim() !== '') return v;
  }
  return undefined;
}
function getNum(r: Airtable.Record<any>, names: string[]): number | undefined {
  for (const n of names) {
    const v = r.get(n);
    const num = typeof v === 'number' ? v : (typeof v === 'string' ? Number(v) : NaN);
    if (!Number.isNaN(num)) return num;
  }
  return undefined;
}
function getLinks(r: Airtable.Record<any>, names: string[]): string[] {
  for (const n of names) {
    const v = r.get(n);
    if (Array.isArray(v)) return v as string[];
  }
  return [];
}

function fieldDateISO(v: any): string | null {
  if (!v) return null;
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const d = new Date(v);
    if (!isNaN(d as any)) return d.toISOString().slice(0, 10);
    return null;
  }
  const d = new Date(v as any);
  if (!isNaN(d as any)) return d.toISOString().slice(0, 10);
  return null;
}

function hasDate(o: Airtable.Record<any>, dateFields: string[], dateISO: string) {
  for (const n of dateFields) {
    const val = o.get(n);
    const iso =
      n === 'OrderDateISO'
        ? (typeof val === 'string' ? val.slice(0, 10) : fieldDateISO(val))
        : fieldDateISO(val);
    if (iso === dateISO) return true;
  }
  return false;
}

function toRu(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
function nextDayISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
function safe(s: string) {
  return s.replace(/[^\w.\-]+/g, '_');
}
function sampleOrders(recs: Airtable.Record<any>[]) {
  return recs.slice(0, 5).map((r) => ({
    id: r.getId(),
    OrderDateISO: (r.get('OrderDateISO') as any) || null,
    status: (r.get('Status') as any) || null,
    orgIds: (r.get('Org') as any) || (r.get('Organization') as any) || [],
  }));
}

/* ===== НОВОЕ: определяем экстры даже БЕЗ категорий ===== */

function norm(s: string) {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function isExtraCategory(catRaw: string | undefined) {
  const cat = norm(catRaw || '');
  if (!cat) return true; // если категории нет — считаем экстрой (пущай будет)
  const positives = new Set([
    'salad', 'soup', 'zapekanka', 'pastry', 'fruit', 'drink', 'fruits', 'drinks',
    'салаты', 'салат', 'супы', 'суп', 'запеканка', 'запеканки', 'блины', 'блины и запеканки',
    'выпечка', 'фрукты', 'напитки', 'фрукты и напитки'
  ]);
  const negatives = new Set(['meal box', 'mealbox', 'meal_box', 'основное блюдо и гарнир']);
  if (negatives.has(cat)) return false;
  if (positives.has(cat)) return true;
  if (/(салат|суп|запеканк|блин|выпечк|фрукт|напит)/i.test(cat)) return true;
  if (/(salad|soup|zapek|pastr|fruit|drink)/i.test(cat)) return true;
  return !/(meal\s*box|основное блюдо)/i.test(cat);
}

async function collectKitchenDataFromArrays(ordersAll: Airtable.Record<any>[], orgRecId: string, dateISO: string) {
  const F_ORDER_DATE = ['OrderDateISO', 'Order Date', 'Delivery Date', 'Date', 'Day'];
  const F_STATUS = ['Status', 'Order Status'];
  const F_ORG = ['Org', 'Organization', 'Organisation', 'Company'];
  const F_EMP = ['Employee', 'User', 'Emp'];
  const F_MEALBOXES = ['Meal Boxes', 'Meal Box', 'MealBox', 'MB'];
  const F_LINES = ['Order Lines', 'Lines', 'Items'];

  // отбираем сами заказы
  const orders = ordersAll.filter((o) => {
    const status = (getStr(o, F_STATUS) || '').toLowerCase();
    if (status === 'cancelled' || status === 'canceled') return false;
    if (!hasDate(o, F_ORDER_DATE, dateISO)) return false;
    return getLinks(o, F_ORG).includes(orgRecId);
  });

  if (orders.length === 0) {
    return {
      rows: [],
      counters: { salads: [], soups: [], zap: [], mealboxes: [], pastry: [], fruitdrink: [] },
    };
  }

  // собираем id связанных сущностей
  const employeeIds = new Set<string>();
  const mealBoxIds = new Set<string>();
  const lineIds = new Set<string>();
  for (const o of orders) {
    getLinks(o, F_EMP).forEach((id) => employeeIds.add(id));
    getLinks(o, F_MEALBOXES).forEach((id) => mealBoxIds.add(id));
    getLinks(o, F_LINES).forEach((id) => lineIds.add(id));
  }

  // справочники: сотрудники
  const employees = employeeIds.size
    ? await selectAll(TBL.EMPLOYEES, {
        fields: ['FullName', 'Email'],
        filterByFormula: `OR(${[...employeeIds].map((id) => `RECORD_ID()='${id}'`).join(',')})`,
      })
    : [];
  const empName = new Map<string, string>();
  employees.forEach((e) => empName.set(e.getId(), (e.get('FullName') as string) || (e.get('Email') as string) || '—'));

  // справочники: милбоксы
  const mbs = mealBoxIds.size
    ? await selectAll(TBL.MEAL_BOXES, { fields: ['MB Label', 'Main Name', 'Side Name'] })
    : [];
  const mbLabel = new Map<string, string>();
  const mbComponents = new Map<string, { main: string; side: string }>();
  mbs.forEach((mb) => {
    const main = (mb.get('Main Name') as string) || '';
    const side = (mb.get('Side Name') as string) || '';
    const label =
      (mb.get('MB Label') as string) || `${main || ''} + ${side || ''}`.trim();
    mbLabel.set(mb.getId(), label || 'Meal box');
    mbComponents.set(mb.getId(), { main, side });
  });

  // строки заказов
  const lines = lineIds.size
    ? await selectAll(TBL.ORDER_LINES, { fields: ['Order', 'Item (Menu Item)', 'Item Name', 'Quantity'] })
    : [];

  const F_LINE_ORDER = ['Order', 'Parent Order'];
  const F_ITEM_LINK = ['Item (Menu Item)', 'Menu Item', 'Dish'];
  const F_ITEM_NAME = ['Item Name', 'Name', 'Title'];
  const F_QTY = ['Quantity', 'Qty', 'Count'];

  // справочник блюд (для категорий — если будут)
  const dishIds = new Set<string>();
  lines.forEach((l) => getLinks(l, F_ITEM_LINK).forEach((id) => dishIds.add(id)));
  const dishes = await selectAll(TBL.DISHES, { fields: ['Category', 'Name'] }); // тянем все, чтобы матчить по имени
  const dishCatById = new Map<string, string>();
  const dishByName = new Map<string, { cat: string; name: string }>(); // key = name lower
  dishes.forEach((d) => {
    const id = d.getId();
    const name = (d.get('Name') as string) || '';
    const cat = (d.get('Category') as string) || '';
    if (id) dishCatById.set(id, cat);
    if (name) dishByName.set(norm(name), { cat, name });
  });

  // группируем линии по заказу, определяем категорию: по id, иначе по названию
  const orderLineMap = new Map<string, { name: string; qty: number; cat: string }[]>();
  for (const l of lines) {
    const orderRef = getLinks(l, F_LINE_ORDER)[0];
    if (!orderRef) continue;

    const itemId = getLinks(l, F_ITEM_LINK)[0];
    const nameStr = (getStr(l, F_ITEM_NAME) || '').trim();
    const qty = getNum(l, F_QTY) ?? 1;

    let cat = '';
    if (itemId) cat = dishCatById.get(itemId) || '';
    if (!cat && nameStr) {
      const hit = dishByName.get(norm(nameStr));
      if (hit) cat = hit.cat || '';
    }

    if (!orderLineMap.has(orderRef)) orderLineMap.set(orderRef, []);
    orderLineMap.get(orderRef)!.push({ name: nameStr, qty, cat });
  }

  // карта милбоксов (подписи) и КОМПОНЕНТОВ милбоксов по заказу
  const orderMBMap = new Map<string, string[]>();
  const orderMBComponents = new Map<string, Set<string>>(); // normalized names
  for (const o of orders) {
    const mbIds = getLinks(o, F_MEALBOXES);
    const labels = mbIds.map((id) => mbLabel.get(id) || '').filter(Boolean);
    orderMBMap.set(o.getId(), labels.length ? labels : ['']);

    const compSet = new Set<string>();
    for (const id of mbIds) {
      const comp = mbComponents.get(id);
      if (comp) {
        if (comp.main) compSet.add(norm(comp.main));
        if (comp.side) compSet.add(norm(comp.side));
      }
    }
    orderMBComponents.set(o.getId(), compSet);
  }

  // ——— Таблица 1 (сотрудники)
  type Row = { fullName: string; mealBox: string; extra1?: string; extra2?: string };
  const rows: Row[] = [];
  for (const o of orders) {
    const fullName = empName.get(getLinks(o, F_EMP)[0]) || '—';
    const mbsArr = orderMBMap.get(o.getId()) || [''];
    const compSet = orderMBComponents.get(o.getId()) || new Set<string>();

    // экстры: все строки, КОТОРЫЕ НЕ РАВНЫ компонентам MB по названию
    const allLines = orderLineMap.get(o.getId()) || [];
    const extrasAll = allLines.filter((x) => {
      const n = norm(x.name);
      const looksLikeComponent = n && compSet.has(n);
      if (looksLikeComponent) return false;
      // если категория известна — доп. проверка
      if (x.cat) return isExtraCategory(x.cat);
      // иначе считаем экстрой (раз не компонент MB)
      return true;
    });

    for (const oneMB of mbsArr) {
      const r: Row = { fullName, mealBox: oneMB };
      if (extrasAll.length > 0) r.extra1 = extrasAll[0].name;
      if (extrasAll.length > 1) r.extra2 = extrasAll[1].name;
      if (extrasAll.length > 2) r.extra2 = `${r.extra2 || ''} (+${extrasAll.length - 2})`.trim();
      rows.push(r);
    }
  }
  rows.sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));

  // ——— Таблица 2 (агрегаты)
  const cSalad = new Map<string, number>();
  const cSoup = new Map<string, number>();
  const cZap = new Map<string, number>();
  const cPastry = new Map<string, number>();
  const cFD = new Map<string, number>();
  const cMB = new Map<string, number>();

  for (const arr of orderMBMap.values())
    for (const label of arr) if (label) cMB.set(label, (cMB.get(label) || 0) + 1);

  for (const [orderId, arr] of orderLineMap.entries()) {
    const compSet = orderMBComponents.get(orderId) || new Set<string>();
    for (const l of arr) {
      // пропускаем компоненты MB
      if (compSet.has(norm(l.name))) continue;

      const add = (m: Map<string, number>, key: string, inc: number) =>
        m.set(key, (m.get(key) || 0) + inc);

      const cat = norm(l.cat);
      if (cat === 'salad' || cat === 'салат' || cat === 'салаты') add(cSalad, l.name, l.qty);
      else if (cat === 'soup' || cat === 'суп' || cat === 'супы') add(cSoup, l.name, l.qty);
      else if (cat === 'zapekanka' || /запеканк|блин/i.test(cat)) add(cZap, l.name, l.qty);
      else if (cat === 'pastry' || /выпечк/i.test(cat)) add(cPastry, l.name, l.qty);
      else if (cat === 'fruit' || cat === 'fruits' || cat === 'drink' || cat === 'drinks' || /фрукт|напит/i.test(cat))
        add(cFD, l.name, l.qty);
      else {
        // если категории нет — отнесём к FRUIT/DRINK сводам не будем, но на листе «Сотрудники» оно уже попало как экстра
      }
    }
  }

  const toPairs = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'ru'));

  return {
    rows,
    counters: {
      salads: toPairs(cSalad),
      soups: toPairs(cSoup),
      zap: toPairs(cZap),
      mealboxes: toPairs(cMB),
      pastry: toPairs(cPastry),
      fruitdrink: toPairs(cFD),
    },
  };
}
