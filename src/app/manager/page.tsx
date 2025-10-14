'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ManagerDatesClient from './ManagerDatesClient';

export default function ManagerPageWrapper() {
  return (
    <Suspense fallback={<div className="p-4 text-white/70">Загрузка…</div>}>
      <ManagerPage />
    </Suspense>
  );
}

function ManagerPage() {
  const sp = useSearchParams();
  const org = sp.get('org') || '';
  const employeeID = sp.get('employeeID') || '';
  const token = sp.get('token') || '';

  return <ManagerDatesClient />;
}
