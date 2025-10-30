'use client';

import { useEffect, useState } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import { fetchJSON, fmtDayLabel } from '@/lib/api';

export default function KitchenDayPicker() {
  const [org, setOrg] = useState('');
  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    // org берём как у вас: из query/localStorage, но для кухни достаточно org из localStorage
    const o = new URLSearchParams(window.location.search).get('org')
         || localStorage.getItem('baza.org')
         || '';
    setOrg(o);
  }, []);

  useEffect(() => {
    (async () => {
      if (!org) return;
      try {
        setLoading(true); setErr('');
        const r = await fetchJSON<{ ok: boolean; dates: string[] }>(`/api/dates?org=${encodeURIComponent(org)}`);
        setDates(r.dates || []);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [org]);

  function openDate(d: string) {
    const u = new URL(`/kitchen/menu/${d}`, window.location.origin);
    // прокинем org и key, чтобы не терять доступ
    const key = new URLSearchParams(window.location.search).get('key') || '';
    if (org) u.searchParams.set('org', org);
    if (key) u.searchParams.set('key', key);
    window.location.href = u.toString();
  }

  return (
    <main>
      <Panel title="Выберите дату">
        {loading && <div className="text-white/60 text-sm">Загрузка дат…</div>}
        {err && <div className="text-red-400 text-sm">Ошибка: {err}</div>}

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
