// src/app/order/quiz/page.tsx
import { Suspense } from 'react';
import QuizClient from './QuizClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default function Page() {
  return (
    <Suspense>
      <QuizClient />
    </Suspense>
  );
}
