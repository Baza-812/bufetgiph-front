// src/app/order/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Input, { Field } from '@/components/ui/Input';
import { fetchJSON, fmtDayLabel } from '@/lib/api';

type SingleResp = {
  ok: boolean;
  summary: null | { fullName: string; date: string; mealBox: string; extra1: string; extra2: string; orderId: string };
};

export default function OrderPage() {
  // 1) читаем query один раз при монтировании
  const [org, setOrg] = useState('');
  const [employeeID, setEmployeeID] = useState('');
  const [token, setToken] = useState('');

  const [dates, setDates] = useState<string[]>([]);
  const [busy, setBusy] = useState<Record<string, SingleResp>>({});
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');

  // ——————————————————————————————————————————
  // Инициализация кредов из URL / localStorage
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

  // ——————————————————————————————————————————
  // Подгружаем опубликованные даты
  useEffect(() => {
    (async () => {
      try {
        if (!org) return;
        setLoading(true); setError('');
        const r = await fetchJSON<{ ok:boolean; dates: string[] }>(`/api/dates?org=${encodeURIComponent(org)}`);
        setDates(r.dates || []);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, [org]);

  // ——————————————————————————————————————————
  // Функция загрузки занятости по всем датам
  async function loadBusyMap(datesList: string[]) {
    if (!employeeID || !org || !token || datesList.length === 0) return;
    const out: Record<string, SingleResp> = {};
    for (const d of datesList) {
      try {
        const u = new URL('/api/hr_orders', window.location.origin);
        u.searchParams.set('mode','single');
        u.searchParams.set('employeeID', employeeID);
        u.searchParams.set('org', org);
        u.searchParams.set('token', token);
        u.searchParams.set('date', d);
        const r = await fetchJSON<SingleResp>(u.toString());
        out[d] = r;
      } catch {
        out[d] = { ok: false, summary: null };
      }
    }
    setBusy(out);
  }

  // Грузим занятость, когда появились даты/креды
  useEffect(() => {
    if (dates.length) { void loadBusyMap(dates); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates, employeeID, org, token]);

  // Авто-обновление занятости при возврате на вкладку/фокусе
  useEffect(() => {
    function onFocus() { void loadBusyMap(dates); }
    function onVisibility() { if (document.visibilityState === 'visible') void loadBusyMap(dates); }
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates, employeeID, org, token]);

  const name = useMemo(() => busy[selected || '']?.summary?.fullName || '', [busy, selected]);

  // ——————————————————————————————————————————
  // Переход в квиз (для свободной даты — сразу, без модалки)
  function goToQuiz(dateISO: string) {
    const u = new URL('/order/quiz', window.location.origin);
    u.searchParams.set('date', dateISO);
    u.searchParams.set('step','1');
    // прокинем креды из текущей страницы
    const sp = new URLSearchParams(window.location.search);
    for (const k of ['org','employeeID','token']) {
      const v = sp.get(k);
      if (v) u.searchParams.set(k, v);
    }
    window.location.href = u.toString();
  }

  return (
    <main>
      <Panel title="Добро пожаловать!">
        <p className="text-white/80">
          Здесь вы можете выбрать обед на подходящий день. Нажмите на дату ниже.
        </p>
      </Panel>

      {/* Блок авторизации (на случай если пришли без query) */}
      {(!org || !employeeID || !token) && (
        <Panel title="Данные доступа">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Org"><Input value={org} onChange={e=>setOrg(e.target.value)} placeholder="org120" /></Field>
            <Field label="Employee ID"><Input value={employeeID} onChange={e=>setEmployeeID(e.target.value)} placeholder="rec..." /></Field>
            <Field label="Token"><Input value={token} onChange={e=>setToken(e.target.value)} placeholder="token" /></Field>
          </div>
          <div className="text-xs text-white/50">Обычно эти поля подставляются автоматически из персональной ссылки.</div>
        </Panel>
      )}

      <Panel title="Выберите дату">
        {loading && <div className="text-white/60 text-sm">Загрузка дат…</div>}
        {error && <div className="text-red-400 text-sm">Ошибка: {error}</div>}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {dates.map(d => {
            const has = Boolean(busy[d]?.summary);
            const label = fmtDayLabel(d);
            return (
              <Button
                key={d}
                onClick={()=>{
                  if (has) {
                    // Занято — показываем модалку с составом и действиями
                    setSelected(d);
                  } else {
                    // Свободно — сразу идём в квиз (без промежуточной модалки)
                    goToQuiz(d);
                  }
                }}
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
            <span className="inline-block w-3 h-3 rounded bg-yellow-400" /> Свободно
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded bg-white/10" /> Уже заказано
          </span>
        </div>
      </Panel>

      {/* Модалка только если заказ уже есть */}
      {selected && busy[selected]?.summary && (
        <DateModal
          iso={selected}
          employeeID={employeeID}
          org={org}
          token={token}
          info={busy[selected]}
          onClose={()=>{
            setSelected(null);
            // подстрахуемся и перечитаем статусы
            void loadBusyMap(dates);
          }}
          onChanged={()=>{
            // если HR или сотрудник изменил/отменил заказ — перезагрузить статусы
            void loadBusyMap(dates);
          }}
        />
      )}
    </main>
  );
}

/* ——— Модалка: показываем состав и кнопки ОК/Изменить/Отменить */
function DateModal({
  iso, employeeID, org, token, info, onClose, onChanged
}:{
  iso: string;
  employeeID: string; org: string; token: string;
  info?: SingleResp;
  onClose: ()=>void;
  onChanged: ()=>void;
}) {
  const has = Boolean(info?.summary);
  const s   = info?.summary;

  const [working, setWorking] = useState(false);
  const [err, setErr] = useState('');

  async function cancelOrder() {
    if (!s?.orderId) return;
    try {
      setWorking(true); setErr('');
      const r = await fetchJSON<{ ok:boolean; error?:string }>('/api/order_cancel', {
        method: 'POST',
        body: JSON.stringify({ employeeID, org, token, orderId: s.orderId, reason: 'user_cancel' }),
        headers: { 'Content-Type': 'application/json' }
      });
      if (!r.ok) throw new Error(r.error || 'Не удалось отменить заказ');
      onClose();
      onChanged();
      alert('Заказ отменён.');
    } catch(e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
    } finally { setWorking(false); }
  }

  function changeOrder() {
    const u = new URL('/order/quiz', window.location.origin);
    u.searchParams.set('date', iso);
    u.searchParams.set('step','1');
    const sp = new URLSearchParams(window.location.search);
    for (const k of ['org','employeeID','token']) {
      const v = sp.get(k);
      if (v) u.searchParams.set(k, v);
    }
    window.location.href = u.toString();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-2 sm:p-6">
      <div className="w-full sm:max-w-lg bg-panel border border-white/10 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-lg font-bold">{fmtDayLabel(iso)}</div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-sm">Закрыть</button>
        </div>

        {has ? (
          <div className="space-y-2 text-sm">
            <div className="text-white/80">Заказ уже оформлен на эту дату.</div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-3">
              <div><span className="text-white/60">Сотрудник:</span> {s?.fullName || '—'}</div>
              <div><span className="text-white/60">Meal Box:</span> {s?.mealBox || '—'}</div>
              <div><span className="text-white/60">Экстра 1:</span> {s?.extra1 || '—'}</div>
              <div><span className="text-white/60">Экстра 2:</span> {s?.extra2 || '—'}</div>
            </div>
            {err && <div className="text-red-400">{err}</div>}
            <div className="flex gap-3 pt-2">
              <Button onClick={onClose}>ОК</Button>
              <Button onClick={changeOrder} variant="ghost">Изменить</Button>
              <Button onClick={cancelOrder} variant="danger" disabled={working}>{working ? 'Отмена…' : 'Отменить'}</Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
