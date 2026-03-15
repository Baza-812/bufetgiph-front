// src/app/api/payment/create/route.ts
import { NextRequest, NextResponse } from 'next/server';

// Определяем backend API в зависимости от окружения
const isProd = process.env.VERCEL_ENV === 'production';
const API_BASE = isProd
  ? 'https://bufetgiph-api.vercel.app'
  : 'https://dev-bufetgiph-api.vercel.app';

export async function POST(req: NextRequest) {
  try {
    console.log('[payment/create route] Starting...');
    console.log('[payment/create route] API_BASE:', API_BASE);
    console.log('[payment/create route] VERCEL_ENV:', process.env.VERCEL_ENV);
    
    const body = await req.json();
    console.log('[payment/create route] Body received:', JSON.stringify(body));
    
    const backendUrl = `${API_BASE}/api/payment_create`;
    console.log('[payment/create route] Calling backend:', backendUrl);
    
    const resp = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    console.log('[payment/create route] Backend response status:', resp.status);
    
    const data = await resp.json();
    console.log('[payment/create route] Backend response data:', JSON.stringify(data));
    
    return NextResponse.json(data, { status: resp.status });
  } catch (err) {
    console.error('[payment/create route] ERROR:', err);
    console.error('[payment/create route] Stack:', err instanceof Error ? err.stack : 'no stack');
    
    return NextResponse.json(
      { 
        ok: false,
        error: err instanceof Error ? err.message : 'Payment creation failed',
        details: err instanceof Error ? err.stack : undefined
      },
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
