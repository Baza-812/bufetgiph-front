// src/app/api/payment/create/route.ts
import { NextRequest, NextResponse } from 'next/server';

// Определяем backend API в зависимости от окружения
const isProd = process.env.VERCEL_ENV === 'production';
const API_BASE = isProd
  ? 'https://bufetgiph-api.vercel.app'
  : 'https://dev-bufetgiph-api.vercel.app';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    const resp = await fetch(`${API_BASE}/api/payment_create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await resp.json();
    
    return NextResponse.json(data, { status: resp.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Payment creation failed' },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
