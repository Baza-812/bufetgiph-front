// src/app/order/page.tsx  — SERVER component (нет "use client")
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import OrderClient from './OrderClient';

export default function Page() {
  return <OrderClient />;
}
