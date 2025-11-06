'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

type Dish = { id:string; name:string; description:string; category:'Zapekanka'|'Salad'|'Soup'|'Main'|'Side' };

export default function KitchenMenu() {
  const sp = useSearchParams();
  const router = useRouter();
  const date = sp.get('date') || '';
  const key  = sp.get('key')  || 'kitchen_o555';

  const [data, setData] = useState<{ok:boolean; dishes:Dish[]}>({ ok:false, dishes:[] });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function run() {
      try {
        const r = await fetch(`/api/kitchen/menu-dishes?date=${encodeURIComponent(date)}`);
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error || 'failed to load');
        if (mounted) setData(j);
      } catch (e:any) {
        if (mounted) setErr(e.message || String(e));
      }
    }
    if (date) run();
    return () => { mounted = false; };
  }, [date]);

  const groups = useMemo(() => {
    const by: Record<string, Dish[]> = { Zapekanka:[], Salad:[], Soup:[], Main:[], Side:[] };
    for (const d of data.dishes) {
      if (!by[d.category]) by[d.category] = [];
      by[d.category].push(d);
    }
    return by;
  }, [data]);

  const order: Dish['category'][] = ['Zapekanka','Salad','Soup','Main','Side'];

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">Меню на {date}</h1>
      {err && <div className="text-red-600 mb-4">{err}</div>}

      {order.map(cat => {
        const list = groups[cat] || [];
        if (!list.length) return null;
        return (
          <div key={cat} className="mb-6">
            <div className="text-yellow-400 font-semibold mb-2">[{cat}]</div>
            <div className="flex flex-wrap gap-2">
              {list.map(d => (
                <button
                  key={d.id}
                  onClick={() => router.push(`/kitchen/dish/${d.id}?date=${encodeURIComponent(date)}&key=${encodeURIComponent(key)}&name=${encodeURIComponent(d.name)}`)}
                  className="px-4 py-2 rounded-2xl border border-neutral-300 hover:border-yellow-400"
                  title={d.description}
                >
                  {d.name || 'Без названия'}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      <div className="mt-8">
        <button
          className="px-4 py-2 rounded-2xl bg-yellow-400 text-black hover:opacity-90"
          onClick={() => history.back()}
        >
          Назад
        </button>
      </div>
    </div>
  );
}
