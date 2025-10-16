'use client';

import { useEffect, useMemo, useState } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import { useRouter } from 'next/navigation';

/* ===================== Types ===================== */

type MenuItem = {
  id: string;
  name: string;
  type: 'main' | 'side' | 'extra';
  category?: string | null;
  description?: string | null;
  noSide?: boolean; // «гарнирное» основное: гарнир не положен
};

type MenuRespLoose = {
  ok?: boolean;
  items?: Array<any>;
};

type PrefillBox = { mainId?: string | null; sideId?: string | null; qty?: number };
type PrefillLine = {
  type?: 'box' | 'mealbox' | 'extra';
  mainId?: string | null;
  sideId?: string | null;
  itemId?: string | null;
  qty?: number;
  category?: string | null;
};

type BoxRow = { key: string; mainId: string | null; sideId: string | null; qty: number };

/* ===================== Utils ===================== */

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

/** Универсальная загрузка сводки заказа менеджера на дату. */
async function getManagerSummary(org: string, employeeID: string, token: string, date: string) {
  // 1) пробуем /order_manager
  const url1 = `/api/order_manager?org=${encodeURIComponent(org)}&employeeID=${encodeURIComponent(
    employeeID,
  )}&token=${encodeURIComponent(token)}&date=${encodeURIComponent(date)}`;
  try {
    const r1 = await fetch(url1, { cache: 'no-store', credentials: 'same-origin' });
    const j1 = await r1.json().catch(() => ({}));
    if (r1.ok && j1?.summary) return j1.summary as any;
    if (j1?.error !== 'POST only' && r1.status !== 405 && r1.status !== 404) {
      return null;
    }
  } catch {
    /* fallthrough */
  }

  // 2) /order_summary
  const url2 = `/api/order_summary?org=${encodeURIComponent(org)}&employeeID=${encodeURIComponent(
    employeeID,
  )}&date=${encodeURIComponent(date)}`;
  const r2 = await fetch(url2, { cache: 'no-store', credentials: 'same-origin' });
  if (!r2.ok) return null;
  const j2 = await r2.json().catch(() => ({}));
  return j2?.summary || null;
}

/** true для checkbox/lookup-boolean Airtable (и массивов из lookup). */
function readLookupBool(f: any, ...keys: string[]): boolean {
  for (const k of keys) {
    const v = f?.[k];
    if (Array.isArray(v)) {
      if (v.some((x) => x === true || x === 1 || String(x).toLowerCase() === 'true')) return true;
    } else if (v === true || v === 1 || String(v).toLowerCase() === 'true') {
      return true;
    }
  }
  return false;
}


/** Нормализация меню + определение «гарнирного main» (noSide) */
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

  const detectNoSide = (f: any): boolean => {
  // 1) Жёсткий приоритет — явный флаг из Airtable:
  //    чекбокс в Dishes и его lookup в Menu.
  if (
    readLookupBool(f, 
      'Garnirnoe (from Dish)',
      'Garnirnoe (from Dishes)',
      'Garnirnoe',              // на случай, если поле прокинуто напрямую
      'Гарнирное (из блюда)',   // если вдруг есть русская версия названия
      'Гарнирное',
    )
  ) {
    return true;
  }

  // 2) Фоллбек: любые текстовые признаки в типах/категориях/названии/описании
  const candidates = [
    f?.['Main Type'],
    f?.['Group'],
    f?.['Dish Group'],
    f?.['Category'],
    f?.['Dish Category'],
    f?.['Menu Category'],
    f?.['Extra Category'],
    f?.Category,
    f?.category,
    f?.Type,
    f?.type,
    f?.Name,
    f?.name,
    f?.Title,
    f?.title,
    f?.Description,
    f?.description,
  ];
  for (const v of candidates) {
    if (!v) continue;
    const s = String(v).toLowerCase();
    if (
      s.includes('garnirnoe') ||
      s.includes('гарнирно') ||
      s.includes('без гарнира') ||
      s.includes('no side') ||
      s.includes('without side')
    ) {
      return true;
    }
  }
  return false;
};



  const getName = (f: any) =>
    f?.Name ?? f?.name ?? f?.Title ?? f?.title ?? f?.['Dish Name'] ?? f?.['Meal Name'] ?? 'Без названия';

  const getDesc = (f: any) =>
    f?.Description ?? f?.description ?? f?.['Short Description'] ?? f?.['Desc'] ?? null;

  const getCat = (f: any) =>
    f?.Category ?? f?.category ?? f?.['Extra Category'] ?? f?.['Dish Category'] ?? f?.['Menu Category'] ?? null;

  const items = Array.isArray(resp?.items) ? resp.items : [];
  for (const r of items) {
    const id = r?.id || r?.recordId || r?.recId;
    const fields = r?.fields || r?.f || r;

    if (!id || !fields) continue;

    const type = detectType(fields);
    const name = String(getName(fields));
    const description = getDesc(fields);
    const category = getCat(fields);

    const noSide =
  type === 'main'
    ? readLookupBool(
        fields,
        'Garnirnoe (from Dish)',   // lookup в Menu
        'Garnirnoe (from Dishes)', // иногда так называет Airtable
        'Garnirnoe'                // прямой чекбокс (если прокинут)
      )
    : false;
    
    out.push({ id: String(id), name, type, category, description, noSide });
  }

  return out;
}

/* ===================== Component ===================== */

export default function ManagerOrderClient(props: { org: string; employeeID: string; token: string; date: string }) {
  const { org, employeeID, token, date } = props;
  const router = useRouter();

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

  function mainAllowsSide(mainId: string | null) {
    if (!mainId) return true;
    const m = mains.find((x) => x.id === mainId);
    if (!m) return true;
    return !m.noSide; // для «гарнирного» — гарнир запрещён
  }

  /* ---------- initial menu load ---------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        setDone(null);

        const url = `/api/menu?org=${encodeURIComponent(org)}&employeeID=${encodeURIComponent(
          employeeID,
        )}&token=${encodeURIComponent(token)}&date=${encodeURIComponent(date)}&as=manager`;
        const j = await fetchJSON<MenuRespLoose>(url);
        if (cancelled) return;

        setMenu(normMenu(j));
      } catch (e: any) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [org, employeeID, token, date]);

  /* ---------- префилл из существующего заказа ---------- */
  useEffect(() => {
    (async () => {
      try {
        const s: any = await getManagerSummary(org, employeeID, token, date);
        if (!s) return;

        const bxs: BoxRow[] = [];
        if (Array.isArray(s.boxes)) {
          (s.boxes as PrefillBox[]).forEach((b: PrefillBox) => {
            const mainId = (b.mainId as string) || null;
            const allow = mainAllowsSide(mainId);
            bxs.push({
              key: uuid(),
              mainId,
              sideId: allow ? ((b.sideId as string) || null) : null,
              qty: Math.max(0, Number(b.qty || 0)),
            });
          });
        } else if (Array.isArray(s.lines)) {
          (s.lines as PrefillLine[])
            .filter((l: PrefillLine) => l.type === 'box' || l.type === 'mealbox')
            .forEach((l: PrefillLine) => {
              const mainId = (l.mainId as string) || null;
              const allow = mainAllowsSide(mainId);
              bxs.push({
                key: uuid(),
                mainId,
                sideId: allow ? ((l.sideId as string) || null) : null,
                qty: Math.max(0, Number(l.qty || 0)),
              });
            });
        }
        if (bxs.length) setBoxes(bxs);

        const lines: PrefillLine[] | undefined = Array.isArray(s.extras)
          ? (s.extras as any[]).map((e) => ({
              type: 'extra',
              itemId: e.itemId,
              qty: Number(e.qty || 0),
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

  /* ---------- helpers ---------- */
  function addBox() {
    setBoxes((p) => [...p, { key: uuid(), mainId: null, sideId: null, qty: 0 }]);
  }
  function removeBox(k: string) {
    setBoxes((p) => p.filter((b) => b.key !== k));
  }
  function patchBox(k: string, patch: Partial<BoxRow>) {
    setBoxes((p) => p.map((b) => (b.key === k ? { ...b, ...patch } : b)));
  }

  function setQty(map: Record<string, number>, setMap: (x: Record<string, number>) => void, id: string, val: number) {
    const v = Math.max(0, Math.floor(Number.isFinite(val) ? val : 0));
    const next = { ...map };
    if (v <= 0) delete next[id];
    else next[id] = v;
    setMap(next);
  }

  function goBack() {
    const u = new URL('/manager', window.location.origin);
    u.searchParams.set('org', org);
    u.searchParams.set('employeeID', employeeID);
    u.searchParams.set('token', token);
    router.push(u.toString());
  }

  /* ---------- submit ---------- */
  async function submit() {
    try {
      setSubmitting(true);
      setError(null);

      // boxes — чистим sideId для «гарнирных»
      const cleanedBoxes = boxes
        .map((b) => {
          const allow = mainAllowsSide(b.mainId);
          return {
            mainId: b.mainId || undefined,
            sideId: allow ? (b.sideId || undefined) : undefined,
            qty: Math.max(0, Math.floor(b.qty || 0)),
          };
        })
        .filter((b) => (b.mainId || b.sideId) && (b as any).qty > 0);

      // extras — только разрешённые категории (zapekanka/salad/soup/pastry)
      const extras: Array<{ itemId: string; qty: number }> = [];
      const pushMap = (m: Record<string, number>) => {
        Object.entries(m).forEach(([id, qty]) => {
          const q = Math.max(0, Math.floor(qty || 0));
          if (q > 0) extras.push({ itemId: id, qty: q });
        });
      };
      pushMap(zapekanki);
      pushMap(salads);
      pushMap(soups);
      pushMap(pastry);

      const body = {
        org,
        employeeID,
        token,
        date,
        boxes: cleanedBoxes,
        extras,
        clientToken: uuid(), // идемпотентность
      };

      const r = await fetch('/api/order_manager', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });

      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) {
        throw new Error(j?.error || 'Ошибка сохранения');
      }
      setDone({ orderId: j.orderId || '—' });

      // возврат на календарь после успешного сохранения
      setTimeout(() => {
        goBack();
      }, 600);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setSubmitting(false);
    }
  }

  /* ===================== UI ===================== */

  return (
    <main className="p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <h2 className="text-xl font-semibold text-white">Заказ менеджера на {date || '—'}</h2>

        <Panel title="">
          {/* ====== Основные и гарниры — ПЕРВЫЙ блок ====== */}
          <section className="space-y-2">
            <div className="text-white font-semibold">
              <span className="text-yellow-400">[ </span>
              Основные блюда и гарниры
              <span className="text-yellow-400"> ]</span>
            </div>

            <div className="space-y-3">
              {boxes.map((b) => {
                const allowSide = mainAllowsSide(b.mainId);
                return (
                  <div key={b.key} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                    <div className="md:col-span-2">
                      <div className="text-xs text-white/60 mb-1">Основное блюдо</div>
                      
                    </div>

                    <div className="md:col-span-2">
                      <div className="text-xs text-white/60 mb-1">Гарнир</div>
                      <select
  className="w-full bg-neutral-800 text-white rounded px-2 py-2"
  value={b.mainId || ''}
  onChange={(e) => {
    const newMain = e.target.value || null;
    const allow = mainAllowsSide(newMain);
    // если гарнир не нужен — сразу очищаем выбранный гарнир
    patchBox(b.key, { mainId: newMain, sideId: allow ? b.sideId : null });
  }}
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

                    <div className="md:col-span-1">
                      <div className="text-xs text-white/60 mb-1">Кол-во</div>
                      <input
                        type="number"
                        min={0}
                        className="w-full bg-neutral-900 text-white rounded px-2 py-2 text-right"
                        value={b.qty}
                        onChange={(e) =>
                          patchBox(b.key, { qty: Math.max(0, Math.floor(parseInt(e.target.value || '0', 10))) })
                        }
                      />
                    </div>

                    <div className="md:col-span-1 flex gap-2">
                      <Button onClick={() => removeBox(b.key)}>Удалить</Button>
                    </div>
                  </div>
                );
              })}

              <div>
                <Button onClick={addBox}>+ Добавить основное блюдо</Button>
              </div>
            </div>
          </section>

          {/* ====== Запеканки ====== */}
          <section className="space-y-2 pt-6">
            <div className="text-white font-semibold">
              <span className="text-yellow-400">[ </span>
              Запеканки и блинчики
              <span className="text-yellow-400"> ]</span>
            </div>
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

          {/* ====== Салаты ====== */}
          <section className="space-y-2 pt-6">
            <div className="text-white font-semibold">
              <span className="text-yellow-400">[ </span>
              Салаты
              <span className="text-yellow-400"> ]</span>
            </div>
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

          {/* ====== Супы ====== */}
          <section className="space-y-2 pt-6">
            <div className="text-white font-semibold">
              <span className="text-yellow-400">[ </span>
              Супы
              <span className="text-yellow-400"> ]</span>
            </div>
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

          {/* ====== Выпечка ====== */}
          <section className="space-y-2 pt-6">
            <div className="text-white font-semibold">
              <span className="text-yellow-400">[ </span>
              Выпечка
              <span className="text-yellow-400"> ]</span>
            </div>
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

          {error && <div className="text-rose-400 mt-4">{error}</div>}
          {done && (
            <div className="text-emerald-400 mt-4">
              Заказ сохранён. Номер заказа: <b>{done.orderId}</b>
            </div>
          )}

          {/* Нижняя панель действий: Сохранить + Назад */}
          <div className="pt-6 flex flex-col sm:flex-row gap-3 sm:items-center">
            <Button onClick={submit} disabled={submitting || loading}>
              {submitting ? 'Сохраняю…' : 'Оформить заказ'}
            </Button>
            <div className="flex-1" />
            <Button onClick={goBack}>Назад</Button>
          </div>
        </Panel>
      </div>
    </main>
  );
}
