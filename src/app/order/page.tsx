// src/app/order/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
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

export default function OrderPage() {
  const router = useRouter();

  // 1) читаем query один раз при монтировании
  const [org, setOrg] = useState('');
  const [employeeID, setEmployeeID] = useState('');
  const [token, setToken] = useState('');

  const [dates, setDates] = useState<string[]>([]);
  const [busy, setBusy] = useState<Record<string, SingleResp>>({});
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null); // только для модалки с существующим заказом
  const [error, setError] = useState('');

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

  // 2) подгружаем опубликованные даты
  useEffect(() => {
    (async () => {
      try {
        if (!org) return;
        setLoading(true); setError('');
        const r = await fetchJSON<{ ok:boolean; dates: string[] }>(`/api/dates?org=${encodeURIComponent(org)}`);
        setDates(r.dates || []);
      } catch (e:any) {
        setError(e?.message || String(e));
      } finally { setLoading(false); }
    })();
  }, [org]);

  // 3) для каждой даты проверим — есть ли заказ (для подсветки кнопок и модалки)
  useEffect(() => {
    (async () => {
      if (!employeeID || !org || !token || dates.length === 0) return;
      const out: Record<string, SingleResp> = {};
      for (const d of dates) {
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
    })();
  }, [dates, employeeID, org, token]);

  const name = useMemo(() => busy[selected || '']?.summary?.fullName || '', [busy, selected]);

  // 4) клик по дате: если заказа нет — сразу в квиз; если есть — показываем модалку
  async function handlePickDate(d: string) {
    try {
      const u = new URL('/api/hr_orders', window.location.origin);
      u.searchParams.set('mode','single');
      u.searchParams.set('employeeID', employeeID);
      u.searchParams.set('org', org);
      u.searchParams.set('token', token);
      u.searchParams.set('date', d);
      const r = await fetchJSON<SingleResp>(u.toString());

      if (!r?.summary?.orderId) {
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

      // есть готовый заказ — откроем модалку
      setSelected(d);
    } catch {
      // при ошибке проверки — тоже идём в квиз (чтобы не стопорить пользователя)
      const q = new URL('/order/quiz', window.location.origin);
      q.searchParams.set('date', d);
      q.searchParams.set('step', '1');
      q.searchParams.set('org', org);
      q.searchParams.set('employeeID', employeeID);
      q.searchParams.set('token', token);
      router.push(q.toString());
    }
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
                onClick={()=>handlePickDate(d)}
                className="w-full"
                variant={has ? 'ghost' : 'primary'}
              >
                {label}
              </Button>
            );
          })}
        </div>

        {/* Подсказка по цветам */}
        <div className="flex items-center gap-4 mt-4 text-xs text-white/60">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-4 h-4 rounded bg-brand-500" /> свободно
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-4 h-4 rounded bg-white/10" /> уже заказано
          </span>
        </div>
      </Panel>

      {/* Модалка по выбранной дате — теперь только если заказ уже существует */}
      {selected && (
        <DateModal
          iso={selected}
          employeeID={employeeID}
          org={org}
          token={token}
          info={busy[selected]}
          onClose={()=>setSelected(null)}
        />
      )}
    </main>
  );
}

/* ——— Модалка: показываем состав и кнопки ОК/Изменить/Отменить,
      вызывается только когда заказ уже есть */
function DateModal({ iso, employeeID, org, token, info, onClose }:{
  iso: string;
  employeeID: string; org: string; token: string;
  info?: SingleResp; onClose: ()=>void;
}) {
  const has = Boolean(info?.summary);
  const s   = info?.summary;

  const [working, setWorking] = useState(false);
  const [err, setErr] = useState('');

  async function cancelOrder() {
    if (!s?.orderId) return;
    try {
      setWorking(true); setErr('');
      await fetchJSON('/api/order_cancel', {
        method: 'POST',
        body: JSON.stringify({ employeeID, org, token, orderId: s.orderId, reason: 'user_cancel' })
      });
      onClose();
      alert('Заказ отменён.');
    } catch(e:any) {
      setErr(e.message || String(e));
    } finally { setWorking(false); }
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
              <Button
                variant="ghost"
                onClick={() => {
                  const u = new URL('/order/quiz', window.location.origin);
                  u.searchParams.set('date', iso);
                  u.searchParams.set('step', '1');
                  u.searchParams.set('org', org);
                  u.searchParams.set('employeeID', employeeID);
                  u.searchParams.set('token', token);

// креды из текущего урла
  const sp = new URLSearchParams(window.location.search);
  for (const k of ['org','employeeID','token']) {
    const v = sp.get(k);
    if (v) u.searchParams.set(k, v);
  }

  // <<< НОВОЕ: пробрасываем orderId для режима правки
  if (s?.orderId) u.searchParams.set('orderId', s.orderId);

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
        ) : null}
      </div>
    </div>
  );
}
