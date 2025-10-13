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

type PrefillBox = { mainId?: string; sideId?: string; qty?: number };
type PrefillLine = { itemId?: string; mainId?: string; sideId?: string; qty: number; type: string; category?: string };

type BoxRow = { key: string; mainId: string | null; sideId: string | null; qty: number };

/** универсальный fetch JSON */
async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init });
  const bodyText = await res.text().catch(() => '');
  const json = (bodyText && (JSON.parse(bodyText) as any)) || {};
  if (!res.ok) {
    const msg = json?.error || bodyText || `${res.status}`;
    throw new Error(`${init?.method || 'GET'} ${url} -> ${res.status} ${msg}`);
  }
  return json as T;
}

/** Фолбэк-получение состава для префилла: /order_manager (GET) → /order_summary */
async function getManagerSummary(org: string, employeeID: string, token: string, date: string) {
  try {
    const url1 = `/api/order_manager?org=${encodeURIComponent(org)}&employeeID=${encodeURIComponent(
      employeeID,
    )}&token=${encodeURIComponent(token)}&date=${encodeURIComponent(date)}`;
    const r1 = await fetch(url1, { cache: 'no-store', credentials: 'same-origin' });
    const j1 = await r1.json().catch(() => ({}));
    if (r1.ok && j1?.summary) return j1.summary;
    if (j1?.error === 'POST only' || r1.status === 405 || r1.status === 404) {
      throw new Error('fallback');
    }
  } catch {
    const url2 = `/api/order_summary?org=${encodeURIComponent(org)}&employeeID=${encodeURIComponent(
      employeeID,
    )}&token=${encodeURIComponent(token)}&date=${encodeURIComponent(date)}&mode=single`;
    const r2 = await fetch(url2, { cache: 'no-store', credentials: 'same-origin' });
    if (!r2.ok) return null;
    const j2 = await r2.json().catch(() => ({}));
    if (j2?.summary) return j2.summary;
    if (j2?.order) return { orderId: j2.order.id || j2.order.orderId, lines: j2.lines || [] };
    return null;
  }
  return null;
}

/** Нормализация меню: поддержка разных схем/полей ru/en */
function normMenu(resp: MenuRespLoose): MenuItem[] {
  const out: MenuItem[] = [];

  const detectType = (f: any): MenuItem['type'] => {
    const rawType =
      f?.Type ?? f?.type ?? f?.Kind ?? f?.kind ?? f?.Course ?? f?.course ?? f?.Group ?? f?.group ?? f?.['Dish Type'];
    if (rawType) {
      const t = String(rawType).toLowerCase();
      if (/(main|основ|второе)/.test(t)) return 'main';
      if (/(side|гарнир)/.test(t)) return 'side';
      if (/(extra|доп|салат|суп|запеканк|выпечк|pastry|salad|soup|zapekanka)/.test(t)) return 'extra';
    }
    const rawCat =
      f?.Category ?? f?.category ?? f?.['Extra Category'] ?? f?.['Dish Category'] ?? f?.['Menu Category'];
    if (rawCat) {
      const c = String(rawCat).toLowerCase();
      if (/(main|основ|второе)/.test(c)) return 'main';
      if (/(side|гарнир)/.test(c)) return 'side';
      if (/(extra|доп|салат|суп|запеканк|выпечк|pastry|salad|soup|zapekanka)/.test(c)) return 'extra';
    }
    const rawName = f?.Name ?? f?.name ?? f?.Title ?? f?.title ?? f?.['Dish Name'] ?? f?.['Meal Name'];
    if (rawName) {
      const n = String(rawName).toLowerCase();
      if (/(гарнир)/.test(n)) return 'side';
      if (/(салат|суп|запеканк|блинчик|выпечк|булоч|пирож)/.test(n)) return 'extra';
      if (/(котлет|куриц|говя|свини|рыб|плов|паста|стейк|биточ)/.test(n)) return 'main';
    }
    return 'extra';
  };

  const push = (arr: any[] | undefined, enforcedType?: MenuItem['type']) => {
    (arr || []).forEach((raw) => {
      const f = raw?.fields || raw;
      const id = raw?.id || f?.id || f?.recordId || f?.ID || '';
      if (!id) return;
      const name =
        f?.Name || f?.name || f?.Title || f?.title || f?.['Dish Name'] || f?.['Meal Name'] || `#${id}`;
      const cat =
        f?.Category || f?.category || f?.['Extra Category'] || f?.['Dish Category'] || f?.['Menu Category'] || null;
      const desc = f?.Description || f?.description || null;
      const type = enforcedType ?? detectType(f);
      out.push({
        id: String(id),
        name: String(name),
        type,
        category: cat ? String(cat) : null,
        description: desc ? String(desc) : null,
      });
    });
  };

  if ('mains' in resp || 'sides' in resp || 'extras' in resp) {
    push((resp as any).mains, 'main');
    push((resp as any).sides, 'side');
    push((resp as any).extras, 'extra');
    return out;
  }
  if ('items' in resp && Array.isArray((resp as any).items)) {
    push((resp as any).items);
  }
  return out;
}

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

export default function ManagerOrderClient(props: { org: string; employeeID: string; token: string; date: string }) {
  const { org, employeeID, token, date } = props;

  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ orderId: string } | null>(null);

  const [boxes, setBoxes] = useState<BoxRow[]>([{ key: uuid(), mainId: null, sideId: null, qty: 0 }]);
  const [zapekanki, setZapekanki] = useState<Record<string, number>>({});
  const [salads, setSalads] = useState<Record<string, number>>({});
  const [soups, setSoups] = useState<Record<string, number>>({});
  const [pastry, setPastry] = useState<Record<string, number>>({});

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

  // набор «основных без гарнира» (гарнирные/one course и т.п.)
  const noSideMainIds = useMemo(() => {
    const set = new Set<string>();
    const re = /(garnir|гарнирн|без\s*гарнира|one\s*course|single\s*dish)/i;
    mains.forEach((m) => {
      const txt = `${m.name || ''} ${m.category || ''}`;
      if (re.test(txt)) set.add(m.id);
    });
    return set;
  }, [mains]);

  function mainAllowsSide(mainId: string | null) {
    if (!mainId) return true;
    return !noSideMainIds.has(mainId);
  }

  function setQty(map: Record<string, number>, setMap: (v: Record<string, number>) => void, id: string, qty: number) {
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

  // префилл из существующего заказа
  useEffect(() => {
    if (!org || !employeeID || !token || !date) return;
    (async () => {
      try {
        const s: any = await getManagerSummary(org, employeeID, token, date);
        if (!s) return;

        const bxs: BoxRow[] = [];
        if (Array.isArray(s.boxes)) {
          (s.boxes as PrefillBox[]).forEach((b: PrefillBox) => {
            bxs.push({
              key: uuid(),
              mainId: (b.mainId as string) || null,
              sideId: (b.sideId as string) || null,
              qty: Math.max(0, Number(b.qty || 0)),
            });
          });
        } else if (Array.isArray(s.lines)) {
          ((s.lines as PrefillLine[]) || [])
            .filter((l: PrefillLine) => l.type === 'box' || l.type === 'mealbox')
            .forEach((l: PrefillLine) => {
              bxs.push({
                key: uuid(),
                mainId: (l.mainId as string) || null,
                sideId: (l.sideId as string) || null,
                qty: Math.max(0, Number(l.qty || 0)),
              });
            });
        }
        if (bxs.length) setBoxes(bxs);

        const lines: PrefillLine[] | undefined = Array.isArray(s.extras)
          ? (s.extras as { itemId: string; qty: number; category?: string }[]).map((e) => ({
              itemId: e.itemId,
              qty: e.qty,
              type: 'extra',
              category: e.category,
            }))
          : (s.lines as PrefillLine[] | undefined);

        const collect = (pred: (l: PrefillLine) => boolean) => {
          const out: Record<string, number> = {};
          (lines || []).forEach((l: PrefillLine) => {
            const id = (l.itemId as string) || (l as any).extraId || (l as any).id;
            if (!id) return;
            if (pred(l)) out[id] = (out[id] || 0) + (Number(l.qty) || 0);
          });
          return out;
        };
        setZapekanki(collect((l) => String(l.category || '').toLowerCase().includes('zapekanka')));
        setSalads(collect((l) => String(l.category || '').toLowerCase().includes('salad')));
        setSoups(collect((l) => String(l.category || '').toLowerCase().includes('soup')));
        setPastry(collect((l) => String(l.category || '').toLowerCase().includes('pastry')));
      } catch {
        /* no-op */
      }
    })();
  }, [org, employeeID, token, date]);

  function addBox() {
    setBoxes((p) => [...p, { key: uuid(), mainId: null, sideId: null, qty: 0 }]);
  }
  function removeBox(k: string) {
    setBoxes((p) => p.filter((b) => b.key !== k));
  }
  function patchBox(k: string, patch: Partial<BoxRow>) {
    setBoxes((p) => p.map((b) => (b.key === k ? { ...b, ...patch } : b)));
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
          <div className="grid gap
