// src/lib/xlsx.ts
import ExcelJS from 'exceljs';

type EmployeeRow = { fullName: string; mealBox: string; extra1?: string; extra2?: string };
type Counters = {
  salads: [string, number][];
  soups: [string, number][];
  zap: [string, number][];
  mealboxes: [string, number][];
  pastry: [string, number][];
  fruitdrink: [string, number][];
};

export async function renderKitchenDailyXLSX(input: {
  orgName: string;
  dateLabel: string;  // ДД.ММ.ГГГГ
  rows: EmployeeRow[];
  counters: Counters;
}): Promise<Buffer> {
  const { orgName, dateLabel, rows, counters } = input;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Baza Orders';
  wb.created = new Date();
  (wb as any).properties = { ...(wb as any).properties, title: `Заказы — ${orgName} — ${dateLabel}` };


  // ===== Лист 1: Сотрудники =====
  const ws = wb.addWorksheet('Сотрудники', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }],
  });

  ws.columns = [
    { header: 'Полное имя', key: 'fullName', width: 34 },
    { header: 'Meal box',   key: 'mealBox',  width: 28 },
    { header: 'Extra 1',    key: 'extra1',   width: 24 },
    { header: 'Extra 2',    key: 'extra2',   width: 24 },
  ];

  // шапка
  const header = ws.getRow(1);
  header.height = 22;
  header.font = { bold: true };
  header.alignment = { vertical: 'middle' };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFAFA' } };
    cell.border = {
      top:    { style: 'thin', color: { argb: 'FFE7E7EA' } },
      left:   { style: 'thin', color: { argb: 'FFE7E7EA' } },
      bottom: { style: 'thin', color: { argb: 'FFE7E7EA' } },
      right:  { style: 'thin', color: { argb: 'FFE7E7EA' } },
    };
  });

  // строки
  rows.forEach((r) => ws.addRow(r));
  // «зебра»
  ws.eachRow((row, idx) => {
    if (idx === 1) return;
    if (idx % 2 === 0) {
      row.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCFCFD' } }));
    }
    row.eachCell((c) => {
      c.border = { bottom: { style: 'hair', color: { argb: 'FFE7E7EA' } } };
      c.alignment = { vertical: 'middle' };
    });
  });

  ws.autoFilter = { from: 'A1', to: 'D1' };
  ws.getColumn('fullName').eachCell((cell, rowNumber) => {
    if (rowNumber > 1) cell.alignment = { wrapText: false };
  });

  // ===== Лист 2: Агрегаты =====
  const ws2 = wb.addWorksheet('Агрегаты');
  const titleRow = ws2.addRow([`${orgName} — ${dateLabel}`]);
  titleRow.font = { bold: true, size: 14 };
  titleRow.height = 20;
  ws2.addRow([]);

  const section = (name: string, items: [string, number][]) => {
    const head = ws2.addRow([name]);
    head.font = { bold: true };
    if (items.length === 0) {
      ws2.addRow(['—']);
      ws2.addRow([]);
      return;
    }
    const tableHeader = ws2.addRow(['Блюдо', 'Кол-во']);
    tableHeader.font = { bold: true };
    items.forEach(([n, q]) => ws2.addRow([n, q]));
    ws2.addRow([]);
  };

  section('САЛАТЫ', counters.salads);
  section('СУПЫ', counters.soups);
  section('БЛИНЫ И ЗАПЕКАНКИ', counters.zap);
  section('ОСНОВНОЕ БЛЮДО И ГАРНИР', counters.mealboxes);
  section('ВЫПЕЧКА', counters.pastry);
  section('ФРУКТЫ И НАПИТКИ', counters.fruitdrink);

  ws2.columns = [{ width: 50 }, { width: 12 }];

  // ===== Буфер XLSX =====
  const out = (await wb.xlsx.writeBuffer()) as unknown as ArrayBuffer | Buffer;
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
}
