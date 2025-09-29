// src/lib/xlsx.ts
import ExcelJS from 'exceljs';

type Row = { fullName: string; mealBox: string; extra1?: string; extra2?: string };
type Counters = {
  salads: [string, number][],
  soups: [string, number][],
  zap: [string, number][],
  mealboxes: [string, number][],
  pastry: [string, number][],
  fruitdrink: [string, number][],
};

export async function renderKitchenDailyXLSX(opts: {
  orgName: string;
  dateLabel: string;
  rows: Row[];
  counters: Counters;
}): Promise<Uint8Array> {
  const { orgName, dateLabel, rows, counters } = opts;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Baza Orders';
  wb.created = new Date();

  // ===== Лист 1: Сотрудники =====
  const ws = wb.addWorksheet('Сотрудники', {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { tabColor: { argb: 'FF4F7CAC' } },
    pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'portrait' },
  });

  ws.columns = [
    { header: 'Полное имя', key: 'fullName', width: 32 },
    { header: 'Meal Box',   key: 'mealBox',  width: 42 },
    { header: 'Extra 1',    key: 'extra1',   width: 40 },
    { header: 'Extra 2',    key: 'extra2',   width: 40 },
  ];

  // шапка
  const title = `Заказы — ${orgName} — ${dateLabel}`;
  ws.mergeCells(1,1,1,4);
  ws.getCell(1,1).value = title;
  ws.getCell(1,1).font = { bold: true, size: 14 };
  ws.getCell(1,1).alignment = { vertical: 'middle', horizontal: 'left' };
  ws.addRow([]); // пустая строка
  // заголовки
  const headerRow = ws.addRow(ws.columns.map(c => c.header as string));
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle' };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF3F6' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
  });

  // строки
  for (const r of rows) {
  ws.addRow([
    r.fullName || '',
    r.mealBox  || '',
    r.extra1   || '',
    r.extra2   || '',
  ]);
}

  // автофильтр и формат
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 4 } };
  ws.getColumn('fullName').alignment = { wrapText: true };
  ws.getColumn('mealBox' ).alignment = { wrapText: true };
  ws.getColumn('extra1'  ).alignment = { wrapText: true };
  ws.getColumn('extra2'  ).alignment = { wrapText: true };

  // ===== Лист 2: Агрегаты =====
  const w2 = wb.addWorksheet('Агрегаты', {
    views: [{ state: 'frozen', ySplit: 1 }],
    pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'portrait' },
  });

  const sections: Array<{ title: string; data: [string, number][] }> = [
    { title: 'САЛАТЫ', data: counters.salads },
    { title: 'СУПЫ', data: counters.soups },
    { title: 'БЛИНЫ И ЗАПЕКАНКИ', data: counters.zap },
    { title: 'MEAL BOX', data: counters.mealboxes },
    { title: 'ВЫПЕЧКА', data: counters.pastry },
    { title: 'ФРУКТЫ И НАПИТКИ', data: counters.fruitdrink },
  ];

  let rowPtr = 1;
  for (const sec of sections) {
    w2.mergeCells(rowPtr,1,rowPtr,3);
    const c = w2.getCell(rowPtr,1);
    c.value = sec.title;
    c.font = { bold: true, size: 12 };
    rowPtr++;

    const hdr = w2.getRow(rowPtr);
    hdr.getCell(1).value = 'Наименование';
    hdr.getCell(2).value = 'Кол-во';
    hdr.font = { bold: true };
    rowPtr++;

    for (const [name, cnt] of sec.data) {
      w2.getCell(rowPtr,1).value = name;
      w2.getCell(rowPtr,2).value = cnt;
      rowPtr++;
    }
    rowPtr++; // пустая строка между секциями
  }

  ws.getColumn(1).alignment = { wrapText: true };
ws.getColumn(2).alignment = { wrapText: true };
ws.getColumn(3).alignment = { wrapText: true };
ws.getColumn(4).alignment = { wrapText: true };

  // ===== Генерация =====
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBufferLike);
}
