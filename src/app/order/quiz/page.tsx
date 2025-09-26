// src/app/order/quiz/page.tsx — SERVER component
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

import QuizClient from './QuizClient';

export default function Page() {
  return <QuizClient />;
}
