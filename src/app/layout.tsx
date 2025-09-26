// src/app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'КОРПОРАТИВНОЕ ПИТАНИЕ',
  description: 'Корпоративное питание',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="h-full bg-neutral-900">
      <body className="min-h-screen h-full bg-neutral-900 text-white antialiased">
        {children}
      </body>
    </html>
  );
}
