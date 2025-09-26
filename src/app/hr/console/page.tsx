// src/app/hr/console/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Input, { Field } from '@/components/ui/Input';
import { fetchJSON } from '@/lib/api';

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

type SingleSummary =
  | {
      fullName: string;
      date: string;
      mealBox: string;
      extra1: string;
      extra2: string;
      orderId: string;
    }
  | null;

type DatesResp = { ok: boolean; dates: string[] };

type HRListItem = {
  employeeId: string;
  fullName: string;
  date: string;
  orderId: string;
  mealBox: string;
  extra1: string;
  extra2: string;
};

type HRListResp = { ok: boolean; items: HRListItem[] };

export default function HRConsolePage() {
  // креды HR
  const [org, setOrg] = useState('');
  const [orgName, setOrgName] = useState<string>('');
  const [employeeID, setEmployeeID] = useState('');
  const [token, setToken] = useState('');

  // данные страницы
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // сотрудники и заказы на выбранную дату
  const [rows, setRows] = useState<HREmployee[]>([]);
  const [orderByEmp, setOrderByEmp] = useState<Record<string, SingleSummary>>({});

  // начальная подстановка из URL/localStorage
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const o = q.get('org') || localStorage.getItem('baza.org') || '';
    const e = q.get('employeeID') || localStorage.getItem('baza.employeeID') || '';
    const t = q.get('token') || localStorage.getItem('baza.token') || '';
    setOrg(o);
    setEmployeeID(e);
    setToken(t);
  }, []);

  // подгружаем название организации (с фолбэком на org)
  useEffect(() => {
    if (!org) {
      setOrgName('');
      return;
    }
    (async () => {
      try {
        const u = new URL('/api/org_info', window.location.origin);
        u.searchParams.set('org', org);
        const js = await fetchJSON<{ ok?: boolean; name?: string; title?: string; displayName?: string }>(
          u.toString(),
        );
        setOrgName(js?.name || js?.title || js?.displayName || org);
      } catch {
        setOrgName(org);
      }
    })();
  }, [org]);

  // загрузка дат (после установки org)
  useEffect(() => {
    (async () => {
      if (!org) return;
      try {
        setErr('');
        const js = await fetchJSON<DatesResp>(`/api/dates?org=${encodeURIComponent(org)}`);
        if (!js.ok) throw new Error((js as unknown as { error?: string }).error || 'Ошибка загрузки дат');
        setDates(js.dates || []);
        if (!date && js.dates?.length) setDate(js.dates[0]);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setErr(msg);
      }
    })();
  }, [org, date]);

  // загрузка сотрудников (кнопкой)
  async function loadEmployees() {
    if (!org || !employeeID || !token) {
      setErr('Укажите org, employeeID и token');
      return;
    }
    try {
      setLoading(true);
      setErr('');
      const u = new URL('/api/hr_employees', window.location.origin);
      u.searchParams.set('org', org);
      u.searchParams.set('employeeID', employeeID);
      u.searchParams.set('token', token);
      const js = await fetchJSON<HREmployeesResp>(u.toString());
      if (!js.ok) throw new Error((js as unknown as { error?: string }).error || 'Ошибка загрузки сотрудников');
      setRows(js.items || []);
      // сохраним доступы
      localStorage.setItem('baza.org', org);
      localStorage.setItem('baza.employeeID', employeeID);
      localStorage.setItem('baza.token', token);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  // загрузка статуса заказов по выбранной дате (одним запросом list)
  useEffect(() => {
    (async () => {
      if (!org || !employeeID || !token || !date || rows.length === 0) return;
      try {
        setErr('');
        const u = new URL('/api/hr_orders', window.location.origin);
        u.searchParams.set('mode', 'list');
        u.searchParams.set('employeeID', employeeID);
        u.searchParams.set('org', org);
        u.searchParams.set('token', token);
        u.searchParams.set('date', date);
        const js = await fetchJSON<HRListResp>(u.toString());
        if (!js.ok) throw new Error((js as unknown as { error?: string }).error || 'Ошибка загрузки заказов');
        const map: Record<string, SingleSummary> = {};
        // маппим по имени; если имена не уникальны — лучше перейти на batched / single по id
        for (const it of js.items || []) {
          const emp = rows.find((r) => r.name === it.fullName);
          if (emp) {
            map[emp.id] = {
              fullName: it.fullName,
              date: it.date,
              mealBox: it.mealBox,
              extra1: it.extra1,
              extra2: it.extra2,
              orderId: it.orderId,
            };
          }
        }
        setOrderByEmp(map);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setErr(msg);
      }
    })();
  }, [org, employeeID, token, date, rows]);

  // действия HR
  function openQuizFor(emp: HREmployee) {
    const u = new URL('/order/quiz', window.location.origin);
    u.searchParams.set('date', date);
    u.searchParams.set('step', '1');

    // HR-креды (именно HR-id/token, потому что он действует "за сотрудника")
    u.searchParams.set('employeeID', employeeID);
    u.searchParams.set('org', org);
    u.searchParams.set('token', token);

    // таргет-сотрудник
    u.searchParams.set('forEmployeeID', emp.id);

    // если у сотрудника на выбранную дату уже есть заказ — добавляем orderId
    const sum = orderByEmp[emp.id];
    if (sum?.orderId) {
      u.searchParams.set('orderId', sum.orderId);
    }

    // чтобы после подтверждения вернуться в консоль
    u.searchParams.set('back', '/hr/console');

    window.location.href = u.toString();
  }

  async function cancelOrder(emp: HREmployee) {
    const s = orderByEmp[emp.id];
    if (!s?.orderId) return;
    if (!confirm(`Отменить заказ сотрудника «${emp.name}» на ${fmtDayLabel(date)}?`)) return;
    try {
      setLoading(true);
      setErr('');
      const js = await fetchJSON<{ ok: boolean; error?: string }>('/api/order_cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeID, org, token, orderId: s.orderId, reason: 'hr_cancel' }),
      });
      if (!js.ok) throw new Error(js.error || 'Не удалось отменить заказ');
      // локально очистим состояние
      setOrderByEmp((m) => ({ ...m, [emp.id]: null }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  function fmtDayLabel(d: string) {
    if (!d) return '';
    const dt = new Date(`${d}T00:00:00`);
    const s = dt.toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: '2-digit' });
    return s.replace(/^[а-яё]/, (ch) => ch.toUpperCase());
  }

  const sorted = useMemo(() => [...rows].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru')), [rows]);

  return (
    <main>
      <Panel title="HR-консоль">
        {/* Организация — название + ID */}
        <div className="flex flex-col gap-1 mb-3">
          <div className="text-sm text-white/60">ОРГАНИЗАЦИЯ</div>
          <div className="text-lg font-semibold">{orgName || '—'}</div>
          <div className="text-xs text-white/40">ID: {org || '—'}</div>
        </div>

        {/* Доступы HR (пока оставляем видимыми — пригодится для отладки) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Ваш Employee ID">
            <Input value={employeeID} onChange={(e) => setEmployeeID(e.target.value)} placeholder="rec..." />
          </Field>
          <Field label="Token">
            <Input value={token} onChange={(e) => setToken(e.target.value)} placeholder="token" />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={loadEmployees} disabled={loading}>
            {loading ? 'Загрузка…' : 'Загрузить сотрудников'}
          </Button>

          {/* выбор даты */}
          <div className="flex items-center gap-2">
            <span className="text-white/70 text-sm">Дата:</span>
            <select
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-10 rounded-lg px-3 bg-neutral-800 text-white border border-white/10"
            >
              {dates.map((d) => (
                <option key={d} value={d} className="bg-neutral-800 text-white">
                  {fmtDayLabel(d)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {err && <div className="text-red-400 text-sm mt-2">{err}</div>}
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
                {sorted.map((emp) => {
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
                        ) : (
                          <span className="text-white/50">нет</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {hasOrder ? (
                          <div className="text-white/80">
                            <div>
                              <span className="text-white/60">Meal Box:</span> {sum?.mealBox || '—'}
                            </div>
                            <div>
                              <span className="text-white/60">Экстра 1:</span> {sum?.extra1 || '—'}
                            </div>
                            <div>
                              <span className="text-white/60">Экстра 2:</span> {sum?.extra2 || '—'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-white/50">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-0">
                        <div className="flex flex-wrap gap-2">
                          {hasOrder ? (
                            <>
                              <Button onClick={() => openQuizFor(emp)}>Изменить</Button>
                              <Button variant="danger" onClick={() => cancelOrder(emp)}>
                                Отменить
                              </Button>
                            </>
                          ) : (
                            <Button onClick={() => openQuizFor(emp)}>Оформить</Button>
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
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setDone(true);
        setTimeout(() => setDone(false), 1000);
      }}
      className="text-xs inline-flex items-center px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20"
      title={url}
    >
      {done ? 'Скопировано' : 'Копировать'}
    </button>
  );
}
