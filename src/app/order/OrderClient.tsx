// src/app/order/OrderClient.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Input, { Field } from '@/components/ui/Input';
import { fetchJSON, fmtDayLabel } from '@/lib/api';
import { useCallback, useEffect, useState } from 'react';


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

type DatesResp = { ok: boolean; dates: string[] };

export default function OrderClient() {
  // креды
  const [org, setOrg] = useState('');
  const [employeeID, setEmployeeID] = useState('');
  const [token, setToken] = useState('');

  // данные страниц
  const [dates, setDates] = useState<string[]>([]);
  const [busy, setBusy] = useState<Record<string, SingleResp>>({});
  const [loadingDates, setLoadingDates] = useState(false);
  const [loadingBusy, setLoadingBusy] = useState(false);
  const [error, setError] = useState('');

  // чтобы не запускать конкурирующие догрузки
  const reloadingRef = useRef(false);

  // init creds из URL/LS
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

  // даты
  useEffect(() => {
    (async () => {
      if (!org) return;
      try {
        setError('');
        setLoadingDates(true);
        const r = await fetchJSON<DatesResp>(
          `/api/dates?org=${encodeURIComponent(org)}&_ts=${Date.now()}`,
          { cache: 'no-store', headers: { 'x-no-cache': '1' } }
        );
        setDates(r.dates || []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoadingDates(false);
      }
    })();
  }, [org]);

  // подгрузка статусов на все даты
  const reloadBusy = useCallback(async () => {
  if (!employeeID || !org || !token || dates.length === 0) return;

  const out: Record<string, { ok: boolean; summary: unknown | null }> = {};
  for (const d of dates) {
    try {
      const u = new URL('/api/hr_orders', window.location.origin);
      u.searchParams.set('mode','single');
      u.searchParams.set('employeeID', employeeID);
      u.searchParams.set('org', org);
      u.searchParams.set('token', token);
      u.searchParams.set('date', d);
      const r = await fetchJSON<{ ok: boolean; summary: unknown }>(u.toString());
      out[d] = r;
    } catch {
      out[d] = { ok: false, summary: null };
    }
  }
      setBusy(out);
}, [employeeID, org, token, dates]);
    }
  }

  // первичная загрузка busy
  useEffect(() => {
  reloadBusy();
}, [reloadBusy]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates, employeeID, org, token]);

  // автообновление при возвращении на вкладку
  useEffect(() => {
    const onFocus = () => reloadBusy();
    const onVis = () => document.visibilityState === 'visible' && reloadBusy();
    const onShow = () => reloadBusy();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', onShow);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pageshow', onShow);
    };
  }, [dates, employeeID, org, token]);

  // мгновенный «пинок» после квиза через sessionStorage (см. патч в quiz ниже)
  useEffect(() => {
    const raw = sessionStorage.getItem('baza.justOrdered');
    if (!raw) return;
    sessionStorage.removeItem('baza.justOrdered');
    // быстрый рефреш + короткий поллинг (6 раз по 5 сек)
    reloadBusy();
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      reloadBusy();
      if (n >= 6) clearInterval(id);
    }, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onPickDate(d: string) {
    const has = Boolean(busy[d]?.summary);
    if (has) {
      // занятая — покажем состав и варианты (минимальная модалка)
      openBusyModal(d);
    } else {
      // свободная — сразу в квиз
      const u = new URL('/order/quiz', window.location.origin);
      u.searchParams.set('date', d);
      u.searchParams.set('step', '1');
      const sp = new URLSearchParams(window.location.search);
      for (const k of ['org','employeeID','token'] as const) {
        const v = sp.get(k) || (k==='org'?org:k==='employeeID'?employeeID:token);
        if (v) u.searchParams.set(k, v);
      }
      window.location.href = u.toString();
    }
  }

  // ——— компактная модалка для занятого дня
  const [busyIso, setBusyIso] = useState<string|null>(null);
  const busySummary = useMemo(()=> busyIso ? busy[busyIso]?.summary : null, [busy, busyIso]);

  function openBusyModal(d:string){ setBusyIso(d); }
  function closeBusyModal(){ setBusyIso(null); }

  async function cancelOrder() {
    const s = busySummary;
    if (!s?.orderId) return;
    try {
      await fetchJSON('/api/order_cancel', {
        method: 'POST',
        body: JSON.stringify({ employeeID, org, token, orderId: s.orderId, reason: 'user_cancel' }),
        headers: { 'Content-Type': 'application/json' },
      });
      closeBusyModal();
      await reloadBusy();
      alert('Заказ отменён.');
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  function editOrder() {
    if (!busyIso) return;
    const u = new URL('/order/quiz', window.location.origin);
    u.searchParams.set('date', busyIso);
    u.searchParams.set('step', '1');
    const sp = new URLSearchParams(window.location.search);
    for (const k of ['org','employeeID','token'] as const) {
      const v = sp.get(k) || (k==='org'?org:k==='employeeID'?employeeID:token);
      if (v) u.searchParams.set(k, v);
    }
    window.location.href = u.toString();
  }

  return (
    <main>
      <Panel title="Добро пожаловать!">
        <p className="text-white/80">Здесь вы можете выбрать обед на подходящий день. Нажмите на дату ниже.</p>
      </Panel>

      {(!org || !employeeID || !token) && (
        <Panel title="Данные доступа">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Org"><Input value={org} onChange={e=>setOrg(e.target.value)} placeholder="org120" /></Field>
            <Field label="Employee ID"><Input value={employeeID} onChange={e=>setEmployeeID(e.target.value)} placeholder="rec..." /></Field>
            <Field label="Token"><Input value={token} onChange={e=>setToken(e.target.value)} placeholder="token" /></Field>
          </div>
          <div className="text-xs text-white/50 mt-2">Обычно эти поля подставляются автоматически из персональной ссылки.</div>
        </Panel>
      )}

      <Panel title="Выберите дату">
        {(loadingDates || loadingBusy) && <div className="text-white/60 text-sm">Загрузка…</div>}
        {error && <div className="text-red-400 text-sm">Ошибка: {error}</div>}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {dates.map(d => {
            const has = Boolean(busy[d]?.summary);
            const label = fmtDayLabel(d);
            return (
              <Button
                key={d}
                onClick={()=>onPickDate(d)}
                className="w-full"
                variant={has ? 'ghost' : 'primary'}
                title={has ? 'Заказ уже оформлен' : 'Свободно'}
              >
                {label}
              </Button>
            );
          })}
        </div>

        {/* легенда — с маленьким жёлтым квадратиком */}
        <div className="flex items-center gap-4 mt-4 text-xs text-white/60">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded bg-brand-500" /> свободно
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded bg-white/10" /> уже заказано
          </span>
        </div>
      </Panel>

      {/* Модалка — только для занятых дат */}
      {busyIso && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-2 sm:p-6">
          <div className="w-full sm:max-w-lg bg-panel border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-bold">{fmtDayLabel(busyIso)}</div>
              <button onClick={closeBusyModal} className="text-white/60 hover:text-white text-sm">Закрыть</button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="text-white/80">Заказ уже оформлен на эту дату.</div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                <div><span className="text-white/60">Сотрудник:</span> {busySummary?.fullName || '—'}</div>
                <div><span className="text-white/60">Meal Box:</span> {busySummary?.mealBox || '—'}</div>
                <div><span className="text-white/60">Экстра 1:</span> {busySummary?.extra1 || '—'}</div>
                <div><span className="text-white/60">Экстра 2:</span> {busySummary?.extra2 || '—'}</div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button onClick={closeBusyModal}>ОК</Button>
                <Button onClick={editOrder} variant="ghost">Изменить</Button>
                <Button onClick={cancelOrder} variant="danger">Отменить</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
