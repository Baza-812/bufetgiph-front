'use client';

import { useEffect, useMemo, useState } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import { useRouter } from 'next/navigation';

type DatesResp = { ok: boolean; dates: string[] };

type ManagerOrderSummary = {
  orderId: string;
  date: string;
  // для модалки — короткий человекочитаемый состав
  lines: string[]; // например, ["Запеканка творожная × 3", "Салат Цезарь × 2", "Котлета + Пюре × 5"]
};

type GetOrderResp =
  | { ok: true; summary: ManagerOrderSummary | null }
  | { ok: false; error: string };

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin', ...init });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${init?.method || 'GET'} ${url} -> ${res.status} ${text}`);
  }
  return res.json();
}

function fmtDateHuman(iso: string) {
  // YYYY-MM-DD -> ДД.ММ (кратко)
  const [y, m, d] = iso.split('-');
  return `${d}.${m}`;
}

export default function ManagerDatesClient(props: { org: string; employeeID: string; token: string }) {
  const { org, employeeID, token } = props;
  const router = useRouter();

  const [dates, setDates] = useState<string[]>([]);
  const [status, setStatus] = useState<Record<string, 'none' | 'has'>>({});
  const [loading, setLoading] = useState(false);

  // модалка
  const [modal, setModal] = useState<{ open: boolean; date: string | null; summary: ManagerOrderSummary | null }>({
    open: false,
    date: null,
    summary: null,
  });
  const modalOpen = modal.open;

  // 1) Достаем даты (HR окно)
  useEffect(() => {
    if (!org || !employeeID || !token) return;
    setLoading(true);
    fetchJSON<DatesResp>(`/api/dates?org=${encodeURIComponent(org)}&as=hr`)
      .then((d) => setDates(Array.isArray(d.dates) ? d.dates : []))
      .catch(() => setDates([]))
      .finally(() => setLoading(false));
  }, [org, employeeID, token]);

  // 2) Для окраски — проверим по каждой дате, есть ли заказ менеджера
  useEffect(() => {
    let cancelled = false;
    async function probe() {
      if (!org || !employeeID || !token || !dates.length) return;
      const map: Record<string, 'none' | 'has'> = {};
      await Promise.all(
        dates.map(async (d) => {
          try {
            const url = `/api/order_manager?org=${encodeURIComponent(org)}&employeeID=${encodeURIComponent(
              employeeID,
            )}&token=${encodeURIComponent(token)}&date=${encodeURIComponent(d)}`;
            const js = await fetchJSON<GetOrderResp>(url);
            map[d] = js && (js as any).summary && (js as any).summary.orderId ? 'has' : 'none';
          } catch {
            map[d] = 'none';
          }
        }),
      );
      if (!cancelled) setStatus(map);
    }
    probe();
    return () => {
      cancelled = true;
    };
  }, [org, employeeID, token, dates]);

  function colorFor(d: string) {
    return status[d] === 'has' ? 'bg-amber-600 hover:bg-amber-500' : 'bg-neutral-800 hover:bg-neutral-700';
    // как у сотрудников: «жёлтая» — заказ есть; «серая» — нет
  }

  async function onClickDay(d: string) {
    // если уже есть — откроем модалку с составом; иначе — сразу в форму
    if (status[d] === 'has') {
      try {
        const url = `/api/order_manager?org=${encodeURIComponent(org)}&employeeID=${encodeURIComponent(
          employeeID,
        )}&token=${encodeURIComponent(token)}&date=${encodeURIComponent(d)}`;
        const js = await fetchJSON<GetOrderResp>(url);
        const summary = (js as any)?.summary || null;
        setModal({ open: true, date: d, summary });
      } catch {
        setModal({ open: true, date: d, summary: null });
      }
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
    try {
      await fetchJSON(`/api/order_cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: modal.summary.orderId, org, employeeID, token }),
      });
      // обновим статус и закроем модалку
      setStatus((s) => (modal.date ? { ...s, [modal.date]: 'none' } : s));
      closeModal();
    } catch {
      // можно показать тост
    }
  }

  return (
    <main className="p-4 space-y-6">
      <Panel title="Выберите дату">
        <div className="flex flex-wrap gap-3">
          {dates.map((d) => (
            <button
              key={d}
              className={`px-4 py-3 rounded-lg text-white ${colorFor(d)}`}
              onClick={() => onClickDay(d)}
              disabled={loading}
            >
              {fmtDateHuman(d)}
            </button>
          ))}
          {!dates.length && <div className="text-white/60">Нет доступных дат</div>}
        </div>
        <div className="text-xs text-white/50 mt-2">Серые — свободно. Жёлтые — уже есть заказ менеджера.</div>
      </Panel>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl p-4 w-full max-w-xl">
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-semibold">Заказ на {modal.date ? fmtDateHuman(modal.date) : ''}</div>
              <button className="text-white/50 hover:text-white" onClick={closeModal}>
                Закрыть
              </button>
            </div>
            {modal.summary ? (
              <div className="space-y-2 text-white/90">
                {(modal.summary.lines || []).map((t, i) => (
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

