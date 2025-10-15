'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ManagerOrderClient from './ManagerOrderClient';

export default function ManagerOrderPageWrapper() {
  return (
    <Suspense fallback={<div className="p-4 text-white/70">Загрузка…</div>}>
      <ManagerOrderPage />
    </Suspense>
  );
}

function ManagerOrderPage() {
  const sp = useSearchParams();
  const org = sp.get('org') || '';
  const employeeID = sp.get('employeeID') || '';
  const token = sp.get('token') || '';
  const date = sp.get('date') || '';

  return <ManagerOrderClient org={org} employeeID={employeeID} token={token} date={date} />;
}
