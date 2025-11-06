import { Suspense } from 'react';
import KitchenClient from './KitchenClient';

export const dynamic = 'force-dynamic';

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6">Загрузка…</div>}>
      <KitchenClient />
    </Suspense>
  );
}
