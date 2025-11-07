'use client';

import { useEffect, useMemo, useState } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';

type Dish = {
  id: string;
  name: string;
  description: string;
  category: 'Zapekanka' | 'Salad' | 'Soup' | 'Main' | 'Side';
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
  const [items, setItems] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      if (!date) return;
      try {
        setLoading(true); setErr('');
        const r = await fetch(`/api/kitchen/menu-dishes?date=${encodeURIComponent(date)}`);
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error || 'failed to load');
        setItems(j.dishes || []);
      } catch (e:any) {
        setErr(e.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [date]);

  const byCat = useMemo(() => {
    const m: Record<string, Dish[]> = { Zapekanka: [], Salad: [], Soup: [], Main: [], Side: [] };
    for (const x of items) {
      (m[x.category] ||= []).push(x);
    }
    return m;
  }, [items]);

  function openDish(id: string, name: string) {
    const u = new URL(`/kitchen/dish/${id}`, window.location.origin);
    const key = new URLSearchParams(window.location.search).get('key') || '';
    if (key) u.searchParams.set('key', key);
    // подстрахуемся: передадим name (если id — это rec из Menu)
    u.searchParams.set('name', name || '');
    window.location.href = u.toString();
  }

  const order: Array<Dish['category']> = ['Zapekanka','Salad','Soup','Main','Side'];

  return (
    <main>
      <Panel title={`Меню на ${date}`}>
        {loading && <div className="text-white/70">Загрузка…</div>}
        {err && <div className="text-red-400 text-sm">{err}</div>}

        {!loading && !err && (
          <div className="space-y-6">
            {order.map(cat => (
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
                        <div className="font-semibold text-white">{it.name || 'Без названия'}</div>
                        {it.description && <div className="text-white/70 text-xs leading-relaxed">{it.description}</div>}
                        <div className="mt-2">
                          <Button onClick={()=>openDish(it.id, it.name)}>Открыть блюдо</Button>
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
