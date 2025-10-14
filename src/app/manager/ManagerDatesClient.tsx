'use client';

import { useEffect, useState, useCallback } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import { useSearchParams, useRouter } from 'next/navigation';

type Summary = { orderId?: string; status?: string; date?: string; lines?: string[] };
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

  // для явного контроля — что вернул summary по каждой дате
  const [summaryByDate, setSummaryByDate] = useState<Record<string, Summary | null>>({});

  // модалка
  const [modalOpen, setModalOpen] = useState(false);
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalSummary, setModalSummary] = useState<Summary | null>(null);

  // health — чтобы видеть, в какое API попали
  const [health, setHealth] = useState<any>(null);
  useEffect(() => {
    (async () => {
      try {
        const h = await fetchJSON('/api/health');
        setHealth(h);
      } catch {
        setHealth(null);
      }
    })();
  }, []);

  // 1) тянем окно дат (as=hr, чтобы включать «сегодня» до HR cutoff)
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

  // 2) «серость» считаем строго по /api/order_summary
  const reloadBusy = useCallback(async () => {
    if (!employeeID || !org || !token || dates.length === 0) return;
    setBusyReady(false);
    try {
      const map: Record<string, boolean> = {};
      const sbd: Record<string, Summary | null> = {};

      await Promise.all(
        dates.map(async (d) => {
          try {
            const u = `/api/order_summary?org=${encodeURIComponent(org)}&employeeID=${encodeURIComponent(
              employeeID,
            )}&date=${encodeURIComponent(d)}`;
            const s = await fetchJSON<SummaryResp>(u);
            const sum = s?.summary || null;
            sbd[d] = sum;
            const st = String(sum?.status || '').toLowerCase();
            const cancelled = st === 'cancelled' || st === 'canceled';
            map[d] = Boolean(sum?.orderId) && !cancelled;
          } catch {
            map[d] = false;
            sbd[d] = null;
          }
        }),
      );
      setSummaryByDate(sbd);
      setBusy(map);
    } finally {
      setBusyReady(true);
    }
  }, [dates, employeeID, org, token]);

  useEffect(() => { reloadBusy(); }, [reloadBusy]);

  // при возврате на вкладку — обновить (после оформления/отмены)
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

  // открыть модалку состав/действия
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
        body: JSON.stringify({ orderId: modalSummary.orderId, org, employeeID, token }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.ok) throw new Error(j?.error || 'Ошибка отмены');

      if (modalDate) setBusy((m) => ({ ...m, [modalDate]: false })); // «разжёлтим»
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
    if (busy[d]) openModalFor(d);
    else toOrderPage(d);
  }

  const missingParams = !org || !employeeID || !token;

  return (
    <main>
      <Panel title="Заказ менеджера: выберите дату">
        {missingParams && (
          <div className="mb-3 text-amber-400 text-sm">
            Не хватает параметров в URL: <b>{!org && 'org '}{!employeeID && 'employeeID '}{!token && 'token'}</b>.
            Открой ссылку вида: <code className="bg-black/20 px-1 rounded">/manager?org=...&employeeID=...&token=...</code>
          </div>
        )}

        {loading && <div className="text-white/60 text-sm">Загрузка дат…</div>}
        {err && <div className="text-red-400 text-sm">Ошибка: {err}</div>}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {dates.map((d) => {
            const has = !!busy[d]; // true → серый, false → жёлтый
            const label = fmtDayLabel(d);
            const sum = summaryByDate[d];
            const st = String(sum?.status || '').toLowerCase();

            const cls = has
              ? 'w-full rounded-lg px-3 py-2 bg-neutral-700 text-white'
              : 'w-full rounded-lg px-3 py-2 bg-yellow-500 text-black hover:bg-yellow-400';

            return (
              <div key={d} className="space-y-1">
                <button onClick={() => onPick(d)} className={cls} disabled={!busyReady || missingParams}>
                  {label}
                </button>
                {/* маленький тег-подсказка по тому, что пришло из summary */}
                <div className="text-[10px] text-white/50">
                  {sum?.orderId ? (
                    <span>status: <b>{st || '—'}</b>, id: {sum.orderId.slice(0, 6)}…</span>
                  ) : (
                    <span>нет заказа</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 mt-4 text-xs text-white/60">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded bg-yellow-500" /> свободно
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded bg-white/10" /> уже заказано
          </span>
        </div>

        <div className="mt-4 text-xs text-white/40">
          API health: {health ? JSON.stringify(health) : 'нет ответа'}
        </div>
      </Panel>

      {/* Модалка */}
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
                        {modalSummary.lines.map((line, i) => <li key={i}>{line}</li>)}
                      </ul>
                    ) : (
                      <div className="text-white/60 text-sm">Не удалось получить состав заказа…</div>
                    )}
                  </>
                )}
              </div>

              <div className="px-4 py-3 border-t border-white/10 flex items-center justify-end gap-2">
                <Button variant="ghost" onClick={closeModal} disabled={modalLoading}>ОК</Button>
                <Button variant="ghost" onClick={editOrder} disabled={modalLoading || !modalDate}>Изменить</Button>
                <Button variant="danger" onClick={cancelOrder} disabled={modalLoading || !modalSummary?.orderId}>Отменить</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
