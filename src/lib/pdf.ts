// src/lib/pdf.ts
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export async function renderPdfFromHtml(html: string) {
  const executablePath = await chromium.executablePath();
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1240, height: 1754 }, // A4-ish
    executablePath,
    headless: chromium.headless,
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: ['load','domcontentloaded','networkidle0'] });
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '18mm', right: '14mm', bottom: '16mm', left: '14mm' },
  });
  await browser.close();
  return pdf; // Buffer
}
