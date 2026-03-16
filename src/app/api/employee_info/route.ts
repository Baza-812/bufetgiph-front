// src/app/api/employee_info/route.ts
// Endpoint для получения информации о сотруднике

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const employeeID = searchParams.get('employeeID');
    const org = searchParams.get('org');
    const token = searchParams.get('token');

    if (!employeeID || !org || !token) {
      return NextResponse.json({ 
        ok: false, 
        error: 'employeeID, org, token required' 
      }, { status: 400 });
    }

    // Определяем API_BASE в зависимости от окружения
    const API_BASE = 
      process.env.VERCEL_ENV === 'production' 
        ? 'https://bufetgiph-api.vercel.app' 
        : 'https://dev-bufetgiph-api.vercel.app';

    // Прокси запрос на backend
    const backendUrl = new URL(`${API_BASE}/api/employee_info`);
    backendUrl.searchParams.set('employeeID', employeeID);
    backendUrl.searchParams.set('org', org);
    backendUrl.searchParams.set('token', token);

    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    
    // Поддержка обхода Vercel Protection
    const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    if (bypassSecret) {
      headers['x-vercel-protection-bypass'] = bypassSecret;
    }

    const response = await fetch(backendUrl.toString(), { headers });
    
    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ 
        ok: false, 
        error: `Backend error: ${response.status}` 
      }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (err) {
    console.error('[employee_info] Error:', err);
    return NextResponse.json({ 
      ok: false, 
      error: err instanceof Error ? err.message : String(err) 
    }, { status: 500 });
  }
}

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { 
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
