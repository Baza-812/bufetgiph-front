// src/lib/pdf.ts
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export async function renderPdfFromHtml(html: string) {
  // На Vercel executablePath вернётся из chromium, локально может быть null
  const executablePath = await chromium.executablePath();

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1240, height: 1754 }, // A4
    executablePath: executablePath || undefined,
    // В новых версиях нет chromium.headless — укажем явно
    headless: true, // или 'new' если используешь Puppeteer >= 22
  });

  const page = await browser.newPage();
  await page.setContent(html, {
    waitUntil: ['load', 'domcontentloaded', 'networkidle0'],
  });

  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '18mm', right: '14mm', bottom: '16mm', left: '14mm' },
  });

  await browser.close();
  return pdf; // Buffer
}
