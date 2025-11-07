import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECT_PREFIX = ['/kitchen'];

export function middleware(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  if (!PROTECT_PREFIX.some(p => pathname.startsWith(p))) return NextResponse.next();

  const required = process.env.KITCHEN_ACCESS_KEY;
  if (!required) return NextResponse.next(); // без ключа в .env ничего не блокируем

  const got = searchParams.get('key');
  if (got && got === required) return NextResponse.next();

  return new NextResponse('Not found', { status: 404 });
}

export const config = {
  matcher: ['/kitchen/:path*'],
};
