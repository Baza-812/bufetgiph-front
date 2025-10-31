'use client';

import { useEffect, useMemo, useState } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import { fetchJSON } from '@/lib/api';

type DishRow = {
  id: string;           // <-- это уже DishID из Dishes
  name: string;
  description?: string;
  category: 'Zapekanka'|'Salad'|'Soup'|'Main'|'Side';
};

function ruCat(cat:string) {
  const map: Record<string,string> = {
    Zapekanka: 'Запеканки и блины',
    Salad:     'Салаты',
    Soup:      'Супы',
    Main:      'Основные',
    Side:      'Гарниры',
  };
  return map[cat] || cat;
}

export default function KitchenMenuByDate({ params }: { params: { date: string } }) {
  const date = params.date;
  const [items, setItems] = useState<DishRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setLoading(true); setErr('');
        const u = new URL('/api/kitchen/menu-dishes', window.location.origin);
        u.searchParams.set('date', date);
        const r = await fetchJSON<{ ok:boolean; dishes: DishRow[] }>(u.toString());
        setItems(r.dishes || []);
      } catch (e:any) {
        setErr(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [date]);

  const byCat = useMemo(() => {
    const m: Record<string, DishRow[]> = {};
    for (const x of items) (m[x.category] ||= []).push(x);
    return m;
  }, [items]);

  function openDish(it: DishRow) {
    const key = new URLSearchParams(window.location.search).get('key') || '';
    const u = new URL(`/kitchen/dish/${it.id}`, window.location.origin); // <-- ПЕРЕДАЁМ DishID
    if (key) u.searchParams.set('key', key);
    // name теперь не нужен, но можно оставить
    u.searchParams.set('name', it.name);
    window.location.href = u.toString();
  }

  return (
    <main>
      <Panel title={`Меню на ${date}`}>
        {loading && <div className="text-white/70">Загрузка…</div>}
        {err && <div className="text-red-400 text-sm">{err}</div>}

        {!loading && !err && (
          <div className="space-y-6">
            {(['Zapekanka','Salad','Soup','Main','Side'] as const).map(cat => (
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
                        <div className="mt-2"><Button onClick={()=>openDish(it)}>Открыть блюдо</Button></div>
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
