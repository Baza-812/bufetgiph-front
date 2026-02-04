// src/app/api/org_info/route.ts
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const org = searchParams.get('org');

    if (!org) {
      return NextResponse.json({ ok: false, error: 'org required' }, { status: 400 });
    }

    const apiUrl = `${API_BASE}/api/org_info?org=${encodeURIComponent(org)}`;
    const resp = await fetch(apiUrl, { cache: 'no-store' });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json(
        { ok: false, error: `API error: ${resp.status} ${text}` },
        { status: resp.status }
      );
    }

    const data = await resp.json();
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
