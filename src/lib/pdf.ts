// src/lib/pdf.ts
import fs from 'fs/promises';
import path from 'path';
// @ts-ignore — у pdfmake кривые тайпинги, используем как any

type EmployeeRow = { fullName: string; mealBox: string; extra1?: string; extra2?: string };
type Counters = {
  salads: [string, number][];
  soups: [string, number][];
  zap: [string, number][];
  mealboxes: [string, number][];
  pastry: [string, number][];
  fruitdrink: [string, number][];
};

export async function renderKitchenDailyPDF(input: {
  orgName: string;
  dateLabel: string;
  rows: EmployeeRow[];
  counters: Counters;
}): Promise<Buffer> {
  const { orgName, dateLabel, rows, counters } = input;

  // 1) динамически читаем TTF
  if (!cachedRegular) cachedRegular = await loadLocalFont('public/fonts/NotoSans-Regular.ttf');
  if (!cachedBold)    cachedBold    = await loadLocalFont('public/fonts/NotoSans-Bold.ttf');

  // 2) динамически импортируем pdfmake на рантайме (а не при билде)
  const PdfMakeMod = await import('pdfmake');
  const PdfPrinter = (PdfMakeMod as any).default ?? (PdfMakeMod as any);

  const fonts = {
    NotoSans: {
      normal: cachedRegular,
      bold:   cachedBold,
    },
  };

  const printer = new PdfPrinter(fonts);

  // Таблица 1 — сотрудники
  const table1Body = [
    [
      { text: 'Полное имя', style: 'th' },
      { text: 'Meal box',   style: 'th' },
      { text: 'Extra 1',    style: 'th' },
      { text: 'Extra 2',    style: 'th' },
    ],
    ...rows.map(r => [
      r.fullName || '',
      r.mealBox  || '',
      r.extra1   || '',
      r.extra2   || '',
    ]),
  ];

  const aggList = (pairs: [string, number][]) =>
    pairs.length
      ? pairs.map(([name, qty]) => ({ columns: [ { text: name, width: '*'}, { text: `${qty} шт`, width: 40, alignment: 'right' } ], margin: [0, 1, 0, 1] }))
      : [ { text: '—', color: '#666' } ];

  const docDefinition = {
    defaultStyle: { font: 'NotoSans', fontSize: 10.5, color: '#111' },
    styles: {
      h1: { fontSize: 20, bold: true, margin: [0,0,0,4] },
      sub: { color: '#666', margin: [0,0,0,12] },
      th: { bold: true, fillColor: '#FAFAFA' },
      blockTitle: { bold: true, fontSize: 11.5, margin: [0,8,0,6] },
    },
    content: [
      { text: `${orgName} — ${dateLabel}`, style: 'h1' },
      { text: 'Таблица 1 — сотрудники и их заказы · Таблица 2 — агрегаты по блюдам', style: 'sub' },

      {
        table: {
          headerRows: 1,
          widths: ['36%','32%','16%','16%'],
          body: table1Body,
        },
        layout: {
          fillColor: (rowIndex: number) => (rowIndex === 0 ? '#FAFAFA' : (rowIndex % 2 ? '#FCFCFD' : null)),
          hLineColor: '#E7E7EA',
          vLineColor: '#E7E7EA',
        },
        margin: [0,0,0,10],
      },

      {
        columns: [
          {
            width: '50%',
            stack: [
              { text: 'САЛАТЫ', style: 'blockTitle' },
              ...aggList(counters.salads),
              { text: 'СУПЫ', style: 'blockTitle' },
              ...aggList(counters.soups),
              { text: 'БЛИНЫ И ЗАПЕКАНКИ', style: 'blockTitle' },
              ...aggList(counters.zap),
            ],
          },
          {
            width: '50%',
            stack: [
              { text: 'ОСНОВНОЕ БЛЮДО И ГАРНИР', style: 'blockTitle' },
              ...aggList(counters.mealboxes),
              { text: 'ВЫПЕЧКА', style: 'blockTitle' },
              ...aggList(counters.pastry),
              { text: 'ФРУКТЫ И НАПИТКИ', style: 'blockTitle' },
              ...aggList(counters.fruitdrink),
            ],
          },
        ],
        columnGap: 16,
      },
    ],
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 40],
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  const chunks: Buffer[] = [];
    return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Uint8Array[] = [];

    pdfDoc.on('data', (c: Uint8Array) => chunks.push(c));
    pdfDoc.on('end', () => {
      // Склеиваем Uint8Array[] вручную в Buffer
      let total = 0;
      for (const c of chunks) total += c.length;
      const out = Buffer.allocUnsafe(total);
      let offset = 0;
      for (const c of chunks) { out.set(c, offset); offset += c.length; }
      resolve(out);
    });
    pdfDoc.on('error', reject);
    pdfDoc.end();
  });


}
