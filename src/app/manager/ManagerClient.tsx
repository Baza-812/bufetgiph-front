'use client';

import { useEffect, useMemo, useState } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import { useSearchParams } from 'next/navigation';

type DatesResp = { ok: boolean; dates: string[] };

type MenuItem = {
  id: string;
  name: string;
  type: 'main' | 'side' | 'extra';
  category?: string | null;
  isGarnirnoe?: boolean;
};

type MenuRespLoose =
  | { ok: boolean; date: string; items: any[] }
  | { ok: boolean; date: string; mains: any[]; sides: any[]; extras: any[] };

type BoxRow = {
  key: string;
  mainId: string | null;
  sideId: string | null;
  qtyStandard: number;
  qtyUpsized: number;
};

type ExtraPick = { itemId: string | null; qty: number };

function uuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${init?.method || 'GET'} ${url} -> ${res.status}: ${text}`);
  }
  return res.json();
}

function toBool(v: any): boolean {
  if (v === true || v === 1 || v === '1') return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'y' || s === 'да' || s === 'истина';
}

function normalizeMenu(resp: MenuRespLoose): MenuItem[] {
  const out: MenuItem[] = [];
  const push = (arr: any[] | undefined, type: MenuItem['type']) => {
    (arr || []).forEach((raw) => {
      const f = raw?.fields || raw;
      const id = raw?.id || f?.id || f?.recordId || '';
      if (!id) return;

      const name =
        f?.Name || f?.name || f?.Title || f?.title || f?.['Dish Name'] || f?.['Meal Name'] || `${type} ${id}`;
      const cat =
        f?.Category || f?.category || f?.['Extra Category'] || f?.['Dish Category'] || null;

      const isG =
        toBool(f?.IsGarnirnoe) ||
        toBool(f?.Garnirnoe) ||
        toBool(f?.['Is Garnirnoe']) ||
        toBool(f?.['Garnirnoe (from Dish)']) ||
        toBool(f?.['Garnirnoe (from Dishes)']) ||
        toBool(f?.['Гарнирное']) ||
        false;

      out.push({
        id: String(id),
        name: String(name),
        type,
        category: cat ? String(cat) : null,
        isGarnirnoe: isG,
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
      const cat =
        f?.Category || f?.category || f?.['Extra Category'] || f?.['Dish Category'] || null;

      const isG =
        toBool(f?.IsGarnirnoe) ||
        toBool(f?.Garnirnoe) ||
        toBool(f?.['Is Garnirnoe']) ||
        toBool(f?.['Garnirnoe (from Dish)']) ||
        toBool(f?.['Garnirnoe (from Dishes)']) ||
        toBool(f?.['Гарнирное']) ||
        false;

      out.push({
        id: String(id),
        name: String(name),
        type,
        category: cat ? String(cat) : null,
        isGarnirnoe: isG,
      });
    });
    return out;
  }

  return out;
}

// Явные кнопки –/+, хорошо видны на мобильных
function QtyStepper({
  value,
  min = 0,
  onChange,
}: {
  value: number;
  min?: number;
  onChange: (v: number) => void;
}) {
  const dec = () => onChange(Math.max(min, (value || 0) - 1));
  const inc = () => onChange((value || 0) + 1);
  return (
    <div className="flex items-stretch rounded-lg overflow-hidden border border-white/15 bg-neutral-850">
      <button
        type="button"
        onClick={dec}
        className="px-4 py-2 text-lg bg-neutral-800 text-white active:scale-95"
        aria-label="Decrease"
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        className="w-20 text-center bg-neutral-900 text-white py-2"
        value={value}
        onChange={(e) => onChange(Math.max(min, parseInt(e.target.value || '0', 10)))}
      />
      <button
        type="button"
        onClick={inc}
        className="px-4 py-2 text-lg bg-neutral-800 text-white active:scale-95"
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}

export default function ManagerClient() {
  const sp = useSearchParams();

  const org = sp.get('org') || '';
  const employeeID = sp.get('employeeID') || '';
  const token = sp.get('token') || '';
  const initialDate = sp.get('date') || '';
  const mode = sp.get('mode') || ''; // '' | 'edit'
  const orderId = sp.get('orderId') || '';

  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState<string>(initialDate);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loadingDates, setLoadingDates] = useState(false);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ orderId: string } | null>(null);

  const [boxes, setBoxes] = useState<BoxRow[]>([
    { key: uuid(), mainId: null, sideId: null, qtyStandard: 1, qtyUpsized: 0 },
  ]);

  const [extra1, setExtra1] = useState<ExtraPick>({ itemId: null, qty: 0 });
  const [extra2, setExtra2] = useState<ExtraPick>({ itemId: null, qty: 0 });

  const mains = useMemo(() => menu.filter((i) => i.type === 'main'), [menu]);
  const sides = useMemo(() => menu.filter((i) => i.type === 'side'), [menu]);

  const ALLOWED = new Set(['salad', 'soup', 'zapekanka', 'салат', 'суп', 'запеканка']);
  const extras = useMemo(
    () =>
      menu.filter(
        (i) =>
          i.type === 'extra' &&
          i.category &&
          ALLOWED.has(String(i.category).toLowerCase()),
      ),
    [menu],
  );

  // даты
  useEffect(() => {
    if (!org || !employeeID || !token) return;
    setLoadingDates(true);
    fetchJSON<DatesResp>(`/api/dates?org=${encodeURIComponent(org)}&as=hr`)
      .then((d) => setDates(Array.isArray(d.dates) ? d.dates : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoadingDates(false));
  }, [org, employeeID, token]);

  // если даты пришли, а дата пуста — подставим первую
  useEffect(() => {
    if (!date && dates.length) setDate(dates[0]);
  }, [dates, date]);

  // меню
  useEffect(() => {
    if (!org || !date) return;
    setLoadingMenu(true);
    setError(null);
    setMenu([]);

    fetchJSON<MenuRespLoose>(`/api/menu?org=${encodeURIComponent(org)}&date=${encodeURIComponent(date)}`)
      .then((resp) => setMenu(normalizeMenu(resp)))
      .catch((e) => setError(e.message))
      .finally(() => setLoadingMenu(false));
  }, [org, date]);

  // helper
  const isMainGarnirnoe = (mainId: string | null) => {
    if (!mainId) return false;
    const item = menu.find((i) => i.id === mainId);
    return Boolean(item?.isGarnirnoe);
  };

  // предзаполнение при режиме edit
  useEffect(() => {
    if (!org || !date || !menu.length || mode !== 'edit' || !orderId) return;
    (async () => {
      try {
        const s = await fetchJSON<{
          ok: boolean;
          summary?: {
            items?: Array<{
              type: 'box' | 'extra';
              mainId?: string | null;
              mainName?: string | null;
              sideId?: string | null;
              sideName?: string | null;
              qtyStandard?: number;
              qtyUpsized?: number;
              extraId?: string | null;
              extraName?: string | null;
              qty?: number;
            }>;
            lines?: string[];
          };
        }>(
          `/api/order_summary?org=${encodeURIComponent(org)}&date=${encodeURIComponent(date)}&scope=org&with=lines,ids&orderId=${encodeURIComponent(orderId)}`,
        );

        const items = s?.summary?.items || [];

        const newBoxes: BoxRow[] = [];
        const foundExtras: Array<{ itemId: string | null; name?: string; qty: number }> = [];

        for (const it of items) {
          if (it.type === 'box') {
            const m =
              (it.mainId && mains.find((x) => x.id === it.mainId)) ||
              (it.mainName && mains.find((x) => x.name === it.mainName)) ||
              null;
            const sd =
              (it.sideId && sides.find((x) => x.id === it.sideId)) ||
              (it.sideName && sides.find((x) => x.name === it.sideName)) ||
              null;

            newBoxes.push({
              key: uuid(),
              mainId: m ? m.id : null,
              sideId: m && m.isGarnirnoe ? null : sd ? sd.id : null, // страховка
              qtyStandard: Math.max(0, it.qtyStandard ?? 0),
              qtyUpsized: Math.max(0, it.qtyUpsized ?? 0),
            });
          } else if (it.type === 'extra') {
            const ex =
              (it.extraId && extras.find((x) => x.id === it.extraId)) ||
              (it.extraName && extras.find((x) => x.name === it.extraName)) ||
              null;
            if (ex) foundExtras.push({ itemId: ex.id, qty: Math.max(0, it.qty ?? 0) || 1 });
          }
        }

        if (newBoxes.length) setBoxes(newBoxes);
        if (foundExtras.length) {
          setExtra1(foundExtras[0] || { itemId: null, qty: 0 });
          setExtra2(foundExtras[1] || { itemId: null, qty: 0 });
        }
      } catch {
        // тихо игнорируем, если не удалось предзаполнить
      }
    })();
  }, [org, date, menu, mode, orderId, mains, sides, extras]);

  function addBox() {
    setBoxes((prev) => [...prev, { key: uuid(), mainId: null, sideId: null, qtyStandard: 1, qtyUpsized: 0 }]);
  }
  function removeBox(key: string) {
    setBoxes((prev) => prev.filter((b) => b.key !== key));
  }
  function updateBox(key: string, patch: Partial<BoxRow>) {
    setBoxes((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  }

  // помогающее: проверка «выбранное основное — гарнирное?»
  const isMainGarnirnoe = (mainId: string | null) => {
    if (!mainId) return false;
    const item = menu.find((i) => i.id === mainId);
    return Boolean(item?.isGarnirnoe);
  };

  async function submit() {
    setError(null);
    setDone(null);

    if (!org || !employeeID || !token || !date) {
      setError('Не хватает параметров org/employeeID/token/date');
      return;
    }

    const cleanedBoxes = boxes
      .map((b) => {
        const mainIsG = isMainGarnirnoe(b.mainId);
        return {
          mainId: b.mainId ?? null,
          sideId: mainIsG ? null : (b.sideId ?? null), // жёсткая защита
          qtyStandard: Math.max(0, Math.floor(b.qtyStandard || 0)),
          qtyUpsized: Math.max(0, Math.floor(b.qtyUpsized || 0)),
        };
      })
      .filter((b) => (b.mainId || b.sideId) && (b.qtyStandard + b.qtyUpsized) > 0);

    const cleanedExtras = [extra1, extra2]
      .map((x) => ({ itemId: x.itemId ?? null, qty: Math.max(0, Math.floor(x.qty || 0)) }))
      .filter((x) => x.itemId && x.qty > 0) as { itemId: string; qty: number }[];

    if (cleanedBoxes.length === 0 && cleanedExtras.length === 0) {
      setError('Добавьте хотя бы один бокс или доп.');
      return;
    }

    const body: any = {
      employeeID,
      org,
      token,
      date,
      boxes: cleanedBoxes,
      extras: cleanedExtras,
      clientToken: uuid(),
    };

    // режим замены существующего заказа
    if (mode === 'edit' && orderId) body.replaceOrderId = orderId;

    try {
      setSubmitting(true);
      const resp = await fetchJSON<{ ok: boolean; orderId?: string; error?: string }>(`/api/order_manager`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(resp.error || 'Ошибка при сохранении заказа');
      setDone({ orderId: resp.orderId || orderId || '—' });
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="p-4 space-y-6">
      <Panel title={`Заказ для менеджера ${mode === 'edit' ? '(редактирование)' : ''}`}>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <div className="text-sm text-white/70 mb-1">Дата</div>
              <select
                className="bg-neutral-800 text-white rounded px-3 py-2"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={loadingDates || !dates.length}
              >
                {dates.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            {mode === 'edit' && orderId && (
              <div className="text-xs text-emerald-400">
                Режим редактирования заказа <b>{orderId}</b>
              </div>
            )}
          </div>

          <div className="border-t border-white/10 pt-4">
            <div className="mb-2 text-white/90 font-semibold">Боксы</div>

            <div className="space-y-3">
              {boxes.map((b, idx) => {
                const mainIsG = isMainGarnirnoe(b.mainId);
                return (
                  <div key={b.key} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-center">
                    <div className="md:col-span-2">
                      <div className="text-xs text-white/60 mb-1">Основное</div>
                      <select
                        className="w-full bg-neutral-800 text-white rounded px-2 py-2"
                        value={b.mainId || ''}
                        onChange={(e) => {
                          const newMain = e.target.value || null;
                          if (newMain) {
                            const isG = isMainGarnirnoe(newMain);
                            updateBox(b.key, { mainId: newMain, sideId: isG ? null : b.sideId });
                          } else {
                            updateBox(b.key, { mainId: null });
                          }
                        }}
                        disabled={loadingMenu}
                      >
                        <option value="">— не выбрано —</option>
                        {mains.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}{m.isGarnirnoe ? ' · гарнирное' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <div className="text-xs text-white/60 mb-1">Гарнир</div>
                      <select
                        className="w-full bg-neutral-800 text-white rounded px-2 py-2 disabled:opacity-50"
                        value={b.sideId || ''}
                        onChange={(e) => {
                          const val = e.target.value || null;
                          // двойная защита
                          if (isMainGarnirnoe(b.mainId)) {
                            updateBox(b.key, { sideId: null });
                          } else {
                            updateBox(b.key, { sideId: val });
                          }
                        }}
                        disabled={loadingMenu || isMainGarnirnoe(b.mainId)}
                        title={isMainGarnirnoe(b.mainId) ? 'К гарнирному блюду гарнир не добавляется' : undefined}
                      >
                        <option value="">— не выбрано —</option>
                        {sides.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="text-xs text-white/60 mb-1">Обычный</div>
                      <QtyStepper
                        value={b.qtyStandard}
                        min={0}
                        onChange={(v) => updateBox(b.key, { qtyStandard: v })}
                      />
                    </div>

                    <div>
                      <div className="text-xs text-white/60 mb-1">Увеличенный</div>
                      <QtyStepper
                        value={b.qtyUpsized}
                        min={0}
                        onChange={(v) => updateBox(b.key, { qtyUpsized: v })}
                      />
                    </div>

                    <div className="md:col-span-6 flex gap-2">
                      {idx === boxes.length - 1 && (
                        <Button variant="ghost" onClick={addBox}>
                          + Добавить бокс
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
          </div>

          <div className="border-t border-white/10 pt-4">
            <div className="mb-2 text-white/90 font-semibold">Дополнительно (Salad / Soup / Zapekanka)</div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[{ label: 'Extra 1', state: extra1, set: setExtra1 }, { label: 'Extra 2', state: extra2, set: setExtra2 }].map(
                ({ label, state, set }) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="text-xs text-white/60 mb-1">{label}</div>
                      <select
                        className="w-full bg-neutral-800 text-white rounded px-2 py-2"
                        value={state.itemId || ''}
                        onChange={(e) => set({ ...state, itemId: e.target.value || null })}
                        disabled={loadingMenu}
                      >
                        <option value="">— не выбрано —</option>
                        {extras.map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.name} {x.category ? `· ${x.category}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-28">
                      <div className="text-xs text-white/60 mb-1">Кол-во</div>
                      <QtyStepper
                        value={state.qty}
                        min={0}
                        onChange={(v) => set({ ...state, qty: v })}
                      />
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>

          {error && <div className="text-rose-400">{error}</div>}
          {done && (
            <div className="text-emerald-400">
              Заказ {mode === 'edit' ? 'обновлён' : 'сохранён'}. Номер заказа: <b>{done.orderId}</b>
            </div>
          )}

          <div className="pt-2">
            <Button onClick={submit} disabled={submitting || !date || (loadingMenu && !menu.length)}>
              {submitting ? (mode === 'edit' ? 'Обновляю…' : 'Сохраняю…') : (mode === 'edit' ? 'Обновить заказ' : 'Оформить заказ')}
            </Button>
          </div>
        </div>
      </Panel>
    </main>
  );
}
