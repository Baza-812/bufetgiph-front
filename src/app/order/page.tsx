// src/app/order/page.tsx
import { Suspense } from 'react';
import OrderClient from './OrderClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function Page() {
  return (
    <Suspense fallback={<div className="text-white/60 text-sm">Загрузка…</div>}>
      <OrderClient />
    </Suspense>
  );
}
