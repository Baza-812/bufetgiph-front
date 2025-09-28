// src/lib/pdf.ts
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

type EmployeeRow = { fullName: string; mealBox: string; extra1?: string; extra2?: string };
type Counters = {
  salads: [string, number][];
  soups: [string, number][];
  zap: [string, number][];
  mealboxes: [string, number][];
  pastry: [string, number][];
  fruitdrink: [string, number][];
};

const A4 = { w: 595.28, h: 841.89 }; // points

export async function renderKitchenDailyPDF(input: {
  orgName: string;
  dateLabel: string;
  rows: EmployeeRow[];
  counters: Counters;
}): Promise<Buffer> {
  const { orgName, dateLabel, rows, counters } = input;

  const doc = await PDFDocument.create();
  const page = doc.addPage([A4.w, A4.h]);

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  let xMargin = 40;
  let y = A4.h - 50;

  // Шапка
  const title = `${orgName} — ${dateLabel}`;
  page.drawText(title, { x: xMargin, y, size: 20, font: fontBold, color: rgb(0.07, 0.07, 0.07) });
  y -= 18;
  page.drawText('Таблица 1 — сотрудники и их заказы · Таблица 2 — агрегаты по блюдам', {
    x: xMargin, y, size: 10, font, color: rgb(0.4, 0.4, 0.4),
  });
  y -= 18;

  // Таблица 1 — колонки
  const col = {
    name: { x: xMargin, w: 0.36 * (A4.w - 2 * xMargin) },
    mb:   { x: 0, w: 0.32 * (A4.w - 2 * xMargin) },
    x1:   { x: 0, w: 0.16 * (A4.w - 2 * xMargin) },
    x2:   { x: 0, w: 0.16 * (A4.w - 2 * xMargin) },
  };
  col.mb.x = col.name.x + col.name.w + 8;
  col.x1.x = col.mb.x + col.mb.w + 8;
  col.x2.x = col.x1.x + col.x1.w + 8;

  const lineH = 16;
  const headerH = 18;
  const drawHeader = (p: typeof page) => {
    p.drawRectangle({ x: xMargin-4, y: y - headerH + 4, width: (A4.w - 2*xMargin)+8, height: headerH, color: rgb(0.98,0.98,0.98) });
    p.drawText('Полное имя', { x: col.name.x, y: y, size: 11, font: fontBold, color: rgb(0.1,0.1,0.1) });
    p.drawText('Meal box',   { x: col.mb.x,   y: y, size: 11, font: fontBold });
    p.drawText('Extra 1',    { x: col.x1.x,   y: y, size: 11, font: fontBold });
    p.drawText('Extra 2',    { x: col.x2.x,   y: y, size: 11, font: fontBold });
    y -= headerH;
    p.drawLine({ start: {x:xMargin-4, y:y+3}, end: {x:A4.w-xMargin+4, y:y+3}, thickness: 0.7, color: rgb(0.91,0.91,0.92) });
  };

  const addPage = () => {
    const p = doc.addPage([A4.w, A4.h]);
    y = A4.h - 50;
    return p;
  };

  let p = page;
  drawHeader(p);

  const drawRow = (r: EmployeeRow) => {
    p.drawText(cut(r.fullName, font, 10.5, col.name.w), { x: col.name.x, y: y, size: 10.5, font });
    p.drawText(cut(r.mealBox||'', font, 10.5, col.mb.w), { x: col.mb.x, y: y, size: 10.5, font });
    p.drawText(cut(r.extra1||'', font, 10.5, col.x1.w), { x: col.x1.x, y: y, size: 10.5, font });
    p.drawText(cut(r.extra2||'', font, 10.5, col.x2.w), { x: col.x2.x, y: y, size: 10.5, font });
    y -= lineH;
    p.drawLine({ start: {x:xMargin-4, y:y+3}, end: {x:A4.w-xMargin+4, y:y+3}, thickness: 0.5, color: rgb(0.91,0.91,0.92) });
  };

  for (const r of rows) {
    if (y < 200) { // оставим место для агрегатов/переноса
      p = addPage();
      drawHeader(p);
    }
    drawRow(r);
  }

  // Отступ перед агрегатами
  if (y < 220) { p = addPage(); }
  y -= 8;

  // Таблица 2 — два столбца блоков
  const leftX = xMargin, rightX = xMargin + (A4.w - 2*xMargin)/2 + 8;
  const colW = (A4.w - 2*xMargin)/2 - 8;

  const drawSection = (title: string, items: [string, number][], x: number) => {
    p.drawText(title.toUpperCase(), { x, y, size: 11.5, font: fontBold });
    y -= 14;
    if (items.length === 0) {
      p.drawText('—', { x, y, size: 10.5, font, color: rgb(0.55,0.55,0.55) });
      y -= 12;
      return;
    }
    for (const [name, qty] of items) {
      if (y < 60) { p = addPage(); }
      const line = `${name} — ${qty} шт`;
      p.drawText(cut(line, font, 10.5, colW), { x, y, size: 10.5, font });
      y -= 12;
    }
    y -= 6;
  };

  // Левая колонка
  drawSection('САЛАТЫ', counters.salads, leftX);
  drawSection('СУПЫ', counters.soups, leftX);
  drawSection('БЛИНЫ И ЗАПЕКАНКИ', counters.zap, leftX);

  // Правая колонка (если места мало — новая страница)
  if (y < 120) { p = addPage(); }
  drawSection('ОСНОВНОЕ БЛЮДО И ГАРНИР', counters.mealboxes, rightX);
  drawSection('ВЫПЕЧКА', counters.pastry, rightX);
  drawSection('ФРУКТЫ И НАПИТКИ', counters.fruitdrink, rightX);

  const bytes = await doc.save(); // Uint8Array
  return Buffer.from(bytes);
}

function cut(text: string, font: any, size: number, maxW: number) {
  if (!text) return '';
  let t = text;
  while (font.widthOfTextAtSize(t, size) > maxW) {
    if (t.length <= 1) break;
    t = t.slice(0, -1);
  }
  if (t.length < text.length) t = t.slice(0, -1) + '…';
  return t;
}
