// src/app/order/page.tsx
import { Suspense } from 'react';
import OrderClient from './OrderClient';

export default function OrderPage() {
  return (
    <Suspense>
      <OrderClient />
    </Suspense>
  );
}
