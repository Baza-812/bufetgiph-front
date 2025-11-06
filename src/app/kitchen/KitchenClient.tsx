'use client';
import { Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function formatISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function Inner() {
  const router = useRouter();
  const sp = useSearchParams();
  const key = sp.get('key') || 'kitchen_o555';

  const days = useMemo(() => {
    const list: { label: string; iso: string }[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const label = d.toLocaleDateString('ru-RU', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
      });
      list.push({ label, iso: formatISO(d) });
    }
    return list;
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Выбор дня</h1>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {days.map((d) => (
          <button
            key={d.iso}
            className="rounded-2xl border border-neutral-300 px-4 py-3 hover:border-yellow-400"
            onClick={() =>
              router.push(`/kitchen/menu?date=${d.iso}&key=${encodeURIComponent(key)}`)
            }
          >
            <div className="text-sm text-neutral-500">{d.label.split(',')[0]}</div>
            <div className="text-lg font-semibold">{d.label.split(',')[1]}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function KitchenClient() {
  return (
    <Suspense fallback={<div className="p-6">Загрузка…</div>}>
      <Inner />
    </Suspense>
  );
}
