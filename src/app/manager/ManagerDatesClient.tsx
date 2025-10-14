'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import { useSearchParams, useRouter } from 'next/navigation';

type Summary = {
  orderId?: string;
  status?: string;
  date?: string;
  lines?: string[];
};

type SummaryResp = { ok: boolean; summary: Summary | null };

function fmtDayLabel(iso: string) {
  try {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    const wd = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][dt.getUTCDay()];
    const dd = String(d).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    return `${wd.toUpperCase()} ${dd}.${mm}`;
  } catch {
    return iso;
  }
}

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init });
  if (!r.ok) throw new Error(`${init?.method || 'GET'} ${url} -> ${r.status}`);
  return r.json();
}

export default function ManagerDatesClient() {
  const sp = useSearchParams();
  const router = useRouter();

  const org = sp.get('org') || '';
  const employeeID = sp.get('employeeID') || '';
  const token = sp.get('token') || '';

  const [dates, setDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');

  // карта «занят/свободен»
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [busyReady, setBusyReady] = useState(false);

  // модалка
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSummary, setModalSummary] = useState<Summary | null>(null);

  // 1) даты (для менеджера используем окно as=hr, чтобы «сегодня» было доступно до HR cutoff)
  useEffect(() => {
    (async () => {
      if (!org) return;
      try {
        setLoading(true); setErr('');
        const r = await fetchJSON<{ ok: boolean; dates: string[] }>(`/api/dates?org=${encodeURIComponent(org)}&as=hr`);
        setDates(r.dates || []);
      } catch (e: any) {
        setErr(e?.message || String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [org]);

  // 2) занятость: сначала /api/busy (как у сотрудников), затем перепроверяем true-дни через /api/order_summary и отбрасываем Cancelled
  const reloadBusy = useCallback(async () => {
    if (!employeeID || !org || !token || dates.length === 0) return;
    setBusyReady(false);
    try {
      const qs = new URLSearchParams({ employeeID, org, token, dates: dates.join(',') });
      const base = await fetchJSON<{ ok: boolean; busy: Record<string, boolean> }>(`/api/busy?${qs.toString()}`);
      const map: Record<string, boolean> = { ...(base.busy || {}) };

      const needCheck = Object.keys(map).filter((d) => map[d]);
      await Promise.all(
        needCheck.map(async (d) => {
          try {
            const u = `/api/order_summary?org=${encodeURIComponent(org)}&employeeID=${encodeURIComponent(
              employeeID,
            )}&date=${encodeURIComponent(d)}`;
            const s = await fetchJSON<SummaryResp>(u);
            const st = String(s?.summary?.status || '').toLowerCase();
            const cancelled = st === 'cancelled' || st === 'canceled';
            map[d] = Boolean(s?.summary?.orderId) && !cancelled;
          } catch {
            // на ошибке не меняем
          }
        }),
      );

      setBusy(map);
    } catch {
      const map: Record<string, boolean> = {};
      for (const d of dates) map[d] = false;
      setBusy(map);
    } finally {
      setBusyReady(true);
    }
  }, [dates, employeeID, org, token]);

  useEffect(() => { reloadBusy(); }, [reloadBusy]);

  // при возврате на вкладку — обновим
  useEffect(() => {
    const onFocus = () => reloadBusy();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reloadBusy]);

  function toOrderPage(date: string) {
    const u = new URL('/manager/order', window.location.origin);
    u.searchParams.set('org', org);
    u.searchParams.set('employeeID', employeeID);
    u.searchParams.set('token', token);
    u.searchParams.set('date', date);
    router.push(u.toString());
  }

  // открыть модалку для занятого дня
  async function openModalFor(date: string) {
    setModalOpen(true);
    setModalDate(date);
    setModalSummary(null);
    setModalError(null);
    setModalLoading(true);
    try {
      const u = `/api/order_summary?org=${encodeURIComponent(org)}&employeeID=${encodeURIComponent(
        employeeID,
      )}&date=${encodeURIComponent(date)}`;
      const j = await fetchJSON<SummaryResp>(u);
      setModalSummary(j.summary || null);
    } catch (e: any) {
      setModalError(e?.message || String(e));
    } finally {
      setModalLoading(false);
    }
  }

  function closeModal() {
    setModalOpen(false);
    setModalDate(null);
    setModalError(null);
    setModalSummary(null);
  }

  async function cancelOrder() {
    if (!modalSummary?.orderId) return;
    try {
      setModalLoading(true);
      setModalError(null);
      const r = await fetch('/api/order_cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
        body: JSON.stringify({
          orderId: modalSummary.orderId,
          org,
          employeeID,
          token,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || 'Ошибка отмены');

      // локально «разжёлтим» день
      if (modalDate) setBusy((m) => ({ ...m, [modalDate]: false }));
      closeModal();
    } catch (e: any) {
      setModalError(e?.message || String(e));
    } finally {
      setModalLoading(false);
    }
  }

  function editOrder() {
    if (!modalDate) return;
    toOrderPage(modalDate);
  }

  function onPick(d: string) {
    if (!busyReady) return;
    if (busy[d]) {
      // занят — модалка
      openModalFor(d);
    } else {
      // свободен — форма заказа
      toOrderPage(d);
    }
  }

  return (
    <main>
      <Panel title="Заказ менеджера: выберите дату">
        {loading && <div className="text-white/60 text-sm">Загрузка дат…</div>}
        {err && <div className="text-red-400 text-sm">Ошибка: {err}</div>}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {dates.map((d) => {
            const has = !!busy[d]; // true → серый, false → жёлтый
            const label = fmtDayLabel(d);
            return (
              <Button
                key={d}
                onClick={() => onPick(d)}
                className="w-full"
                variant={has ? 'ghost' : 'primary'}
                disabled={!busyReady}
              >
                {label}
              </Button>
            );
          })}
        </div>

        <div className="flex items-center gap-4 mt-4 text-xs text-white/60">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded bg-brand-500" /> свободно
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded bg-white/10" /> уже заказано
          </span>
        </div>
      </Panel>

      {/* Модалка занятых дат */}
      {modalOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={closeModal} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg bg-neutral-900 rounded-xl shadow-xl border border-white/10 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <div className="text-white font-semibold">Заказ на {modalDate || '—'}</div>
                <button className="text-white/60 hover:text-white" onClick={closeModal}>✕</button>
              </div>

              <div className="p-4 space-y-3">
                {modalLoading && <div className="text-white/70 text-sm">Загрузка состава…</div>}
                {modalError && <div className="text-rose-400 text-sm">Ошибка: {modalError}</div>}

                {!modalLoading && !modalError && (
                  <>
                    {modalSummary?.lines && modalSummary.lines.length > 0 ? (
                      <ul className="list-disc list-inside space-y-1 text-white/90">
                        {modalSummary.lines.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-white/60 text-sm">Не удалось получить состав заказа…</div>
                    )}
                  </>
                )}
              </div>

              <div className="px-4 py-3 border-t border-white/10 flex items-center justify-end gap-2">
                <Button variant="ghost" onClick={closeModal} disabled={modalLoading}>
                  ОК
                </Button>
                <Button variant="ghost" onClick={editOrder} disabled={modalLoading || !modalDate}>
                  Изменить
                </Button>
                <Button variant="danger" onClick={cancelOrder} disabled={modalLoading || !modalSummary?.orderId}>
                  Отменить
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
