// src/app/hr/page.tsx
'use client';

import { Suspense } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import { useSearchParams, useRouter } from 'next/navigation';

export default function HRPageWrapper() {
  // Обязательно оборачиваем в Suspense всё, что читает searchParams
  return (
    <Suspense fallback={<div className="text-white/70 p-4">Загрузка…</div>}>
      <HRPage />
    </Suspense>
  );
}

function HRPage() {
  const sp = useSearchParams();
  const router = useRouter();

  const org = sp.get('org') || '';
  const employeeID = sp.get('employeeID') || '';
  const token = sp.get('token') || '';

  function openConsole() {
    const u = new URL('/hr/console', window.location.origin);
    if (org) u.searchParams.set('org', org);
    if (employeeID) u.searchParams.set('employeeID', employeeID);
    if (token) u.searchParams.set('token', token);
    router.push(u.toString());
  }

  function openRegister() {
    const u = new URL('/register', window.location.origin);
    if (org) u.searchParams.set('org', org);
    router.push(u.toString());
  }

  return (
    <main>
      <Panel title="HR · инструменты">
        <div className="space-y-3 text-white/80">
          <div>Код организации: <span className="font-semibold">{org || '—'}</span></div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button onClick={openConsole}>Открыть HR-консоль</Button>
            <Button variant="ghost" onClick={openRegister}>Ссылка регистрации сотрудников</Button>
          </div>
          <div className="text-xs text-white/50">
            Параметры доступа (org/employeeID/token), если переданы в URL, будут автоматически подставлены.
          </div>
        </div>
      </Panel>
    </main>
  );
}
