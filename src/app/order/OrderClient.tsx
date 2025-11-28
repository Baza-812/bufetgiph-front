// src/app/order/OrderClient.tsx
'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Input, { Field } from '@/components/ui/Input';
import { fetchJSON, fmtDayLabel } from '@/lib/api';
import HintDates from '@/components/HintDates';

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

type OrgInfo = {
  ok: boolean;
  org?: {
    name: string;
    vidDogovora?: string;
    priceFull?: number;
    priceLight?: number;
    bankName?: string;
    bankLegalName?: string;
    bankINN?: string;
    bankKPP?: string;
    bankAccount?: string;
    bankBIC?: string;
    bankContactPhone?: string;
    bankContactEmail?: string;
    bankFooterText?: string;
  };
};

export default function OrderClient() {
  const router = useRouter();

  // креды
  const [org, setOrg] = useState('');
  const [employeeID, setEmployeeID] = useState('');
  const [token, setToken] = useState('');
  const [role, setRole] = useState('');

  // данные
  const [dates, setDates] = useState<string[]>([]);
  const [busy, setBusy] = useState<Record<string, SingleResp>>({});
  const [busyReady, setBusyReady] = useState(false);
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);

  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');

  // 1) забираем креды из query/localStorage
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const o = q.get('org') || localStorage.getItem('baza.org') || '';
    const e = q.get('employeeID') || localStorage.getItem('baza.employeeID') || '';
    const t = q.get('token') || localStorage.getItem('baza.token') || '';
    const r = localStorage.getItem('baza.role') || '';
    setOrg(o); setEmployeeID(e); setToken(t); setRole(r);
    if (o && e && t) {
      localStorage.setItem('baza.org', o);
      localStorage.setItem('baza.employeeID', e);
      localStorage.setItem('baza.token', t);
    }
  }, []);

  // 2) загружаем информацию об организации
  useEffect(() => {
    (async () => {
      if (!org) return;
      try {
        const r = await fetchJSON<OrgInfo>(`/api/org_info?org=${encodeURIComponent(org)}`);
        setOrgInfo(r);
        // Сохраняем роль, если она есть в ответе
        if (r?.org?.vidDogovora) {
          localStorage.setItem('baza.vidDogovora', r.org.vidDogovora);
        }
      } catch (e) {
        console.error('Failed to load org info:', e);
      }
    })();
  }, [org]);

  // 3) опубликованные даты
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

  // Перезагрузка «занятости»
  const reloadBusy = useCallback(async () => {
    if (!employeeID || !org || !token || dates.length === 0) return;
    setBusyReady(false);
    try {
      const qs = new URLSearchParams({
        employeeID, org, token,
        dates: dates.join(','),
      });
      const r = await fetchJSON<{ ok: boolean; busy: Record<string, boolean> }>(`/api/busy?${qs.toString()}`);
      const map: Record<string, SingleResp> = {};
      for (const d of dates) {
        map[d] = r.busy[d]
          ? { ok: true, summary: { orderId: '__has__', fullName: '', date: d, mealBox: '', extra1: '', extra2: '' } as any }
          : { ok: true, summary: null };
      }
      setBusy(map);
    } catch {
      const map: Record<string, SingleResp> = {};
      for (const d of dates) map[d] = { ok: false, summary: null };
      setBusy(map);
    } finally {
      setBusyReady(true);
    }
  }, [dates, employeeID, org, token]);

  useEffect(() => { reloadBusy(); }, [reloadBusy]);

  useEffect(() => {
    const onFocus = () => { reloadBusy(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reloadBusy]);

  const name = useMemo(() => busy[selected || '']?.summary?.fullName || '', [busy, selected]);

  // 4) клик по дате
  async function handlePickDate(d: string) {
    if (!busyReady) {
      try {
        const u = new URL('/api/hr_orders', window.location.origin);
        u.searchParams.set('mode', 'single');
        u.searchParams.set('employeeID', employeeID);
        u.searchParams.set('org', org);
        u.searchParams.set('token', token);
        u.searchParams.set('date', d);
        const r = await fetchJSON<SingleResp>(u.toString());
        if (r?.summary?.orderId) {
          setSelected(d);
          return;
        }
        const q = new URL('/order/quiz', window.location.origin);
        q.searchParams.set('date', d);
        q.searchParams.set('step', '1');
        q.searchParams.set('org', org);
        q.searchParams.set('employeeID', employeeID);
        q.searchParams.set('token', token);
        router.push(q.toString());
        return;
      } catch {
        const q = new URL('/order/quiz', window.location.origin);
        q.searchParams.set('date', d);
        q.searchParams.set('step', '1');
        q.searchParams.set('org', org);
        q.searchParams.set('employeeID', employeeID);
        q.searchParams.set('token', token);
        router.push(q.toString());
        return;
      }
    }

    const isBusy = Boolean(busy[d]?.summary);
    if (!isBusy) {
      const q = new URL('/order/quiz', window.location.origin);
      q.searchParams.set('date', d);
      q.searchParams.set('step', '1');
      q.searchParams.set('org', org);
      q.searchParams.set('employeeID', employeeID);
      q.searchParams.set('token', token);
      router.push(q.toString());
      return;
    }
    setSelected(d);
  }

  const isStarshiy = orgInfo?.org?.vidDogovora === 'Starshiy';
  const showTariffs = isStarshiy && role?.toLowerCase() === 'komanda';

  return (
    <main>
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
        <Panel title="Добро пожаловать!">
          <p className="text-white/80">
            Здесь вы можете выбрать обед на подходящий день. Нажмите на дату ниже.
          </p>
        </Panel>

        {/* Промо */}
        <Panel title="Неделя скандинавской кухни · 24–28 ноября">
          <div className="max-w-2xl mx-auto w-full">
            <div className="w-full flex justify-center">
              <img
                src="/scandi.jpg"
                alt="Неделя скандинавской кухни 24–28 ноября"
                loading="lazy"
                className="max-w-full h-auto max-h-124 sm:max-h-140 object-contain rounded-xl border border-white/10 bg-black/10"
              />
            </div>
          </div>
        </Panel>

        {/* Тарифы для программы "Старший" */}
        {showTariffs && orgInfo?.org && (
          <Panel title="Тарифы">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <div className="text-lg font-bold text-yellow-400 mb-2">Полный обед</div>
                <div className="text-2xl font-bold text-white mb-2">
                  {orgInfo.org.priceFull ? `${orgInfo.org.priceFull} ₽` : '—'}
                </div>
                <div className="text-sm text-white/70">
                  Салат + Суп + Основное + Гарнир
                </div>
              </div>

              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <div className="text-lg font-bold text-yellow-400 mb-2">Лёгкий обед</div>
                <div className="text-2xl font-bold text-white mb-2">
                  {orgInfo.org.priceLight ? `${orgInfo.org.priceLight} ₽` : '—'}
                </div>
                <div className="text-sm text-white/70">
                  Салат + Основное + Гарнир
                </div>
              </div>
            </div>
          </Panel>
        )}

        {/* креды вручную */}
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
              const has = Boolean(busy[d]?.summary);
              const label = fmtDayLabel(d);
              return (
                <Button
                  key={d}
                  onClick={() => handlePickDate(d)}
                  className="w-full"
                  variant={has ? 'ghost' : 'primary'}
                  disabled={!busyReady}
                >
                  {label}
                </Button>
              );
            })}
          </div>

          <HintDates />
        </Panel>

        {/* Футер с банковскими реквизитами */}
        {orgInfo?.org && (
          <Panel title="Реквизиты для оплаты">
            <div className="space-y-2 text-sm text-white/80">
              {orgInfo.org.bankLegalName && <div><span className="text-white/60">Получатель:</span> {orgInfo.org.bankLegalName}</div>}
              {orgInfo.org.bankINN && <div><span className="text-white/60">ИНН:</span> {orgInfo.org.bankINN}</div>}
              {orgInfo.org.bankKPP && <div><span className="text-white/60">КПП:</span> {orgInfo.org.bankKPP}</div>}
              {orgInfo.org.bankAccount && <div><span className="text-white/60">Расчётный счёт:</span> {orgInfo.org.bankAccount}</div>}
              {orgInfo.org.bankName && <div><span className="text-white/60">Банк:</span> {orgInfo.org.bankName}</div>}
              {orgInfo.org.bankBIC && <div><span className="text-white/60">БИК:</span> {orgInfo.org.bankBIC}</div>}
              {orgInfo.org.bankContactPhone && <div><span className="text-white/60">Телефон:</span> {orgInfo.org.bankContactPhone}</div>}
              {orgInfo.org.bankContactEmail && <div><span className="text-white/60">Email:</span> {orgInfo.org.bankContactEmail}</div>}
              {orgInfo.org.bankFooterText && (
                <div className="mt-3 pt-3 border-t border-white/10 text-white/70">
                  {orgInfo.org.bankFooterText}
                </div>
              )}
            </div>
          </Panel>
        )}

        {/* Модалка */}
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
      </div>
    </main>
  );
}

/* Модалка */
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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const needFetch = !info?.summary || info.summary.orderId === '__has__';
      if (!needFetch) { setSum(info!.summary); return; }
      try {
        setLoading(true); setErr('');
        const u = new URL('/api/hr_orders', window.location.origin);
        u.searchParams.set('mode','single');
        u.searchParams.set('employeeID', employeeID);
        u.searchParams.set('org', org);
        u.searchParams.set('token', token);
        u.searchParams.set('date', iso);
        const r = await fetchJSON<SingleResp>(u.toString());
        if (!ignore) setSum(r?.summary || null);
      } catch (e) {
        if (!ignore) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => { ignore = true; };
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
      onChanged();
    } catch(e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setWorking(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-2 sm:p-6">
      <div className="w-full sm:max-w-lg bg-panel border border-white/10 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-lg font-bold">{fmtDayLabel(iso)}</div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-sm">Закрыть</button>
        </div>

        <div className="space-y-2 text-sm">
          {loading && <div className="text-white/60">Загрузка данных заказа…</div>}

          {!loading && sum?.orderId && (
            <>
              <div className="text-white/80">Заказ уже оформлен на эту дату.</div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                <div><span className="text-white/60">Сотрудник:</span> {sum?.fullName || '—'}</div>
                <div><span className="text-white/60">Meal Box:</span> {sum?.mealBox || '—'}</div>
                <div><span className="text-white/60">Экстра 1:</span> {sum?.extra1 || '—'}</div>
                <div><span className="text-white/60">Экстра 2:</span> {sum?.extra2 || '—'}</div>
              </div>
            </>
          )}

          {!loading && !sum?.orderId && (
            <div className="text-white/70">
              Не удалось получить состав заказа. Вы можете перейти к изменению.
            </div>
          )}

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
                if (sum?.orderId) u.searchParams.set('orderId', sum.orderId);
                window.location.href = u.toString();
              }}
            >
              Изменить
            </Button>

            <Button
              variant="danger"
              onClick={cancelOrder}
              disabled={working || !sum?.orderId}
            >
              {working ? 'Отмена…' : 'Отменить'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
