// src/app/order/OrderClient.tsx
'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Input, { Field } from '@/components/ui/Input';
import { fetchJSON, fmtDayLabel } from '@/lib/api';

type SingleResp = {
  ok: boolean;
  summary: null | {
    fullName: string;
    date: string;
    mealBox: string;
    extra1: string;
    extra2: string;
    orderId: string;
  };
};

export default function OrderClient() {
  const router = useRouter();

  // креды
  const [org, setOrg] = useState('');
  const [employeeID, setEmployeeID] = useState('');
  const [token, setToken] = useState('');

  // данные
  const [dates, setDates] = useState<string[]>([]);
  const [busy, setBusy] = useState<Record<string, SingleResp>>({});
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null); // для модалки
  const [error, setError] = useState('');

  // 1) забираем креды из query/localStorage (один раз)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const o = q.get('org') || localStorage.getItem('baza.org') || '';
    const e = q.get('employeeID') || localStorage.getItem('baza.employeeID') || '';
    const t = q.get('token') || localStorage.getItem('baza.token') || '';
    setOrg(o); setEmployeeID(e); setToken(t);
    if (o && e && t) {
      localStorage.setItem('baza.org', o);
      localStorage.setItem('baza.employeeID', e);
      localStorage.setItem('baza.token', t);
    }
  }, []);

  // 2) опубликованные даты
  useEffect(() => {
    (async () => {
      if (!org) return;
      try {
        setLoading(true); setError('');
        const r = await fetchJSON<{ ok: boolean; dates: string[] }>(`/api/dates?org=${encodeURIComponent(org)}`);
        setDates(r.dates || []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [org]);

  // Функция перезагрузки «занятости» одним запросом /api/busy
  const reloadBusy = useCallback(async () => {
    if (!employeeID || !org || !token || dates.length === 0) return;
    try {
      const qs = new URLSearchParams({
        employeeID, org, token,
        dates: dates.join(','),
      });
      const r = await fetchJSON<{ ok: boolean; busy: Record<string, boolean> }>(`/api/busy?${qs.toString()}`);
      const map: Record<string, SingleResp> = {};
      for (const d of dates) {
        // помечаем «занято» минимальной заглушкой summary (orderId: '__has__')
        map[d] = r.busy[d]
          ? { ok: true, summary: { orderId: '__has__', fullName: '', date: d, mealBox: '', extra1: '', extra2: '' } as any }
          : { ok: true, summary: null };
      }
      setBusy(map);
    } catch {
      const map: Record<string, SingleResp> = {};
      for (const d of dates) map[d] = { ok: false, summary: null };
      setBusy(map);
    }
  }, [dates, employeeID, org, token]);

  // первичная загрузка busy
  useEffect(() => { reloadBusy(); }, [reloadBusy]);

  // обновлять при возвращении на вкладку (после квиза)
  useEffect(() => {
    const onFocus = () => { reloadBusy(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reloadBusy]);

  const name = useMemo(() => busy[selected || '']?.summary?.fullName || '', [busy, selected]);

  // 4) клик по дате: теперь опираемся на локальный busy
  async function handlePickDate(d: string) {
    const isBusy = Boolean(busy[d]?.summary);
    if (!isBusy) {
      // свободно — сразу в квиз
      const q = new URL('/order/quiz', window.location.origin);
      q.searchParams.set('date', d);
      q.searchParams.set('step', '1');
      q.searchParams.set('org', org);
      q.searchParams.set('employeeID', employeeID);
      q.searchParams.set('token', token);
      router.push(q.toString());
      return;
    }
    // занято — открываем модалку (детали подгрузим внутри модалки)
    setSelected(d);
  }

  return (
    <main>
      <Panel title="Добро пожаловать!">
        <p className="text-white/80">
          Здесь вы можете выбрать обед на подходящий день. Нажмите на дату ниже.
        </p>
      </Panel>

      {/* креды вручную — на случай, если пришли без query */}
      {(!org || !employeeID || !token) && (
        <Panel title="Данные доступа">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Org">
              <Input value={org} onChange={e=>setOrg(e.target.value)} placeholder="org120" />
            </Field>
            <Field label="Employee ID">
              <Input value={employeeID} onChange={e=>setEmployeeID(e.target.value)} placeholder="rec..." />
            </Field>
            <Field label="Token">
              <Input value={token} onChange={e=>setToken(e.target.value)} placeholder="token" />
            </Field>
          </div>
          <div className="text-xs text-white/50">Обычно эти поля подставляются автоматически из персональной ссылки.</div>
        </Panel>
      )}

      <Panel title="Выберите дату">
        {loading && <div className="text-white/60 text-sm">Загрузка дат…</div>}
        {error && <div className="text-red-400 text-sm">Ошибка: {error}</div>}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {dates.map(d => {
            const has = Boolean(busy[d]?.summary); // СЕРОЕ если заказ уже есть
            const label = fmtDayLabel(d);
            return (
              <Button
                key={d}
                onClick={() => handlePickDate(d)}
                className="w-full"
                variant={has ? 'ghost' : 'primary'}
              >
                {label}
              </Button>
            );
          })}
        </div>

        {/* Легенда */}
        <div className="flex items-center gap-4 mt-4 text-xs text-white/60">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded bg-brand-500" /> свободно
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded bg-white/10" /> уже заказано
          </span>
        </div>
      </Panel>

      {/* Модалка со составом — показываем только когда заказ есть */}
      {selected && (
        <DateModal
          iso={selected}
          employeeID={employeeID}
          org={org}
          token={token}
          info={busy[selected]}
          onClose={() => setSelected(null)}
          onChanged={reloadBusy}
        />
      )}
    </main>
  );
}

/* ——— Модалка: состав + действия — дозагружаем summary при необходимости ——— */
function DateModal({
  iso, employeeID, org, token, info, onClose, onChanged,
}: {
  iso: string;
  employeeID: string; org: string; token: string;
  info?: SingleResp; onClose: ()=>void; onChanged: ()=>void;
}) {
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState('');
  const [sum, setSum] = useState<SingleResp['summary'] | null>(info?.summary || null);

  // если пришла «заглушка» (orderId='__has__') или нет деталей — дозагружаем
  useEffect(() => {
    let ignore = false;
    (async () => {
      const needFetch = !info?.summary || info.summary.orderId === '__has__';
      if (!needFetch) { setSum(info!.summary); return; }
      try {
        const u = new URL('/api/hr_orders', window.location.origin);
        u.searchParams.set('mode','single');
        u.searchParams.set('employeeID', employeeID);
        u.searchParams.set('org', org);
        u.searchParams.set('token', token);
        u.searchParams.set('date', iso);
        const r = await fetchJSON<SingleResp>(u.toString());
        if (!ignore) setSum(r?.summary || null);
      } catch (e) {
        if (!ignore) setSum(null);
      }
    })();
    return () => { ignore = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso, employeeID, org, token]);

  async function cancelOrder() {
    if (!sum?.orderId) return;
    try {
      setWorking(true); setErr('');
      await fetchJSON('/api/order_cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeID, org, token, orderId: sum.orderId, reason: 'user_cancel' })
      });
      onClose();
      onChanged(); // обновим «серость»
      alert('Заказ отменён.');
    } catch(e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setWorking(false); }
  }

  if (!sum?.orderId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-2 sm:p-6">
      <div className="w-full sm:max-w-lg bg-panel border border-white/10 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-lg font-bold">{fmtDayLabel(iso)}</div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-sm">Закрыть</button>
        </div>

        <div className="space-y-2 text-sm">
          <div className="text-white/80">Заказ уже оформлен на эту дату.</div>
          <div className="rounded-xl bg-white/5 border border-white/10 p-3">
            <div><span className="text-white/60">Сотрудник:</span> {sum?.fullName || '—'}</div>
            <div><span className="text-white/60">Meal Box:</span> {sum?.mealBox || '—'}</div>
            <div><span className="text-white/60">Экстра 1:</span> {sum?.extra1 || '—'}</div>
            <div><span className="text-white/60">Экстра 2:</span> {sum?.extra2 || '—'}</div>
          </div>
          {err && <div className="text-red-400">{err}</div>}
          <div className="flex gap-3 pt-2">
            <Button onClick={onClose}>ОК</Button>
            <Button
              variant="ghost"
              onClick={() => {
                const u = new URL('/order/quiz', window.location.origin);
                u.searchParams.set('date', iso);
                u.searchParams.set('step', '1');
                u.searchParams.set('org', org);
                u.searchParams.set('employeeID', employeeID);
                u.searchParams.set('token', token);
                if (sum?.orderId) u.searchParams.set('orderId', sum.orderId); // правка существующего
                window.location.href = u.toString();
              }}
            >
              Изменить
            </Button>
            <Button onClick={cancelOrder} variant="danger" disabled={working}>
              {working ? 'Отмена…' : 'Отменить'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
