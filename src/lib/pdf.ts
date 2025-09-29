// src/lib/pdf.ts
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fs from 'fs/promises';
import path from 'path';

type EmployeeRow = { fullName: string; mealBox: string; extra1?: string; extra2?: string };
type Counters = {
  salads: [string, number][];
  soups: [string, number][];
  zap: [string, number][];
  mealboxes: [string, number][];
  pastry: [string, number][];
  fruitdrink: [string, number][];
};

const A4 = { w: 595.28, h: 841.89 }; // pt

let cachedRegular: Uint8Array | null = null;
let cachedBold: Uint8Array | null = null;

async function loadLocalFont(relPath: string): Promise<Uint8Array> {
  const abs = path.join(process.cwd(), relPath);
  const buf = await fs.readFile(abs);
  return new Uint8Array(buf);
}

export async function renderKitchenDailyPDF(input: {
  orgName: string;
  dateLabel: string;
  rows: EmployeeRow[];
  counters: Counters;
}): Promise<Buffer> {
  const { orgName, dateLabel, rows, counters } = input;

  if (!cachedRegular) cachedRegular = await loadLocalFont('public/fonts/NotoSans-Regular.ttf');
  if (!cachedBold) cachedBold = await loadLocalFont('public/fonts/NotoSans-Bold.ttf');

  const doc = await PDFDocument.create();

  // ВАЖНО: регистрируем fontkit перед embedFont
  doc.registerFontkit(fontkit);

  const page = doc.addPage([A4.w, A4.h]);

  const font = await doc.embedFont(cachedRegular, { subset: false });
  const fontBold = await doc.embedFont(cachedBold, { subset: false });


  let xMargin = 40;
  let y = A4.h - 50;

  // Заголовок
  const title = `${orgName} — ${dateLabel}`;
  page.drawText(title, { x: xMargin, y, size: 20, font: fontBold, color: rgb(0.07, 0.07, 0.07) });
  y -= 18;
  page.drawText('Таблица 1 — сотрудники и их заказы · Таблица 2 — агрегаты по блюдам', {
    x: xMargin, y, size: 10, font, color: rgb(0.4, 0.4, 0.4),
  });
  y -= 18;

  // Таблица 1
  const totalW = A4.w - 2 * xMargin;
  const col = {
    name: { x: xMargin,                 w: 0.36 * totalW },
    mb:   { x: xMargin + 0.36*totalW+8, w: 0.32 * totalW },
    x1:   { x: xMargin + 0.68*totalW+16,w: 0.16 * totalW },
    x2:   { x: xMargin + 0.84*totalW+24,w: 0.16 * totalW },
  };
  const lineH = 16;
  const headerH = 18;

  const drawHeader = (p = page) => {
    p.drawRectangle({ x: xMargin-4, y: y - headerH + 4, width: totalW + 8, height: headerH, color: rgb(0.98,0.98,0.98) });
    p.drawText('Полное имя', { x: col.name.x, y, size: 11, font: fontBold, color: rgb(0.1,0.1,0.1) });
    p.drawText('Meal box',   { x: col.mb.x,   y, size: 11, font: fontBold });
    p.drawText('Extra 1',    { x: col.x1.x,   y, size: 11, font: fontBold });
    p.drawText('Extra 2',    { x: col.x2.x,   y, size: 11, font: fontBold });
    y -= headerH;
    p.drawLine({ start: {x:xMargin-4, y:y+3}, end: {x:xMargin-4 + totalW + 8, y:y+3}, thickness: 0.7, color: rgb(0.91,0.91,0.92) });
  };

  const addPage = () => { const p = doc.addPage([A4.w, A4.h]); y = A4.h - 50; return p; };

  let p = page;
  drawHeader(p);

  const drawRow = (r: EmployeeRow) => {
    p.drawText(cut(r.fullName, font, 10.5, col.name.w), { x: col.name.x, y, size: 10.5, font });
    p.drawText(cut(r.mealBox || '', font, 10.5, col.mb.w), { x: col.mb.x, y, size: 10.5, font });
    p.drawText(cut(r.extra1 || '', font, 10.5, col.x1.w), { x: col.x1.x, y, size: 10.5, font });
    p.drawText(cut(r.extra2 || '', font, 10.5, col.x2.w), { x: col.x2.x, y, size: 10.5, font });
    y -= lineH;
    p.drawLine({ start: {x:xMargin-4, y:y+3}, end: {x:xMargin-4 + totalW + 8, y:y+3}, thickness: 0.5, color: rgb(0.91,0.91,0.92) });
  };

  for (const r of rows) {
    if (y < 200) { p = addPage(); drawHeader(p); }
    drawRow(r);
  }

  // Отступ и агрегаты
  if (y < 220) { p = addPage(); }
  y -= 8;

  const leftX = xMargin, rightX = xMargin + totalW/2 + 8;
  const colW2 = totalW/2 - 8;

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
      p.drawText(cut(line, font, 10.5, colW2), { x, y, size: 10.5, font });
      y -= 12;
    }
    y -= 6;
  };

  // Левая колонка
  drawSection('САЛАТЫ', counters.salads, leftX);
  drawSection('СУПЫ', counters.soups, leftX);
  drawSection('БЛИНЫ И ЗАПЕКАНКИ', counters.zap, leftX);

  // Правая колонка
  if (y < 120) { p = addPage(); }
  drawSection('ОСНОВНОЕ БЛЮДО И ГАРНИР', counters.mealboxes, rightX);
  drawSection('ВЫПЕЧКА', counters.pastry, rightX);
  drawSection('ФРУКТЫ И НАПИТКИ', counters.fruitdrink, rightX);

  const bytes = await doc.save();
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
