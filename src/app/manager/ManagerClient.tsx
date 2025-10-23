// src/app/manager/ManagerClient.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';

type DatesResp = { ok: boolean; dates: string[] };

// Универсальный элемент меню
type MenuItem = {
  id: string;
  name: string;
  type: 'main' | 'side' | 'extra';
  category?: string | null;
  isGarnirnoe?: boolean; // ← добавили
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

type ExtraPick = {
  itemId: string | null;
  qty: number;
};

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

// утилита нормализации булевых значений из Airtable
function toBool(v: any): boolean {
  if (v === true || v === 1 || v === '1') return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === 'y' || s === 'да' || s === 'истина';
}

// нормализация элементов меню из разных схем
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

      // попытка считать флаг «гарнирное»
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

// Небольшой степпер для кол-ва (лучше на мобилках)
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
    <div className="flex items-stretch border border-white/10 rounded overflow-hidden">
      <button
        type="button"
        onClick={dec}
        className="px-3 bg-neutral-800 text-white hover:bg-neutral-700"
        aria-label="Decrease"
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        className="w-16 text-center bg-neutral-900 text-white"
        value={value}
        onChange={(e) => onChange(Math.max(min, parseInt(e.target.value || '0', 10)))}
      />
      <button
        type="button"
        onClick={inc}
        className="px-3 bg-neutral-800 text-white hover:bg-neutral-700"
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}

export default function ManagerClient(props: { org: string; employeeID: string; token: string }) {
  const { org, employeeID, token } = props;

  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState<string>('');
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loadingDates, setLoadingDates] = useState(false);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ orderId: string } | null>(null);

  // динамические боксы
  const [boxes, setBoxes] = useState<BoxRow[]>([
    { key: uuid(), mainId: null, sideId: null, qtyStandard: 1, qtyUpsized: 0 },
  ]);

  // два extra (каждый с qty)
  const [extra1, setExtra1] = useState<ExtraPick>({ itemId: null, qty: 0 });
  const [extra2, setExtra2] = useState<ExtraPick>({ itemId: null, qty: 0 });

  const mains = useMemo(() => menu.filter((i) => i.type === 'main'), [menu]);
  const sides = useMemo(() => menu.filter((i) => i.type === 'side'), [menu]);
  // extras только категории Salad, Soup, Zapekanka
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

  // даты (HR-окно, чтобы было «сегодня»)
  useEffect(() => {
    if (!org || !employeeID || !token) return;
    setLoadingDates(true);
    fetchJSON<DatesResp>(`/api/dates?org=${encodeURIComponent(org)}&as=hr`)
      .then((d) => setDates(Array.isArray(d.dates) ? d.dates : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoadingDates(false));
  }, [org, employeeID, token]);

  // автоподставим первую дату
  useEffect(() => {
    if (!date && dates.length) setDate(dates[0]);
  }, [dates, date]);

  // загрузка меню
  useEffect(() => {
    if (!org || !date) return;
    setLoadingMenu(true);
    setError(null);
    setMenu([]);

    fetchJSON<MenuRespLoose>(`/api/menu?org=${encodeURIComponent(org)}&date=${encodeURIComponent(date)}`)
      .then((resp) => {
        const norm = normalizeMenu(resp);
        setMenu(norm);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoadingMenu(false));
  }, [org, date]);

  // попытка предзаполнить форму из summary (после клика «Изменить»)
  useEffect(() => {
    if (!org || !date) return;
    (async () => {
      try {
        const s = await fetchJSON<{ ok: boolean; summary?: { lines?: string[] } }>(
          `/api/order_summary?org=${encodeURIComponent(org)}&date=${encodeURIComponent(date)}&scope=org&with=lines`,
        );
        const lines = s?.summary?.lines || [];
        if (!lines.length || menu.length === 0) return;

        // простая эвристика: ищем по названиям
        const newBoxes: BoxRow[] = [];
        const foundExtras: { name: string; qty: number }[] = [];

        for (const raw of lines) {
          const txt = String(raw || '');
          // пытаемся вытащить количество вида "× 3" в конце строки
          const qtyMatch = txt.match(/x|\×\s*(\d+)/i);
          const qty = qtyMatch && qtyMatch[1] ? parseInt(qtyMatch[1], 10) : 1;

          // разбиваем "Main + Side" на части по " + "
          const [left, right] = txt.split(' + ').map((s) => s.trim());

          // сначала пробуем мэчить на main/side
          const m = left ? mains.find((i) => i.name === left) || mains.find((i) => left && i.name.includes(left)) : null;
          const sd = right ? sides.find((i) => i.name === right) || sides.find((i) => right && i.name.includes(right)) : null;

          if (m || sd) {
            newBoxes.push({
              key: uuid(),
              mainId: m ? m.id : null,
              sideId: sd ? sd.id : null,
              qtyStandard: qty,
              qtyUpsized: 0,
            });
            continue;
          }

          // иначе считаем строку экстрой
          const ex = extras.find((i) => txt.includes(i.name));
          if (ex) foundExtras.push({ name: ex.name, qty });
        }

        if (newBoxes.length) setBoxes(newBoxes);
        if (foundExtras.length) {
          const ex1 = extras.find((e) => e.name === foundExtras[0]?.name);
          const ex2 = extras.find((e) => e.name === foundExtras[1]?.name);
          if (ex1) setExtra1({ itemId: ex1.id, qty: foundExtras[0]?.qty || 1 });
          if (ex2) setExtra2({ itemId: ex2.id, qty: foundExtras[1]?.qty || 1 });
        }
      } catch {
        // тихо игнорируем, если не вышло предзаполнить
      }
    })();
  }, [org, date, menu]); // ждём меню, чтобы было что мэчить

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
      .map((b) => ({
        mainId: b.mainId ?? null,        // ← всегда отправляем ключ
        sideId: b.sideId ?? null,        // ← всегда отправляем ключ
        qtyStandard: Math.max(0, Math.floor(b.qtyStandard || 0)),
        qtyUpsized: Math.max(0, Math.floor(b.qtyUpsized || 0)),
      }))
      .filter((b) => (b.mainId || b.sideId) && (b.qtyStandard + b.qtyUpsized) > 0);

    const cleanedExtras = [extra1, extra2]
      .map((x) => ({ itemId: x.itemId ?? null, qty: Math.max(0, Math.floor(x.qty || 0)) }))
      .filter((x) => x.itemId && x.qty > 0) as { itemId: string; qty: number }[];

    if (cleanedBoxes.length === 0 && cleanedExtras.length === 0) {
      setError('Добавьте хотя бы один бокс или доп.');
      return;
    }

    const body = {
      employeeID,
      org,
      token,
      date,
      boxes: cleanedBoxes,
      extras: cleanedExtras,
      clientToken: uuid(),
    };

    try {
      setSubmitting(true);
      const resp = await fetchJSON<{ ok: boolean; orderId?: string; error?: string }>(`/api/order_manager`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(resp.error || 'Ошибка при сохранении заказа');
      setDone({ orderId: resp.orderId || '—' });
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="p-4 space-y-6">
      <Panel title="Заказ для менеджера (несколько боксов)">
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
            <div className="text-white/60 text-sm">
              Доступные даты формируются с учётом HR Cutoff для «сегодня».
            </div>
          </div>

          <div className="border-t border-white/10 pt-4">
            <div className="mb-2 text-white/90 font-semibold">Боксы</div>

            <div className="space-y-3">
              {boxes.map((b, idx) => {
                const mainIsG = isMainGarnirnoe(b.mainId);
                return (
                  <div key={b.key} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-center">
                    <div className="md:col-span-2">
                      <div className="text-xs text-white/60 mb-1">Основное</div>
                      <select
                        className="w-full bg-neutral-800 text-white rounded px-2 py-2"
                        value={b.mainId || ''}
                        onChange={(e) => {
                          const newMain = e.target.value || null;
                          // если выбранное основное — «гарнирное», чистим и блокируем гарнир
                          if (newMain && isMainGarnirnoe(newMain)) {
                            updateBox(b.key, { mainId: newMain, sideId: null });
                          } else {
                            updateBox(b.key, { mainId: newMain });
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
                        onChange={(e) => updateBox(b.key, { sideId: e.target.value || null })}
                        disabled={loadingMenu || mainIsG}
                        title={mainIsG ? 'К гарнирному блюду гарнир не добавляется' : undefined}
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
            <div className="mb-2 text-white/90 font-semibold">Дополнительно (только Salad, Soup, Zapekanka)</div>

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
              Заказ сохранён. Номер заказа: <b>{done.orderId}</b>
            </div>
          )}

          <div className="pt-2">
            <Button onClick={submit} disabled={submitting || !date || (loadingMenu && !menu.length)}>
              {submitting ? 'Сохраняю…' : 'Оформить заказ'}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title="Подсказки">
        <ul className="list-disc list-inside text-white/70 space-y-1">
          <li>«Сегодня» доступно до HR Cutoff; остальные даты — по обычному cutoff.</li>
          <li>Несколько боксов: выберите пары (основное+гарнир) и задайте количество для каждого типа.</li>
          <li>Дополнительно: выберите до двух позиций и укажите количество (только категории Salad, Soup, Zapekanka).</li>
          <li>Повторная отправка с тем же клиентским токеном не создаст дубликат (идемпотентность).</li>
        </ul>
      </Panel>
    </main>
  );
}
