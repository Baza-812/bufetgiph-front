'use client';

import { useEffect, useMemo, useState } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Input, { Field } from '@/components/ui/Input';

type HREmployee = {
  id: string;
  name: string;
  email: string;
  status: string;
  role: string;
  hasToken: boolean;
  personalUrl: string | null;
  lastInvite: string | null;
};

type HREmployeesResp = { ok: boolean; count: number; items: HREmployee[] };
type SingleOrderResp = {
  ok: boolean;
  summary: null | { fullName: string; date: string; mealBox: string; extra1: string; extra2: string; orderId: string };
};
type DatesResp = { ok: boolean; dates: string[] };

export default function HRConsolePage() {
  const [org, setOrg] = useState('');
  const [employeeID, setEmployeeID] = useState('');
  const [token, setToken] = useState('');

  const [orgName, setOrgName] = useState<string>('');

  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [rows, setRows] = useState<HREmployee[]>([]);
  const [orderByEmp, setOrderByEmp] = useState<Record<string, SingleOrderResp['summary']>>({});

  const [showCreds, setShowCreds] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const o = q.get('org') || localStorage.getItem('baza.org') || '';
    const e = q.get('employeeID') || localStorage.getItem('baza.employeeID') || '';
    const t = q.get('token') || localStorage.getItem('baza.token') || '';
    setOrg(o); setEmployeeID(e); setToken(t);
  }, []);

  // Имя организации
  useEffect(() => {
    (async () => {
      if (!org) { setOrgName(''); return; }
      try {
        const r = await fetch(`/api/org_info?org=${encodeURIComponent(org)}`);
        const js = await r.json() as { ok:boolean; name?:string };
        setOrgName(js?.ok ? (js.name || '') : '');
      } catch {
        setOrgName('');
      }
    })();
  }, [org]);

  // Даты
  useEffect(() => {
    (async () => {
      if (!org) return;
      try {
        setErr('');
        const r = await fetch(`/api/dates?org=${encodeURIComponent(org)}`);
        const js: DatesResp = await r.json();
        if (!js.ok) throw new Error((js as any).error || 'Ошибка загрузки дат');
        setDates(js.dates || []);
        if (!date && js.dates?.length) setDate(js.dates[0]);
      } catch (e:any) {
        setErr(e.message || String(e));
      }
    })();
  }, [org]);

  // Сотрудники
  async function loadEmployees() {
    if (!org || !employeeID || !token) { setErr('Укажите org, employeeID и token'); return; }
    try {
      setLoading(true); setErr('');
      const u = new URL('/api/hr_employees', window.location.origin);
      u.searchParams.set('org', org);
      u.searchParams.set('employeeID', employeeID);
      u.searchParams.set('token', token);
      const r = await fetch(u.toString());
      const js: HREmployeesResp = await r.json();
      if (!js.ok) throw new Error((js as any).error || 'Ошибка загрузки сотрудников');
      setRows(js.items || []);
      localStorage.setItem('baza.org', org);
      localStorage.setItem('baza.employeeID', employeeID);
      localStorage.setItem('baza.token', token);
    } catch (e:any) {
      setErr(e.message || String(e));
    } finally { setLoading(false); }
  }

  // Статусы заказов (лист)
  useEffect(() => {
    (async () => {
      if (!org || !employeeID || !token || !date) return;
      try {
        setErr('');
        const u = new URL('/api/hr_orders', window.location.origin);
        u.searchParams.set('mode','list');
        u.searchParams.set('employeeID', employeeID);
        u.searchParams.set('org', org);
        u.searchParams.set('token', token);
        u.searchParams.set('date', date);
        const r = await fetch(u.toString());
        const js = await r.json() as { ok: boolean; items: { orderId:string; date:string; fullName:string; mealBox:string; extra1:string; extra2:string, employeeId?:string }[] };
        if (!js.ok) throw new Error((js as any).error || 'Ошибка загрузки заказов');

        const map: Record<string, SingleOrderResp['summary']> = {};
        for (const it of js.items || []) {
          const emp = rows.find(r =>
            (it as any).employeeId ? (r.id === (it as any).employeeId) : (r.name === it.fullName)
          );
          if (emp) {
            map[emp.id] = {
              fullName: it.fullName, date: it.date,
              mealBox: it.mealBox, extra1: it.extra1, extra2: it.extra2, orderId: it.orderId
            };
          }
        }
        setOrderByEmp(map);
      } catch (e:any) {
        setErr(e.message || String(e));
      }
    })();
  }, [org, employeeID, token, date, rows]);

  // Действия
  function openQuizFor(emp: HREmployee) {
    const origin = window.location.origin;

    const back = new URL('/hr/console', origin);
    back.searchParams.set('org', org);
    back.searchParams.set('employeeID', employeeID);
    back.searchParams.set('token', token);
    if (date) back.searchParams.set('date', date);

    const sum = orderByEmp[emp.id];

    const u = new URL('/order/quiz', origin);
    u.searchParams.set('date', date);
    u.searchParams.set('step', '1');
    u.searchParams.set('employeeID', employeeID);
    u.searchParams.set('org', org);
    u.searchParams.set('token', token);
    u.searchParams.set('forEmployeeID', emp.id);
    if (sum?.orderId) u.searchParams.set('orderId', sum.orderId);
    u.searchParams.set('returnTo', back.toString());

    window.location.href = u.toString();
  }

  async function cancelOrder(emp: HREmployee) {
    const s = orderByEmp[emp.id];
    if (!s?.orderId) return;
    if (!confirm(`Отменить заказ сотрудника «${emp.name || '—'}» на ${fmtDayLabel(date)}?`)) return;
    try {
      setLoading(true); setErr('');
      const r = await fetch('/api/order_cancel', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ employeeID, org, token, orderId: s.orderId, reason: 'hr_cancel' })
      });
      const js = await r.json();
      if (!js.ok) throw new Error(js.error || 'Не удалось отменить заказ');
      setOrderByEmp(m => ({ ...m, [emp.id]: null as any }));
    } catch (e:any) {
      setErr(e.message || String(e));
    } finally { setLoading(false); }
  }

  function fmtDayLabel(d: string) {
    if (!d) return '';
    const dt = new Date(`${d}T00:00:00`);
    const s = dt.toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: '2-digit' });
    return s.replace(/^[а-яё]/, ch => ch.toUpperCase());
  }

  const sorted = useMemo(() => [...rows].sort((a,b)=> (a.name||'').localeCompare(b.name||'', 'ru')), [rows]);

  return (
    <main>
      <Panel title="HR-консоль">
        <div className="space-y-3">
          {/* 1-я строка: Организация + ссылка Показать доступы справа */}
          <div className="flex items-end justify-between gap-3">
            <div className="flex-1">
              <Field label="Организация">
                <Input value={orgName || org || '—'} readOnly />
                {!!org && <div className="text-xs text-white/50 mt-1">ID: {org}</div>}
              </Field>
            </div>
            <button
              onClick={()=>setShowCreds(v=>!v)}
              className="text-xs text-white/60 hover:text-white underline mb-2"
            >
              {showCreds ? 'Скрыть доступы' : 'Показать доступы'}
            </button>
          </div>

          {/* 2-я строка: Дата + кнопка — в одной линии слева */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-white/70 text-sm">Дата:</span>
            <select
              value={date}
              onChange={e=>setDate(e.target.value)}
              className="bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-sm"
            >
              {dates.map(d => <option key={d} value={d}>{fmtDayLabel(d)}</option>)}
            </select>

            <Button onClick={loadEmployees} disabled={loading}>
              {loading ? 'Загрузка…' : 'Загрузить сотрудников'}
            </Button>
          </div>

          {/* Скрытые креды — по кнопке */}
          {showCreds && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Ваш Employee ID"><Input value={employeeID} readOnly /></Field>
              <Field label="Token"><Input value={token} readOnly /></Field>
              <div className="text-xs text-white/50 self-end">
                Эти поля берутся из персональной ссылки/LS и не требуются для ручного ввода.
              </div>
            </div>
          )}

          {err && <div className="text-red-400 text-sm">{err}</div>}
        </div>
      </Panel>

      {!!sorted.length && (
        <Panel title={`Сотрудники: ${sorted.length}`}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-white/70">
                  <th className="py-2 pr-4">ФИО</th>
                  <th className="py-2 pr-4">E-mail</th>
                  <th className="py-2 pr-4">Статус</th>
                  <th className="py-2 pr-4">Ссылка</th>
                  <th className="py-2 pr-4">Заказ на {fmtDayLabel(date)}</th>
                  <th className="py-2 pr-0">Действия</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(emp => {
                  const sum = orderByEmp[emp.id];
                  const hasOrder = Boolean(sum);
                  return (
                    <tr key={emp.id} className="border-t border-white/10 align-top">
                      <td className="py-2 pr-4">{emp.name || '—'}</td>
                      <td className="py-2 pr-4">{emp.email || '—'}</td>
                      <td className="py-2 pr-4">{emp.status || '—'}</td>
                      <td className="py-2 pr-4">
                        {emp.hasToken && emp.personalUrl ? (
                          <CopyLink url={emp.personalUrl} />
                        ) : <span className="text-white/50">нет</span>}
                      </td>
                      <td className="py-2 pr-4">
                        {hasOrder ? (
                          <div className="text-white/80">
                            <div><span className="text-white/60">Meal Box:</span> {sum?.mealBox || '—'}</div>
                            <div><span className="text-white/60">Экстра 1:</span> {sum?.extra1 || '—'}</div>
                            <div><span className="text-white/60">Экстра 2:</span> {sum?.extra2 || '—'}</div>
                          </div>
                        ) : <span className="text-white/50">—</span>}
                      </td>
                      <td className="py-2 pr-0">
                        <div className="flex flex-wrap gap-2">
                          {hasOrder ? (
                            <>
                              <Button onClick={()=>openQuizFor(emp)}>Изменить</Button>
                              <Button variant="danger" onClick={()=>cancelOrder(emp)}>Отменить</Button>
                            </>
                          ) : (
                            <Button onClick={()=>openQuizFor(emp)}>Оформить</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </main>
  );
}

function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async ()=>{ await navigator.clipboard.writeText(url); setDone(true); setTimeout(()=>setDone(false), 1000); }}
      className="text-xs inline-flex items-center px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20"
      title={url}
    >
      {done ? 'Скопировано' : 'Копировать'}
    </button>
  );
}
