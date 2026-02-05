import { NextRequest, NextResponse } from 'next/server';
import { renderLabelsXLSX } from '@/lib/xlsx';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const org = req.nextUrl.searchParams.get('org') || '';
    const date = req.nextUrl.searchParams.get('date') || '';

    if (!org || !date) {
      return NextResponse.json({ ok: false, error: 'org and date required' }, { status: 400 });
    }

    // Вызываем backend API для получения данных
    const backendUrl = process.env.API_HOST || 'https://bufetgiph-api.vercel.app';
    const apiUrl = `${backendUrl}/api/labels?org=${encodeURIComponent(org)}&date=${encodeURIComponent(date)}`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Backend API error: ${response.status} ${text}`);
    }

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.error || 'Backend returned error');
    }

    const { orgName, dateLabel, rows } = data;

    if (!rows || rows.length === 0) {
      return NextResponse.json({ 
        ok: false, 
        error: 'Нет заказов для выбранной организации и даты' 
      }, { status: 404 });
    }

    // Генерируем XLSX
    const xlsx = await renderLabelsXLSX({
      orgName: orgName || org,
      dateLabel: dateLabel || date,
      rows: rows.map((r: any) => ({
        fullName: String(r.fullName || ''),
        orderDate: String(r.orderDate || ''),
        dishName: String(r.dishName || ''),
        dishDescription: String(r.dishDescription || ''),
      })),
    });

    // Формируем имя файла: Маркировка_НазваниеОрганизации_YYYY-MM-DD.xlsx
    const safeName = (orgName || org).replace(/[^а-яА-Яa-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    const filename = `Маркировка_${safeName}_${dateLabel}.xlsx`;

    return new NextResponse(xlsx, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });

  } catch (e: any) {
    console.error('[labels/export] Error:', e);
    return NextResponse.json(
      { ok: false, error: e.message || String(e) },
      { status: 500 }
    );
  }
}
