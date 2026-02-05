// src/lib/xlsx.ts
import ExcelJS from 'exceljs';

type Row = { fullName: string; mealBox: string; extra1?: string; extra2?: string };

// Для маркировки: каждое блюдо в отдельной строке
type LabelRow = {
  fullName: string;
  orderDate: string;
  dishName: string;
  dishDescription: string;
};
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
    views: [{ state: 'frozen', ySplit: 3 }],
    properties: { tabColor: { argb: 'FF4F7CAC' } },
    pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'portrait' },
  });

  // Колонки только для ширины / автофильтра — писать будем МАССИВАМИ по индексам!
  ws.columns = [
    { header: 'Полное имя', key: 'c1', width: 32 },
    { header: 'Meal Box',   key: 'c2', width: 42 },
    { header: 'Extra 1',    key: 'c3', width: 40 },
    { header: 'Extra 2',    key: 'c4', width: 40 },
  ];

  // Заголовок
  ws.mergeCells(1,1,1,4);
  ws.getCell(1,1).value = `Заказы — ${orgName} — ${dateLabel}`;
  ws.getCell(1,1).font = { bold: true, size: 14 };
  ws.getCell(1,1).alignment = { vertical: 'middle', horizontal: 'left' };

  // Пустая строка
  ws.addRow(['', '', '', '']);

  // Шапка таблицы
  const hdr = ws.addRow(['Полное имя', 'Meal Box', 'Extra 1', 'Extra 2']);
  hdr.font = { bold: true };
  hdr.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF3F6' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };
  });

  // Строки — МАССИВАМИ по индексам:
  for (const r of rows) {
    ws.addRow([
      (r.fullName ?? '').toString(),
      (r.mealBox  ?? '').toString(),
      (r.extra1   ?? '').toString(),
      (r.extra2   ?? '').toString(),
    ]);
  }

  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: 4 } };
  ws.getColumn(1).alignment = { wrapText: true };
  ws.getColumn(2).alignment = { wrapText: true };
  ws.getColumn(3).alignment = { wrapText: true };
  ws.getColumn(4).alignment = { wrapText: true };

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

    const hdr2 = w2.getRow(rowPtr);
    hdr2.getCell(1).value = 'Наименование';
    hdr2.getCell(2).value = 'Кол-во';
    hdr2.font = { bold: true };
    rowPtr++;

    for (const [name, cnt] of sec.data) {
      w2.getCell(rowPtr,1).value = name;
      w2.getCell(rowPtr,2).value = cnt;
      rowPtr++;
    }
    rowPtr++;
  }
  w2.getColumn(1).width = 50;
  w2.getColumn(2).width = 12;

  // ===== Лист 3: RAW (для проверки того, что пришло в функцию)
  const wr = wb.addWorksheet('RAW', { views: [{ state: 'frozen', ySplit: 1 }] });
  wr.addRow(['fullName', 'mealBox', 'extra1', 'extra2']);
  wr.getRow(1).font = { bold: true };
  for (const r of rows.slice(0, 2000)) {
    wr.addRow([
      (r.fullName ?? '').toString(),
      (r.mealBox  ?? '').toString(),
      (r.extra1   ?? '').toString(),
      (r.extra2   ?? '').toString(),
    ]);
  }
  wr.getColumn(1).width = 32;
  wr.getColumn(2).width = 42;
  wr.getColumn(3).width = 40;
  wr.getColumn(4).width = 40;

  // Генерация
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf);
}

/**
 * Генерация XLSX файла для маркировки
 * Каждое блюдо (Meal Box, Extra1, Extra2) в отдельной строке
 */
export async function renderLabelsXLSX(opts: {
  orgName: string;
  dateLabel: string;
  rows: LabelRow[];
}): Promise<Uint8Array> {
  const { orgName, dateLabel, rows } = opts;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Baza Orders - Labels';
  wb.created = new Date();

  const ws = wb.addWorksheet('Маркировка', {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { tabColor: { argb: 'FFFF6B35' } },
    pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'landscape' },
  });

  // Колонки
  ws.columns = [
    { header: 'FullName', key: 'c1', width: 32 },
    { header: 'Order Date', key: 'c2', width: 12 },
    { header: 'Наименование блюда', key: 'c3', width: 50 },
    { header: 'Состав блюда', key: 'c4', width: 60 },
  ];

  // Шапка таблицы
  const hdr = ws.addRow(['FullName', 'Order Date', 'Наименование блюда', 'Состав блюда']);
  hdr.font = { bold: true, size: 11 };
  hdr.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF3F6' } };
    cell.border = { 
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    };
  });

  // Данные
  for (const r of rows) {
    const row = ws.addRow([
      (r.fullName ?? '').toString(),
      (r.orderDate ?? '').toString(),
      (r.dishName ?? '').toString(),
      (r.dishDescription ?? '').toString(),
    ]);
    
    // Границы для всех ячеек
    row.eachCell((cell) => {
      cell.border = { 
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      };
    });
  }

  // Автофильтр
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 4 } };
  
  // Выравнивание
  ws.getColumn(1).alignment = { wrapText: true, vertical: 'top' };
  ws.getColumn(2).alignment = { horizontal: 'center', vertical: 'top' };
  ws.getColumn(3).alignment = { wrapText: true, vertical: 'top' };
  ws.getColumn(4).alignment = { wrapText: true, vertical: 'top' };

  // Генерация
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf);
}
