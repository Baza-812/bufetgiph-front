// src/app/order/page.tsx
'use client';

import OrderClient from './OrderClient';

export default function OrderPage() {
  // Никакой собственной логики на странице — всё внутри OrderClient
  return <OrderClient />;
}
