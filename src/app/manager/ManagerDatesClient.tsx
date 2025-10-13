'use client';

import { useEffect, useState } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import { useRouter } from 'next/navigation';

type DatesResp = { ok: boolean; dates: string[] };
type ManagerOrderSummary = { orderId: string; date: string; lines: string[] };

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
  const [y, m, d] = iso.split('-');
  return `${d}.${m}`;
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

  // префилл
useEffect(() => {
  if (!org || !employeeID || !token || !date) return;
  (async () => {
    try {
      const url = `/api/order_manager?org=${encodeURIComponent(org)}&employeeID=${encodeURIComponent(
        employeeID,
      )}&token=${encodeURIComponent(token)}&date=${encodeURIComponent(date)}`;
      const js = await fetchJSON<PrefillResp>(url);
      const s = js?.summary || null;
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


  function colorFor(d: string) {
    return status[d] === 'has' ? 'bg-amber-600 hover:bg-amber-500' : 'bg-neutral-800 hover:bg-neutral-700';
  }

  async function onClickDay(d: string) {
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
    await fetchJSON(`/api/order_cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
            <button
              key={d}
              className={`px-4 py-3 rounded-lg text-white ${colorFor(d)}`}
              onClick={() => onClickDay(d)}
            >
              {fmtDateHuman(d)}
            </button>
          ))}
          {!dates.length && <div className="text-white/60">Нет доступных дат</div>}
        </div>
        <div className="text-xs text-white/50 mt-2">Серые — свободно. Жёлтые — заказ уже есть.</div>
      </Panel>

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-neutral-900 border border-white/10 rounded-2xl p-4 w-full max-w-xl">
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-semibold">
                Заказ на {modal.date ? modal.date : ''}
              </div>
              <button className="text-white/50 hover:text-white" onClick={closeModal}>Закрыть</button>
            </div>
            {modal.summary ? (
              <div className="space-y-2 text-white/90">
                {(modal.summary.lines || []).map((t, i) => <div key={i}>• {t}</div>)}
              </div>
            ) : (
              <div className="text-white/70">Не удалось получить состав заказа.</div>
            )}
            <div className="flex gap-2 pt-4">
              <Button onClick={closeModal}>ОК</Button>
              <Button variant="ghost" onClick={onEdit}>Изменить</Button>
              <Button variant="danger" onClick={onCancel} disabled={!modal.summary?.orderId}>Отменить</Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
