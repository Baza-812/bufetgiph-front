'use client';

import { useMemo } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';

function formatISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDayLabel(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

export default function KitchenDayPicker() {
  // генерим 14 ближайших дат локально — без зависимости от /api/dates
  const dates = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      out.push(formatISO(d));
    }
    return out;
  }, []);

  function openDate(iso: string) {
    const u = new URL(`/kitchen/menu/${iso}`, window.location.origin);
    const key = new URLSearchParams(window.location.search).get('key') || '';
    if (key) u.searchParams.set('key', key);
    window.location.href = u.toString();
  }

  return (
    <main>
      <Panel title="Выберите дату">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {dates.map(d => (
            <Button key={d} onClick={() => openDate(d)} className="w-full">
              {fmtDayLabel(d)}
            </Button>
          ))}
        </div>
      </Panel>
    </main>
  );
}
