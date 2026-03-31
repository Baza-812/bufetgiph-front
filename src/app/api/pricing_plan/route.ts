// src/app/api/pricing_plan/route.ts
import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const backendUrl = `${BACKEND_URL}/api/pricing_plan?${url.searchParams.toString()}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Добавляем Vercel bypass header если есть
    const bypassToken = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    if (bypassToken) {
      headers['x-vercel-protection-bypass'] = bypassToken;
    }

    const backendRes = await fetch(backendUrl, {
      method: 'GET',
      headers,
    });

    const data = await backendRes.json();
    return NextResponse.json(data, { status: backendRes.status });

  } catch (err) {
    console.error('/api/pricing_plan proxy error:', err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return NextResponse.json({ ok: true }, { status: 200 });
}
