'use client';

import { useEffect, useMemo, useState } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import { fetchJSON, mapMenuItem, MenuItem } from '@/lib/api';

function ruCat(cat:string) {
  const map: Record<string,string> = {
    Zapekanka: 'Запеканки и блины',
    Salad:     'Салаты',
    Soup:      'Супы',
    Main:      'Основные',
    Side:      'Гарниры',
    Pastry:    'Выпечка',
    Fruit:     'Фрукты',
    Drink:     'Напитки',
  };
  return map[cat] || cat;
}

export default function KitchenMenuByDate({ params }: { params: { date: string } }) {
  const date = params.date;
  const [org, setOrg] = useState('');
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const o = new URLSearchParams(window.location.search).get('org')
         || localStorage.getItem('baza.org')
         || '';
    setOrg(o);
  }, []);

  useEffect(() => {
    (async () => {
      if (!date || !org) return;
      try {
        setLoading(true); setErr('');
        const u = new URL('/api/menu', window.location.origin);
        u.searchParams.set('date', date);
        u.searchParams.set('org', org);
        const r = await fetchJSON<{ menu?: any[]; items?: any[]; records?: any[] }>(u.toString());
        const rows = (r.items ?? r.records ?? r.menu ?? []) as any[];
        setItems(rows.map(mapMenuItem));
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [date, org]);

  const byCat = useMemo(() => {
    const NORM: Record<string, string> = {
      Casseroles: 'Zapekanka',
      Bakery:     'Zapekanka',
      Pancakes:   'Zapekanka',
      Salads:     'Salad',
      Soups:      'Soup',
      Zapekanka:  'Zapekanka',
      Salad:      'Salad',
      Soup:       'Soup',
      Main:       'Main',
      Side:       'Side',
      Pastry:     'Pastry',
      Fruit:      'Fruit',
      Drink:      'Drink',
    };
    const m: Record<string, MenuItem[]> = {};
    for (const x of items) {
      const raw = x.category || 'Other';
      const c = NORM[raw] || 'Other';
      (m[c] ||= []).push({ ...x, category: c });
    }
    return m;
  }, [items]);

  function openDish(id: string) {
    const u = new URL(`/kitchen/dish/${id}`, window.location.origin);
    const key = new URLSearchParams(window.location.search).get('key') || '';
    if (key) u.searchParams.set('key', key);
    window.location.href = u.toString();
  }

  return (
    <main>
      <Panel title="Меню на день">
        {loading && <div className="text-white/70">Загрузка…</div>}
        {err && <div className="text-red-400 text-sm">{err}</div>}

        {!loading && !err && (
          <div className="space-y-6">
            {['Zapekanka','Salad','Soup','Main','Side'].map(cat => (
              (byCat[cat]?.length ? (
                <section key={cat}>
                  <h3 className="text-base font-bold mb-2 text-white">
                    <span className="text-yellow-400">[</span>
                    <span className="mx-1">{ruCat(cat)}</span>
                    <span className="text-yellow-400">]</span>
                  </h3>
                  <ul className="space-y-2">
                    {byCat[cat].map(it => (
                      <li key={it.id} className="rounded-xl bg-white/5 border border-white/10 p-3">
                        <div className="font-semibold text-white">{it.name}</div>
                        {it.description && <div className="text-white/70 text-xs leading-relaxed">{it.description}</div>}
                        <div className="mt-2">
                          <Button onClick={()=>openDish(it.id)}>Открыть блюдо</Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null)
            ))}
          </div>
        )}

        <div className="mt-4">
          <Button variant="ghost" onClick={()=>history.back()}>Назад</Button>
        </div>
      </Panel>
    </main>
  );
}
