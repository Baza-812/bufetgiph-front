import { Suspense } from 'react';
import KitchenClient from './KitchenClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

type SP = { [key: string]: string | string[] | undefined };

export default function Page({ searchParams }: { searchParams: SP }) {
  const keyParam = (Array.isArray(searchParams.key) ? searchParams.key[0] : searchParams.key) || 'kitchen_o555';

  return (
    <Suspense fallback={<div className="p-6">Загрузка…</div>}>
      <KitchenClient accessKey={String(keyParam)} />
    </Suspense>
  );
}
