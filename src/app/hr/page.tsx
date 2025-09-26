// src/app/hr/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function HRIndexPage() {
  const router = useRouter();
  const sp = useSearchParams();

  useEffect(() => {
    const u = new URL('/hr/console', window.location.origin);
    // сохраняем query-параметры при редиректе
    sp.forEach((v, k) => u.searchParams.set(k, v));
    router.replace(u.pathname + (u.search ? `?${u.searchParams.toString()}` : ''));
  }, [router, sp]);

  return null;
}
