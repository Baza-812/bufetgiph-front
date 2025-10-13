'use client';

import { useEffect, useState } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import { useRouter } from 'next/navigation';

type DatesResp = { ok: boolean; dates: string[] };
type ManagerOrderSummary = { orderId?: string; id?: string; date?: string; lines?: string[] };

type GetOrderResp =
  | { ok: true; summary: ManagerOrderSummary | null }
  | { ok: false; error: string };

// универсальная загрузка состава заказа менеджера (GET /order_manager -> fallback /order_summary)
async function getManagerSummary(org: string, employeeID: string, token: string, date: string) {
  // 1) пробуем /order_manager
  const url1 = `/api/order_manager?org=${encodeURIComponent(org)}&employeeID=${encodeURIComponent(
    employeeID,
  )}&token=${encodeURIComponent(token)}&date=${encodeURIComponent(date)}`;
  try {
    const r1 = await fetch(url1, { cache: 'no-store', credentials: 'same-origin' });
    const j1 = await r1.json().catch(() => ({}));
    if (r1.ok && j1?.summary) return j1.summary as ManagerOrderSummary;
    if (j1?.error !== 'POST only' && r1.status !== 405 && r1.status !== 404) {
      return null;
    }
  } catch {
    /* fallthrough */
  }

  // 2) fallback: /order_summary
  const url2 = `/api/order_summary?org=${encodeURIComponent(org)}&employeeID=${encodeURIComponent(
    employeeID,
  )}&token=${encodeURIComponent(token)}&date=${encodeURIComponent(date)}&mode=single`;
  try {
    const r2 = await fetch(url2, { cache: 'no-store', credentials: 'same-origin' });
    if (!r2.ok) return null;
    const j2 = await r2.json().catch(() => ({}));
    // попробуем нормализовать к единому виду
    if (j2?.summary) return j2.summary as ManagerOrderSummary;
    if (j2?.order) {
      return {
        orderId: j2.order.id || j2.order.orderId,
        lines: j2.lines || [],
        date,
      } as ManagerOrderSummary;
    }
  } catch {
    /* no-op */
  }
  return null;
}

function fmtBtnLabel(iso: string) {
  // например: "Вт, 14.10"
  const d = new Date(iso + 'T00:00:00');
  const wd = d.toLocaleDateString('ru-RU', { weekday: 'short' }); // вт, ср, чт...
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const cap = wd ? wd[0].toUpperCase() + wd.slice(1) : '';
  return `${cap}, ${dd}.${mm}`;
}

export default function ManagerDatesClient(props: { org: string; employeeID: string; token: string }) {
  const { org, employeeID, token } = props;
  const router = useRouter();

  const [dates, setDates] = useState<string[]>([]);
  const [status, setStatus] = useState<Record<string, 'none' | 'has'>>({});
  const [modal, setModal] = useState<{ open: boolean; date: string | null; summary: ManagerOrderSummary | null }>({
    open: false,
    date: null,
    summary: null,
  });

  // 1) доступные даты (HR окно)
  useEffect(() => {
    if (!org || !employeeID || !token) return;
    (async () => {
      try {
        const d = await fetch(`/api/dates?org=${encodeURIComponent(org)}&as=hr`, {
          cache: 'no-store',
          credentials: 'same-origin',
        }).then((r) => r.json() as Promise<DatesResp>);
        setDates(Array.isArray(d.dates) ? d.dates : []);
      } catch {
        setDates([]);
      }
    })();
  }, [org, employeeID, token]);

  // 2) статус по датам — есть ли уже заказ менеджера
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!org || !employeeID || !token || !dates.length) return;
      const map: Record<string, 'none' | 'has'> = {};
      await Promise.all(
        dates.map(async (d) => {
          const s = await getManagerSummary(org, employeeID, token, d);
          map[d] = s && (s.orderId || s.id) ? 'has' : 'none';
        }),
      );
      if (!cancelled) setStatus(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [org, employeeID, token, dates]);

  // цвета: свободно -> ЖЁЛТАЯ; уже заказано -> СЕРАЯ
  function classesFor(d: string) {
    const base = 'px-5 py-3 rounded-full font-semibold transition-colors';
    return status[d] === 'has'
      ? `${base} bg-neutral-700 text-white hover:bg-neutral-600`
      : `${base} bg-amber-500 text-black hover:bg-amber-400`;
  }

  async function onClickDay(d: string) {
    if (status[d] === 'has') {
      const summary = await getManagerSummary(org, employeeID, token, d);
      setModal({ open: true, date: d, summary: summary || null });
    } else {
      const u = new URL('/manager/order', window.location.origin);
      u.searchParams.set('org', org);
      u.searchParams.set('employeeID', employeeID);
      u.searchParams.set('token', token);
      u.searchParams.set('date', d);
      router.push(u.toString());
    }
  }

  function closeModal() {
    setModal((m) => ({ ...m, open: false }));
  }

  function onEdit() {
    if (!modal.date) return;
    const u = new URL('/manager/order', window.location.origin);
    u.searchParams.set('org', org);
    u.searchParams.set('employeeID', employeeID);
    u.searchParams.set('token', token);
    u.searchParams.set('date', modal.date);
    router.push(u.toString());
  }

  async function onCancel() {
    if (!modal.summary?.orderId) return;
    await fetch('/api/order_cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ orderId: modal.summary.orderId, org, employeeID, token }),
    }).catch(() => {});
    if (modal.date) setStatus((s) => ({ ...s, [modal.date!]: 'none' }));
    closeModal();
  }

  return (
    <main className="p-4 space-y-6">
      <Panel title="Выберите дату">
        <div className="flex flex-wrap gap-3">
          {dates.map((d) => (
            <button key={d} className={classesFor(d)} onClick={() => onClickDay(d)}>
              {fmtBtnLabel(d)}
            </button>
          ))}
          {!dates.length && <div className="text-white/60">Нет доступных дат</div>}
        </div>
        <div className="text-xs text-white/50 mt-3 flex gap-6 items-center">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-4 h-2 rounded-full bg-amber-500" /> свободно
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-4 h-2 rounded-full bg-neutral-600" /> уже заказано
          </span>
        </div>
      </Panel>

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl p-4 w-full max-w-xl">
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-semibold">Состав заказа — {modal.date}</div>
              <button className="text-white/50 hover:text-white" onClick={closeModal}>
                Закрыть
              </button>
            </div>
            {modal.summary?.lines?.length ? (
              <div className="space-y-2 text-white/90">
                {modal.summary.lines.map((t, i) => (
                  <div key={i}>• {t}</div>
                ))}
              </div>
            ) : (
              <div className="text-white/70">Не удалось получить состав заказа.</div>
            )}
            <div className="flex gap-2 pt-4">
              <Button onClick={closeModal}>ОК</Button>
              <Button variant="ghost" onClick={onEdit}>
                Изменить
              </Button>
              <Button variant="danger" onClick={onCancel} disabled={!modal.summary?.orderId}>
                Отменить
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
