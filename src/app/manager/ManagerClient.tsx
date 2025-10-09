// src/app/manager/ManagerClient.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';

type DatesResp = { ok: boolean; dates: string[] };
type MenuItem = {
  id: string;
  name: string;
  type: 'main' | 'side' | 'extra'; // упрощённо
};

type MenuResp = {
  ok: boolean;
  date: string;
  items: MenuItem[];
};

// одна строка "бокса" (комбинация main+side и 2 числовых счётчика)
type BoxRow = {
  key: string;
  mainId: string | null;
  sideId: string | null;
  qtyStandard: number; // обычный
  qtyUpsized: number;  // увеличенный
};

// допы с qty
type ExtraRow = {
  itemId: string;
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

export default function ManagerClient(props: { org: string; employeeID: string; token: string }) {
  const { org, employeeID, token } = props;

  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState<string>('');
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ orderId: string } | null>(null);

  // динамический список боксов
  const [boxes, setBoxes] = useState<BoxRow[]>([
    { key: uuid(), mainId: null, sideId: null, qtyStandard: 1, qtyUpsized: 0 },
  ]);
  // допы с qty (builder)
  const [extras, setExtras] = useState<Record<string, number>>({}); // itemId -> qty

  const mains = useMemo(() => menu.filter(i => i.type === 'main'), [menu]);
  const sides = useMemo(() => menu.filter(i => i.type === 'side'), [menu]);
  const extraItems = useMemo(() => menu.filter(i => i.type === 'extra'), [menu]);

  // грузим даты (для менеджера берём HR-окно, чтобы видеть «сегодня»)
  useEffect(() => {
    if (!org || !employeeID || !token) return;
    setLoading(true);
    fetchJSON<DatesResp>(`/api/dates?org=${encodeURIComponent(org)}&as=hr`)
      .then(d => setDates(Array.isArray(d.dates) ? d.dates : []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [org, employeeID, token]);

  // автоподставим первую дату
  useEffect(() => {
    if (!date && dates.length) setDate(dates[0]);
  }, [dates, date]);

  // загрузка меню на дату
  useEffect(() => {
    if (!org || !date) return;
    setMenu([]);
    setError(null);
    fetchJSON<MenuResp>(`/api/menu?org=${encodeURIComponent(org)}&date=${encodeURIComponent(date)}`)
      .then(m => setMenu(Array.isArray(m.items) ? m.items : []))
      .catch(e => setError(e.message));
  }, [org, date]);

  function addBox() {
    setBoxes(prev => [...prev, { key: uuid(), mainId: null, sideId: null, qtyStandard: 1, qtyUpsized: 0 }]);
  }
  function removeBox(key: string) {
    setBoxes(prev => prev.filter(b => b.key !== key));
  }
  function updateBox(key: string, patch: Partial<BoxRow>) {
    setBoxes(prev => prev.map(b => (b.key === key ? { ...b, ...patch } : b)));
  }

  function setExtraQty(itemId: string, qty: number) {
    setExtras(prev => {
      const q = Math.max(0, Math.floor(qty || 0));
      const next = { ...prev };
      if (q <= 0) delete next[itemId];
      else next[itemId] = q;
      return next;
    });
  }

  async function submit() {
    setError(null);
    setDone(null);

    if (!org || !employeeID || !token || !date) {
      setError('Не хватает параметров org/employeeID/token/date');
      return;
    }

    const cleanedBoxes = boxes
      .map(b => ({
        mainId: b.mainId || undefined,
        sideId: b.sideId || undefined,
        qtyStandard: Math.max(0, Math.floor(b.qtyStandard || 0)),
        qtyUpsized: Math.max(0, Math.floor(b.qtyUpsized || 0)),
      }))
      .filter(b => (b.mainId || b.sideId) && (b.qtyStandard + b.qtyUpsized) > 0);

    const cleanedExtras: { itemId: string; qty: number }[] = Object.entries(extras)
      .map(([itemId, qty]) => ({ itemId, qty: Math.max(0, Math.floor(qty || 0)) }))
      .filter(x => x.qty > 0);

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
      clientToken: uuid(), // для идемпотентности на бэке
    };

    try {
      setSubmitting(true);
      const resp = await fetchJSON<{ ok: boolean; orderId?: string; idempotent?: boolean; error?: string }>(
        `/api/order_manager`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
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
        {!org || !employeeID || !token ? (
          <div className="text-rose-400">
            Нет параметров доступа. Откройте ссылку c <b>org</b>, <b>employeeID</b>, <b>token</b>.
          </div>
        ) : null}

        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <div className="text-sm text-white/70 mb-1">Дата</div>
              <select
                className="bg-neutral-800 text-white rounded px-3 py-2"
                value={date}
                onChange={e => setDate(e.target.value)}
                disabled={loading || !dates.length}
              >
                {dates.map(d => (
                  <option key={d} value={d}>{d}</option>
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
              {boxes.map((b, idx) => (
                <div key={b.key} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-center">
                  <div className="md:col-span-2">
                    <div className="text-xs text-white/60 mb-1">Основное</div>
                    <select
                      className="w-full bg-neutral-800 text-white rounded px-2 py-2"
                      value={b.mainId || ''}
                      onChange={e => updateBox(b.key, { mainId: e.target.value || null })}
                    >
                      <option value="">— не выбрано —</option>
                      {mains.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-xs text-white/60 mb-1">Гарнир</div>
                    <select
                      className="w-full bg-neutral-800 text-white rounded px-2 py-2"
                      value={b.sideId || ''}
                      onChange={e => updateBox(b.key, { sideId: e.target.value || null })}
                    >
                      <option value="">— не выбрано —</option>
                      {sides.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="text-xs text-white/60 mb-1">Обычный</div>
                    <input
                      type="number"
                      min={0}
                      className="w-full bg-neutral-800 text-white rounded px-2 py-2"
                      value={b.qtyStandard}
                      onChange={e => updateBox(b.key, { qtyStandard: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                    />
                  </div>

                  <div>
                    <div className="text-xs text-white/60 mb-1">Увеличенный</div>
                    <input
                      type="number"
                      min={0}
                      className="w-full bg-neutral-800 text-white rounded px-2 py-2"
                      value={b.qtyUpsized}
                      onChange={e => updateBox(b.key, { qtyUpsized: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                    />
                  </div>

                  <div className="md:col-span-6 flex gap-2">
                    {idx === boxes.length - 1 && (
                      <Button variant="ghost" onClick={addBox}>+ Добавить бокс</Button>
                    )}
                    {boxes.length > 1 && (
                      <Button variant="ghost" onClick={() => removeBox(b.key)}>Удалить</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {!!extraItems.length && (
            <div className="border-t border-white/10 pt-4">
              <div className="mb-2 text-white/90 font-semibold">Дополнительно</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {extraItems.map(x => {
                  const val = extras[x.id] || 0;
                  return (
                    <label key={x.id} className="flex items-center justify-between bg-neutral-800 rounded px-3 py-2">
                      <span className="text-white/90">{x.name}</span>
                      <input
                        type="number"
                        min={0}
                        className="w-24 bg-neutral-900 text-white rounded px-2 py-1 text-right"
                        value={val}
                        onChange={e => setExtraQty(x.id, parseInt(e.target.value || '0', 10))}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {error && <div className="text-rose-400">{error}</div>}
          {done && (
            <div className="text-emerald-400">
              Заказ сохранён. Номер заказа: <b>{done.orderId}</b>
            </div>
          )}

          <div className="pt-2">
            <Button onClick={submit} disabled={submitting || !date}>
              {submitting ? 'Сохраняю…' : 'Оформить заказ'}
            </Button>
          </div>
        </div>
      </Panel>

      <Panel title="Подсказки">
        <ul className="list-disc list-inside text-white/70 space-y-1">
          <li>«Сегодня» доступно до HR Cutoff; остальные даты — по обычному cutoff.</li>
          <li>Несколько боксов: выберите пары (основное+гарнир) и задайте количество для каждого типа.</li>
          <li>Дополнительно: укажите количество для нужных позиций.</li>
          <li>Повторная отправка с тем же клиентским токеном не создаст дубликат (идемпотентность).</li>
        </ul>
      </Panel>
    </main>
  );
}
