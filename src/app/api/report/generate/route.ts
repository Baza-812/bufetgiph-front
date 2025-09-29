// src/app/api/report/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Airtable from 'airtable';
import { put } from '@vercel/blob';

import { base, TBL, selectAll } from '@/lib/airtable';
import { renderKitchenDailyXLSX } from '@/lib/xlsx';

export const runtime = 'nodejs';

type Body = { recipientId?: string; date?: string };

/** POST /api/report/generate
 *  body: { recipientId: "recXXXXXXXXXXXX", date?: "YYYY-MM-DD" }
 */
export async function POST(req: NextRequest) {
  try {
    const { recipientId, date } = (await req.json()) as Body;
    if (!recipientId) {
      return NextResponse.json({ ok: false, error: 'recipientId required' }, { status: 400 });
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ ok: false, error: 'Missing BLOB_READ_WRITE_TOKEN env' }, { status: 500 });
    }

    const dateISO = date || nextDayISO();

    // 1) Получатель и тип отчёта
    const rr = await base(TBL.REPORT_RECIPIENTS).find(recipientId).catch((e) => {
      throw new Error(`ReportRecipient not found by id=${recipientId}: ${String(e)}`);
    });

    const reportTypeId = (rr.get('ReportType') as any[] | undefined)?.[0];
    if (!reportTypeId) throw new Error('ReportType not linked in ReportRecipients');

    const rtype = await base(TBL.REPORT_TYPES).find(reportTypeId);
    const slug = String(rtype.get('Slug') || 'kitchen_daily');

    // 2) Какие организации покрывать (если пусто — все)
    let orgIds = (rr.get('OrgsIncluded') as any[] | undefined) || [];
    if (!orgIds.length) {
      const all = await selectAll(TBL.ORGS, { fields: ['Name'] });
      orgIds = all.map((r) => r.getId());
    }

    const results: Array<{ reportId: string; url: string; orgId: string; orgName: string; rows: number }> = [];

    for (const orgId of orgIds) {
      const org = await base(TBL.ORGS).find(orgId);
      const orgName = String(org.get('Name') || 'Организация');

      // 3) Сбор данных для отчёта
      const { rows, counters } = await collectKitchenData(orgId, dateISO);

      // 4) Генерация XLSX
      const xlsxBuf = await renderKitchenDailyXLSX({
        orgName,
        dateLabel: toRu(dateISO),
        rows,
        counters,
      });

      // 5) Загрузка в Vercel Blob
      const filename = `${safe(orgName)}_${dateISO}_${slug}.xlsx`.replace(/\s+/g, '_');
      const blob = await put(`reports/${filename}`, xlsxBuf, {
        access: 'public',
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        addRandomSuffix: false,
        allowOverwrite: true,
        token: process.env.BLOB_READ_WRITE_TOKEN!,
      });

      // 6) Запись в Reports (Airtable)
      const subj = `Заказы на ${toRu(dateISO)} — ${orgName}`;
      const body = [
        `Добрый день!`,
        ``,
        `Во вложении Excel-отчёт по заказам на ${toRu(dateISO)} для ${orgName}.`,
        `• Лист «Сотрудники» — сотрудники и их заказы`,
        `• Лист «Агрегаты» — свод по блюдам (салаты, супы, блинчики/запеканки, милбоксы, выпечка, фрукты/напитки).`,
        ``,
        `Если нужны корректировки — напишите в ответ.`,
      ].join('\n');

      // ослабляем типизацию SDK (для Attachments достаточно url+filename)
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

      results.push({ reportId, url: blob.url, orgId, orgName, rows: rows.length });
    }

    return NextResponse.json({ ok: true, date: dateISO, results });
  } catch (e: any) {
    console.error('report/generate error:', e);
    return NextResponse.json(
      { ok: false, error: String(e?.message || e), stack: e?.stack },
      { status: 500 }
    );
  }
}

/* ===================== Helpers & data collection ===================== */

/** Универсальный доступ к полям записи */
function getStr(r: Airtable.Record<any>, names: string[]): string | undefined {
  for (const n of names) {
    const v = r.get(n);
    if (typeof v === 'string' && v.trim() !== '') return v as string;
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
  // строка "YYYY-MM-DD..." → берём первые 10
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    // иное — пробуем распарсить Date
    const d = new Date(v);
    if (!isNaN(d as any)) return d.toISOString().slice(0, 10);
    return null;
  }
  // Date/number → ISO-дату
  const d = new Date(v as any);
  if (!isNaN(d as any)) return d.toISOString().slice(0, 10);
  return null;
}


/** Сбор данных для кухонного отчёта — без зависимости от точных имён полей */
async function collectKitchenData(orgId: string, dateISO: string) {
  // 1) Тянем все заказы, фильтруем в коде
  const ordersAll = await selectAll(TBL.ORDERS, {});

  // возможные имена полей
  const F_ORDER_DATE = ['Order Date', 'Delivery Date', 'Date', 'Day'];
  const F_STATUS = ['Status', 'Order Status'];
  const F_ORG = ['Org', 'Organization', 'Organisation', 'Company'];
  const F_EMP = ['Employee', 'User', 'Emp'];
  const F_MEALBOXES = ['Meal Boxes', 'Meal Box', 'MealBox', 'MB'];
  const F_LINES = ['Order Lines', 'Lines', 'Items'];

  // 2) Отбор по дате, статусу (!Cancelled) и организации (по recId)
    const orders = ordersAll.filter((o) => {
    const status = (getStr(o, F_STATUS) || '').toLowerCase();
    if (status === 'cancelled' || status === 'canceled') return false;

    // дата
    let hasDate = false;
    for (const n of F_ORDER_DATE) {
      const iso = fieldDateISO(o.get(n));
      if (iso === dateISO) { hasDate = true; break; }
    }
    if (!hasDate) return false;

    // организация (по ссылке)
    const orgLinks = getLinks(o, F_ORG);
    return orgLinks.includes(orgId);
  });


  if (orders.length === 0) {
    return {
      rows: [],
      counters: { salads: [], soups: [], zap: [], mealboxes: [], pastry: [], fruitdrink: [] },
    };
  }

  // 3) Собираем ID связанных сущностей
  const employeeIds = new Set<string>();
  const mealBoxIds = new Set<string>();
  const lineIds = new Set<string>();

  for (const o of orders) {
    getLinks(o, F_EMP).forEach((id) => employeeIds.add(id));
    getLinks(o, F_MEALBOXES).forEach((id) => mealBoxIds.add(id));
    getLinks(o, F_LINES).forEach((id) => lineIds.add(id));
  }

  // Employees → имя (твои реальные поля)
  const employees = employeeIds.size
    ? await selectAll(TBL.EMPLOYEES, {
        fields: ['FullName', 'Email'],
        filterByFormula: `OR(${[...employeeIds].map((id) => `RECORD_ID()='${id}'`).join(',')})`,
      })
    : [];
  const empName = new Map<string, string>();
  employees.forEach((e) => {
    empName.set(e.getId(), getStr(e, ['FullName', 'Email']) || '—');
  });

  // Meal Boxes → подпись
  const mbs = mealBoxIds.size ? await selectAll(TBL.MEAL_BOXES, {}) : [];
  const mbLabel = new Map<string, string>();
  mbs.forEach((mb) => {
    const label =
      getStr(mb, ['MB Label', 'Label', 'Name']) ||
      `${getStr(mb, ['Main Name', 'Main']) || ''} + ${getStr(mb, ['Side Name', 'Side']) || ''}`.trim();
    mbLabel.set(mb.getId(), label || 'Meal box');
  });

  // Order Lines → блюда
  const lines = lineIds.size ? await selectAll(TBL.ORDER_LINES, {}) : [];

  const F_LINE_ORDER = ['Order', 'Parent Order'];
  const F_ITEM_LINK = ['Item (Menu Item)', 'Menu Item', 'Dish'];
  const F_ITEM_NAME = ['Item Name', 'Name', 'Title'];
  const F_QTY = ['Quantity', 'Qty', 'Count'];

  const dishIds = new Set<string>();
  lines.forEach((l) => getLinks(l, F_ITEM_LINK).forEach((id) => dishIds.add(id)));

  const dishes = dishIds.size ? await selectAll(TBL.DISHES, {}) : [];

  const dishCat = new Map<string, string>();
  const dishName = new Map<string, string>();
  dishes.forEach((d) => {
    dishCat.set(d.getId(), getStr(d, ['Category']) || '');
    dishName.set(d.getId(), getStr(d, ['Name', 'Title']) || '');
  });

  const orderLineMap = new Map<string, { name: string; qty: number; cat: string }[]>();
  for (const l of lines) {
    const orderRef = getLinks(l, F_LINE_ORDER)[0];
    if (!orderRef) continue;
    const itemId = getLinks(l, F_ITEM_LINK)[0];
    const name = getStr(l, F_ITEM_NAME) || (itemId ? (dishName.get(itemId) || '') : '');
    const qty = getNum(l, F_QTY) ?? 1;
    const cat = itemId ? (dishCat.get(itemId) || '') : '';
    if (!orderLineMap.has(orderRef)) orderLineMap.set(orderRef, []);
    orderLineMap.get(orderRef)!.push({ name, qty, cat });
  }

  const orderMBMap = new Map<string, string[]>();
  for (const o of orders) {
    const arr = getLinks(o, F_MEALBOXES).map((id) => mbLabel.get(id) || '').filter(Boolean);
    orderMBMap.set(o.getId(), arr);
  }

  // 4) Таблица 1
  type Row = { fullName: string; mealBox: string; extra1?: string; extra2?: string };
  const rows: Row[] = [];
  for (const o of orders) {
    const fullName = empName.get(getLinks(o, F_EMP)[0]) || '—';
    const mbsArr = orderMBMap.get(o.getId()) || [''];
    const extrasAll = (orderLineMap.get(o.getId()) || []).filter((x) =>
      ['Salad', 'Soup', 'Zapekanka', 'Fruit', 'Pastry', 'Drink'].includes(x.cat),
    );
    for (const oneMB of mbsArr.length ? mbsArr : ['']) {
      const r: Row = { fullName, mealBox: oneMB };
      if (extrasAll.length > 0) r.extra1 = extrasAll[0].name;
      if (extrasAll.length > 1) r.extra2 = extrasAll[1].name;
      if (extrasAll.length > 2) r.extra2 = `${r.extra2 || ''} (+${extrasAll.length - 2})`.trim();
      rows.push(r);
    }
  }
  rows.sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'));

  // 5) Таблица 2 (агрегаты)
  const cSalad = new Map<string, number>();
  const cSoup = new Map<string, number>();
  const cZap = new Map<string, number>();
  const cPastry = new Map<string, number>();
  const cFD = new Map<string, number>();
  const cMB = new Map<string, number>();

  for (const arr of orderMBMap.values())
    for (const label of arr) if (label) cMB.set(label, (cMB.get(label) || 0) + 1);

  for (const arr of orderLineMap.values()) {
    for (const l of arr) {
      const add = (m: Map<string, number>, key: string, inc: number) =>
        m.set(key, (m.get(key) || 0) + inc);
      if (l.cat === 'Salad') add(cSalad, l.name, l.qty);
      else if (l.cat === 'Soup') add(cSoup, l.name, l.qty);
      else if (l.cat === 'Zapekanka') add(cZap, l.name, l.qty);
      else if (l.cat === 'Pastry') add(cPastry, l.name, l.qty);
      else if (l.cat === 'Fruit' || l.cat === 'Drink') add(cFD, l.name, l.qty);
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

function nextDayISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}
function toRu(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
function safe(s: string) {
  return s.replace(/[^\w.\-]+/g, '_');
}
