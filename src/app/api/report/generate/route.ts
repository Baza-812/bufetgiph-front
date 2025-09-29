// src/app/api/report/generate/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { base, TBL, selectAll } from '@/lib/airtable';
import { put } from '@vercel/blob';
import Airtable from 'airtable';
import { renderKitchenDailyXLSX } from '@/lib/xlsx';

export const runtime = 'nodejs';

type Body = { recipientId?: string; date?: string };

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

    // 1) Настройки получателя и тип отчёта
    const rr = await base(TBL.REPORT_RECIPIENTS).find(recipientId).catch((e) => {
      throw new Error(`ReportRecipient not found by id=${recipientId}: ${String(e)}`);
    });

    const reportTypeId = (rr.get('ReportType') as any[] | undefined)?.[0];
    if (!reportTypeId) throw new Error('ReportType not linked in ReportRecipients');

    const rtype = await base(TBL.REPORT_TYPES).find(reportTypeId);
    const slug = String(rtype.get('Slug') || 'kitchen_daily');

    // Орги: если OrgsIncluded пуст — берём все
    let orgIds = (rr.get('OrgsIncluded') as any[] | undefined) || [];
    if (!orgIds.length) {
      const all = await selectAll(TBL.ORGS, { fields: ['Name'] });
      orgIds = all.map((r) => r.getId());
    }

    const results: any[] = [];

    for (const orgId of orgIds) {
      const org = await base(TBL.ORGS).find(orgId);
      const orgName = String(org.get('Name') || 'Организация');

      // 2) Собираем данные для отчёта
      const { rows, counters } = await collectKitchenData(orgId, dateISO);

      // 3) Рендер PDF (pdf-lib)
      const xlsxBuf = await renderKitchenDailyXLSX({
        orgName,
        dateLabel: toRu(dateISO),
        rows,
        counters,
      });

      // 4) Загрузка в Vercel Blob
      const filename = `${safe(orgName)}_${dateISO}_${slug}.xlsx`.replace(/\s+/g, '_');

const blob = await put(`reports/${filename}`, xlsxBuf, {
  access: 'public',
  addRandomSuffix: false,
  allowOverwrite: true,
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  token: process.env.BLOB_READ_WRITE_TOKEN!,
});


      // 5) Запись в Reports (Airtable)
      const subj = `Заказы на ${toRu(dateISO)} — ${orgName}`;
      const body = [
        `Добрый день!`,
        ``,
        `Во вложении отчёт по заказам на ${toRu(dateISO)} для ${orgName}.`,
        `• Лист «Сотрудники» — сотрудники и их заказы`,
        `• Лист «Агрегаты» — свод по блюдам (салаты, супы, блинчики/запеканки, милбоксы, выпечка, фрукты/напитки).`,
        ``,
        `Хорошего дня.`,
      ].join('\n');

      // --- запись в Reports (с ослаблением типов SDK) ---
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
      // Airtable примет url/filename, а типы мешают — приводим к any
      File: [{ url: blob.url, filename }] as any[],
    },
  },
]);

// created -> берём первую запись и достаём id
const first = (created as any[])[0];
const reportId =
  (first && typeof first.getId === 'function' && first.getId()) ||
  first?.id ||
  'unknown';

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

/** Сбор данных для кухонного отчёта (исправлен фильтр по Org) */
async function collectKitchenData(orgId: string, dateISO: string) {
  // 1) Тянем все заказы на дату (Europe/Bucharest), исключая Cancelled
  const orders = await selectAll(TBL.ORDERS, {
    fields: ['Order Date', 'Employee', 'Org', 'Status', 'Meal Boxes', 'Order Lines'],
    filterByFormula: `
      AND(
        DATETIME_FORMAT(SET_TIMEZONE({Order Date}, 'Europe/Bucharest'), 'YYYY-MM-DD')='${dateISO}',
        OR({Status}='', NOT({Status}='Cancelled'))
      )
    `.replace(/\s+/g, ' '),
  });

  // 2) Режем по организации — по ID линк-поля (API возвращает массив recID)
  const ordersForOrg = orders.filter(o => {
    const orgs = (o.get('Org') as any[]) || [];
    return orgs.includes(orgId);
  });

  // Если пусто — сразу отдаём пустые структуры
  if (ordersForOrg.length === 0) {
    return {
      rows: [],
      counters: {
        salads: [], soups: [], zap: [], mealboxes: [], pastry: [], fruitdrink: [],
      },
    };
  }

  // Собираем ID связанных сущностей
  const employeeIds = new Set<string>();
  const mealBoxIds = new Set<string>();
  const lineIds = new Set<string>();

  ordersForOrg.forEach((o) => {
    ((o.get('Employee') as any[]) || []).forEach((id) => employeeIds.add(id));
    ((o.get('Meal Boxes') as any[]) || []).forEach((id) => mealBoxIds.add(id));
    ((o.get('Order Lines') as any[]) || []).forEach((id) => lineIds.add(id));
  });

  // Employees → имена (учитываем FullName и "Full Name")
const employees = employeeIds.size
  ? await selectAll(TBL.EMPLOYEES, {
      fields: ['FullName', 'Full Name', 'First Name', 'Last Name'],
      filterByFormula: `OR(${[...employeeIds].map((id) => `RECORD_ID()='${id}'`).join(',')})`,
    })
  : [];

const empName = new Map<string, string>();
employees.forEach((e) => {
  const full =
    (e.get('FullName') as string) ||
    (e.get('Full Name') as string) ||
    `${e.get('Last Name') || ''} ${e.get('First Name') || ''}`.trim();
  empName.set(e.getId(), full || '—');
});


  // Meal Boxes → подпись
  const mbs = mealBoxIds.size
    ? await selectAll(TBL.MEAL_BOXES, {
        fields: ['Main Name', 'Side Name', 'MB Label'],
        filterByFormula: `OR(${[...mealBoxIds].map((id) => `RECORD_ID()='${id}'`).join(',')})`,
      })
    : [];
  const mbLabel = new Map<string, string>();
  mbs.forEach((mb) => {
    const label =
      (mb.get('MB Label') as string) ||
      `${mb.get('Main Name') || ''} + ${mb.get('Side Name') || ''}`.trim();
    mbLabel.set(mb.getId(), label);
  });

  // Order Lines → блюда
  const lines = lineIds.size
    ? await selectAll(TBL.ORDER_LINES, {
        fields: ['Order', 'Item (Menu Item)', 'Item Name', 'Quantity'],
        filterByFormula: `OR(${[...lineIds].map((id) => `RECORD_ID()='${id}'`).join(',')})`,
      })
    : [];

  const dishIds = new Set<string>();
  lines.forEach((l) => ((l.get('Item (Menu Item)') as any[]) || []).forEach((id) => dishIds.add(id)));

  const dishes = dishIds.size
    ? await selectAll(TBL.DISHES, {
        fields: ['Category', 'Name'],
        filterByFormula: `OR(${[...dishIds].map((id) => `RECORD_ID()='${id}'`).join(',')})`,
      })
    : [];

  const dishCat = new Map<string, string>();
  dishes.forEach((d) => dishCat.set(d.getId(), String(d.get('Category') || '')));

  // Мапы по заказам
  const orderLineMap = new Map<string, { name: string; qty: number; cat: string }[]>();
  for (const l of lines) {
    const orderRef = ((l.get('Order') as any[]) || [])[0];
    if (!orderRef) continue;
    const itemId = ((l.get('Item (Menu Item)') as any[]) || [])[0];
    const name = String(l.get('Item Name') || '');
    const qty = Number(l.get('Quantity') || 1);
    const cat = dishCat.get(itemId) || '';
    if (!orderLineMap.has(orderRef)) orderLineMap.set(orderRef, []);
    orderLineMap.get(orderRef)!.push({ name, qty, cat });
  }

  const orderMBMap = new Map<string, string[]>();
  for (const o of ordersForOrg) {
    const arr = ((o.get('Meal Boxes') as any[]) || [])
      .map((id: string) => mbLabel.get(id) || '')
      .filter(Boolean);
    orderMBMap.set(o.getId(), arr);
  }

  // Таблица 1
  type Row = { fullName: string; mealBox: string; extra1?: string; extra2?: string };
  const rows: Row[] = [];
  for (const o of ordersForOrg) {
    const fullName = empName.get(((o.get('Employee') as any[]) || [])[0]) || '—';
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

  // Таблица 2 (агрегаты)
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
      const add = (m: Map<string, number>, key: string, inc: number) => m.set(key, (m.get(key) || 0) + inc);
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
