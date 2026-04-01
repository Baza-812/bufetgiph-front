// src/app/api/pricing_plan/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getBackendApiBase } from '@/lib/backendApiBase';

export async function GET(req: NextRequest) {
  try {
    const API_BASE = getBackendApiBase();
    const url = new URL(req.url);
    const backendUrl = `${API_BASE}/api/pricing_plan?${url.searchParams.toString()}`;

    const headers: HeadersInit = { 'Content-Type': 'application/json' };

    const bypassToken = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    if (bypassToken) {
      (headers as Record<string, string>)['x-vercel-protection-bypass'] = bypassToken;
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
