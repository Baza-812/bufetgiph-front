'use client';

import { useEffect, useMemo, useState } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';

type MenuItem = {
  id: string;
  name: string;
  type: 'main' | 'side' | 'extra';
  category?: string | null;
  description?: string | null;
};

type MenuRespLoose =
  | { ok: boolean; date: string; items: any[] }
  | { ok: boolean; date: string; mains: any[]; sides: any[]; extras: any[] };

type PrefillResp =
  | {
      ok: boolean;
      summary: {
        orderId: string;
        // возможные формы детализации — обе поддержим:
        boxes?: { mainId?: string; sideId?: string; qty: number }[];
        extras?: { itemId: string; qty: number }[];
        // или просто «линии» с идентификаторами
        lines?: { itemId?: string; mainId?: string; sideId?: string; qty: number; type: string }[];
      } | null;
    }
  | { ok: false; error: string };

type BoxRow = { key: string; mainId: string | null; sideId: string | null; qty: number };

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${init?.method || 'GET'} ${url} -> ${res.status} ${text}`);
  }
  return res.json();
}

// нормализация меню
function normMenu(resp: MenuRespLoose): MenuItem[] {
  const out: MenuItem[] = [];
  const push = (arr: any[] | undefined, type: MenuItem['type']) => {
    (arr || []).forEach((raw) => {
      const f = raw?.fields || raw;
      const id = raw?.id || f?.id || f?.recordId || '';
      if (!id) return;
      const name =
        f?.Name || f?.name || f?.Title || f?.title || f?.['Dish Name'] || f?.['Meal Name'] || `${type} ${id}`;
      const cat = f?.Category || f?.category || f?.['Extra Category'] || f?.['Dish Category'] || null;
      const desc = f?.Description || f?.description || null;
      out.push({ id: String(id), name: String(name), type, category: cat ? String(cat) : null, description: desc });
    });
  };

  if ('mains' in resp || 'sides' in resp || 'extras' in resp) {
    push((resp as any).mains, 'main');
    push((resp as any).sides, 'side');
    push((resp as any).extras, 'extra');
    return out;
  }
  if ('items' in resp && Array.isArray((resp as any).items)) {
    (resp as any).items.forEach((raw: any) => {
      const f = raw?.fields || raw;
      const id = raw?.id || f?.id || f?.recordId || '';
      if (!id) return;
      let type: MenuItem['type'] = 'extra';
      const tRaw = f?.Type || f?.type || f?.Kind || f?.kind || '';
      const t = String(tRaw).toLowerCase();
      if (t.includes('main') || t.includes('основ')) type = 'main';
      else if (t.includes('side') || t.includes('гарнир')) type = 'side';
      else type = 'extra';
      const name =
        f?.Name || f?.name || f?.Title || f?.title || f?.['Dish Name'] || f?.['Meal Name'] || `${type} ${id}`;
      const cat = f?.Category || f?.category || f?.['Extra Category'] || f?.['Dish Category'] || null;
      const desc = f?.Description || f?.description || null;
      out.push({ id: String(id), name: String(name), type, category: cat ? String(cat) : null, description: desc });
    });
    return out;
  }
  return out;
}

export default function ManagerOrderClient(props: { org: string; employeeID: string; token: string; date: string }) {
  const { org, employeeID, token, date } = props;

  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ orderId: string } | null>(null);

  // данные формы
  const [boxes, setBoxes] = useState<BoxRow[]>([{ key: uuid(), mainId: null, sideId: null, qty: 0 }]);
  const [zapekanki, setZapekanki] = useState<Record<string, number>>({});
  const [salads, setSalads] = useState<Record<string, number>>({});
  const [soups, setSoups] = useState<Record<string, number>>({});
  const [pastry, setPastry] = useState<Record<string, number>>({});

  // категории
  const mains = useMemo(() => menu.filter((i) => i.type === 'main'), [menu]);
  const sides = useMemo(() => menu.filter((i) => i.type === 'side'), [menu]);
  const zap = useMemo(
    () => menu.filter((i) => i.type === 'extra' && (i.category || '').toLowerCase().includes('zapekanka')),
    [menu],
  );
  const sal = useMemo(
    () => menu.filter((i) => i.type === 'extra' && (i.category || '').toLowerCase().includes('salad')),
    [menu],
  );
  const sou = useMemo(
    () => menu.filter((i) => i.type === 'extra' && (i.category || '').toLowerCase().includes('soup')),
    [menu],
  );
  const pas = useMemo(
    () => menu.filter((i) => i.type === 'extra' && (i.category || '').toLowerCase().includes('pastry')),
    [menu],
  );

  // «гарнирное основное»: прячем селект Гарнира
  function mainAllowsSide(mainId: string | null) {
    if (!mainId) return true;
    const m = mains.find((x) => x.id === mainId);
    const cat = (m?.category || '').toLowerCase();
    if (cat.includes('garnir') || cat.includes('гарнир')) return false; // Garnirnoe/Гарнирное
    return true;
    // при необходимости здесь можно читать специальный флаг из API
  }

  function setQty(map: Record<string, number>, setMap: any, id: string, qty: number) {
    const q = Math.max(0, Math.floor(qty || 0));
    const next = { ...map };
    if (q <= 0) delete next[id];
    else next[id] = q;
    setMap(next);
  }

  // меню
  useEffect(() => {
    if (!org || !date) return;
    setLoading(true);
    fetchJSON<MenuRespLoose>(`/api/menu?org=${encodeURIComponent(org)}&date=${encodeURIComponent(date)}`)
      .then((r) => setMenu(normMenu(r)))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [org, date]);

  // префилл из существующего заказа (если есть)
  useEffect(() => {
    if (!org || !employeeID || !token || !date) return;
    (async () => {
      try {
        const url = `/api/order_manager?org=${encodeURIComponent(org)}&employeeID=${encodeURIComponent(
          employeeID,
        )}&token=${encodeURIComponent(token)}&date=${encodeURIComponent(date)}`;
        const js = await fetchJSON<PrefillResp>(url);
        const s = (js as any)?.summary || null;
        if (!s) return;

        // boxes
        const bxs: BoxRow[] = [];
        if (Array.isArray(s.boxes)) {
          s.boxes.forEach((b) =>
            bxs.push({ key: uuid(), mainId: b.mainId || null, sideId: b.sideId || null, qty: Math.max(0, b.qty || 0) }),
          );
        } else if (Array.isArray(s.lines)) {
          // сгруппируем как main+side, если удастся
          s.lines
            .filter((l) => l.type === 'box' || l.type === 'mealbox')
            .forEach((l) => bxs.push({ key: uuid(), mainId: l.mainId || null, sideId: l.sideId || null, qty: l.qty || 0 }));
        }
        if (bxs.length) setBoxes(bxs);

        // extras по категориям
        const from = (lines: any[] | undefined, pred: (l: any) => boolean) => {
          const out: Record<string, number> = {};
          (lines || []).filter(pred).forEach((l: any) => {
            const id = l.itemId || l.extraId || l.id;
            if (!id) return;
            out[id] = (out[id] || 0) + (Number(l.qty) || 0);
          });
          return out;
        };
        const lines = Array.isArray(s.extras) ? s.extras.map((e: any) => ({ itemId: e.itemId, qty: e.qty })) : s.lines;

        if (lines && Array.isArray(lines)) {
          setZapekanki(from(lines, (l) => String(l.category || '').toLowerCase().includes('zapekanka')));
          setSalads(from(lines, (l) => String(l.category || '').toLowerCase().includes('salad')));
          setSoups(from(lines, (l) => String(l.category || '').toLowerCase().includes('soup')));
          setPastry(from(lines, (l) => String(l.category || '').toLowerCase().includes('pastry')));
        }
      } catch {
        // молча — заполнять вручную
      }
    })();
  }, [org, employeeID, token, date]);

  function addBox() {
    setBoxes((prev) => [...prev, { key: uuid(), mainId: null, sideId: null, qty: 0 }]);
  }
  function removeBox(k: string) {
    setBoxes((prev) => prev.filter((b) => b.key !== k));
  }
  function patchBox(k: string, patch: Partial<BoxRow>) {
    setBoxes((prev) => prev.map((b) => (b.key === k ? { ...b, ...patch } : b)));
  }

  async function submit() {
    setError(null);
    setDone(null);

    const cleanedBoxes = boxes
      .map((b) => ({
        mainId: b.mainId || undefined,
        sideId: b.sideId || undefined,
        qty: Math.max(0, Math.floor(b.qty || 0)),
      }))
      .filter((b) => (b.mainId || b.sideId) && b.qty > 0);

    const pack = (m: Record<string, number>) =>
      Object.entries(m)
        .map(([itemId, qty]) => ({ itemId, qty: Math.max(0, Math.floor(qty || 0)) }))
        .filter((x) => x.qty > 0);

    const body = {
      employeeID,
      org,
      token,
      date,
      boxes: cleanedBoxes,
      extras: [...pack(zapekanki), ...pack(salads), ...pack(soups), ...pack(pastry)],
      clientToken: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    };

    try {
      setSubmitting(true);
      const resp = await fetchJSON<{ ok: boolean; orderId?: string; error?: string }>(`/api/order_manager`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(resp.error || 'Ошибка сохранения');
      setDone({ orderId: resp.orderId || '—' });
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="p-4 space-y-6">
      <Panel title={`Заказ менеджера на ${date || '—'}`}>
        {/* Zapekanka */}
        <section className="space-y-2">
          <div className="text-white font-semibold">Запеканки и блинчики</div>
          <div className="grid gap-2">
            {zap.map((i) => (
              <label key={i.id} className="flex items-center justify-between bg-neutral-800 rounded px-3 py-2">
                <div>
                  <div className="text-white">{i.name}</div>
                  {i.description && <div className="text-xs text-white/50">{i.description}</div>}
                </div>
                <input
                  type="number"
                  min={0}
                  className="w-24 bg-neutral-900 text-white rounded px-2 py-1 text-right"
                  value={zapekanki[i.id] || 0}
                  onChange={(e) => setQty(zapekanki, setZapekanki, i.id, parseInt(e.target.value || '0', 10))}
                />
              </label>
            ))}
            {!zap.length && <div className="text-white/50 text-sm">Нет позиций</div>}
          </div>
        </section>

        {/* Salad */}
        <section className="space-y-2 pt-4">
          <div className="text-white font-semibold">Салаты</div>
          <div className="grid gap-2">
            {sal.map((i) => (
              <label key={i.id} className="flex items-center justify-between bg-neutral-800 rounded px-3 py-2">
                <div>
                  <div className="text-white">{i.name}</div>
                  {i.description && <div className="text-xs text-white/50">{i.description}</div>}
                </div>
                <input
                  type="number"
                  min={0}
                  className="w-24 bg-neutral-900 text-white rounded px-2 py-1 text-right"
                  value={salads[i.id] || 0}
                  onChange={(e) => setQty(salads, setSalads, i.id, parseInt(e.target.value || '0', 10))}
                />
              </label>
            ))}
            {!sal.length && <div className="text-white/50 text-sm">Нет позиций</div>}
          </div>
        </section>

        {/* Soup */}
        <section className="space-y-2 pt-4">
          <div className="text-white font-semibold">Супы</div>
          <div className="grid gap-2">
            {sou.map((i) => (
              <label key={i.id} className="flex items-center justify-between bg-neutral-800 rounded px-3 py-2">
                <div>
                  <div className="text-white">{i.name}</div>
                  {i.description && <div className="text-xs text-white/50">{i.description}</div>}
                </div>
                <input
                  type="number"
                  min={0}
                  className="w-24 bg-neutral-900 text-white rounded px-2 py-1 text-right"
                  value={soups[i.id] || 0}
                  onChange={(e) => setQty(soups, setSoups, i.id, parseInt(e.target.value || '0', 10))}
                />
              </label>
            ))}
            {!sou.length && <div className="text-white/50 text-sm">Нет позиций</div>}
          </div>
        </section>

        {/* Main + Side */}
        <section className="space-y-2 pt-4">
          <div className="text-white font-semibold">Основные блюда и гарниры</div>
          <div className="space-y-3">
            {boxes.map((b, idx) => {
              const allowSide = mainAllowsSide(b.mainId);
              return (
                <div key={b.key} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                  <div className="md:col-span-2">
                    <div className="text-xs text-white/60 mb-1">Основное блюдо</div>
                    <select
                      className="w-full bg-neutral-800 text-white rounded px-2 py-2"
                      value={b.mainId || ''}
                      onChange={(e) => patchBox(b.key, { mainId: e.target.value || null })}
                      disabled={loading}
                    >
                      <option value="">— не выбрано —</option>
                      {mains.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-xs text-white/60 mb-1">Гарнир</div>
                    <select
                      className="w-full bg-neutral-800 text-white rounded px-2 py-2"
                      value={b.sideId || ''}
                      onChange={(e) => patchBox(b.key, { sideId: e.target.value || null })}
                      disabled={loading || !allowSide}
                    >
                      <option value="">{allowSide ? '— не выбрано —' : 'не требуется'}</option>
                      {allowSide &&
                        sides.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <div className="text-xs text-white/60 mb-1">Кол-во</div>
                    <input
                      type="number"
                      min={0}
                      className="w-full bg-neutral-800 text-white rounded px-2 py-2"
                      value={b.qty}
                      onChange={(e) => patchBox(b.key, { qty: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                    />
                  </div>

                  <div className="md:col-span-6 flex gap-2">
                    {idx === boxes.length - 1 && (
                      <Button variant="ghost" onClick={() => setBoxes((p) => [...p, { key: uuid(), mainId: null, sideId: null, qty: 0 }])}>
                        + Добавить основное блюдо
                      </Button>
                    )}
                    {boxes.length > 1 && (
                      <Button variant="ghost" onClick={() => removeBox(b.key)}>
                        Удалить
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Pastry */}
        <section className="space-y-2 pt-4">
          <div className="text-white font-semibold">Выпечка</div>
          <div className="grid gap-2">
            {pas.map((i) => (
              <label key={i.id} className="flex items-center justify-between bg-neutral-800 rounded px-3 py-2">
                <div>
                  <div className="text-white">{i.name}</div>
                  {i.description && <div className="text-xs text-white/50">{i.description}</div>}
                </div>
                <input
                  type="number"
                  min={0}
                  className="w-24 bg-neutral-900 text-white rounded px-2 py-1 text-right"
                  value={pastry[i.id] || 0}
                  onChange={(e) => setQty(pastry, setPastry, i.id, parseInt(e.target.value || '0', 10))}
                />
              </label>
            ))}
            {!pas.length && <div className="text-white/50 text-sm">Нет позиций</div>}
          </div>
        </section>

        {error && <div className="text-rose-400 mt-3">{error}</div>}
        {done && (
          <div className="text-emerald-400 mt-3">
            Заказ сохранён. Номер заказа: <b>{done.orderId}</b>
          </div>
        )}

        <div className="pt-4">
          <Button onClick={submit} disabled={submitting || loading}>
            {submitting ? 'Сохраняю…' : 'Оформить заказ'}
          </Button>
        </div>
      </Panel>
    </main>
  );
}
