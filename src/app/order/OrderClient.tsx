// src/app/order/OrderClient.tsx
'use client';

import {useEffect, useMemo, useState} from 'react';
import {useSearchParams, useRouter} from 'next/navigation';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Input, { Field } from '@/components/ui/Input';
import { fetchJSON } from '@/lib/api';

type DatesResp = { ok: boolean; dates: string[] };
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
  const sp = useSearchParams();
  const router = useRouter();

  // креды из линка или локального хранилища
  const qOrg  = sp.get('org') || '';
  const qEmp  = sp.get('employeeID') || '';
  const qTok  = sp.get('token') || '';

  const [org, setOrg] = useState(qOrg || localStorage.getItem('baza.org') || '');
  const [employeeID, setEmployeeID] = useState(qEmp || localStorage.getItem('baza.employeeID') || '');
  const [token, setToken] = useState(qTok || localStorage.getItem('baza.token') || '');

  // если пришли новые из query — сохраним
  useEffect(() => {
    if (qOrg)  { setOrg(qOrg);  localStorage.setItem('baza.org', qOrg); }
    if (qEmp)  { setEmployeeID(qEmp); localStorage.setItem('baza.employeeID', qEmp); }
    if (qTok)  { setToken(qTok); localStorage.setItem('baza.token', qTok); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [dates, setDates] = useState<string[]>([]);
  const [busy, setBusy]   = useState<Record<string, SingleResp>>({});
  const [loadingDates, setLoadingDates] = useState(false);
  const [loadingBusy, setLoadingBusy] = useState(false);
  const [error, setError] = useState('');

  // 1) загрузка опубликованных дат
  useEffect(() => {
    (async () => {
      if (!org) return;
      try {
        setError(''); setLoadingDates(true);
        const r = await fetchJSON<DatesResp>(`/api/dates?org=${encodeURIComponent(org)}`);
        setDates(r.dates || []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoadingDates(false);
      }
    })();
  }, [org]);

  // 2) загрузка занятости (только если есть все креды)
  async function reloadBusy() {
    if (!org || !employeeID || !token || dates.length === 0) return;
    try {
      setLoadingBusy(true);
      const results = await Promise.allSettled(
        dates.map(async (d) => {
          const u = new URL('/api/hr_orders', window.location.origin);
          u.searchParams.set('mode','single');
          u.searchParams.set('employeeID', employeeID);
          u.searchParams.set('org', org);
          u.searchParams.set('token', token);
          u.searchParams.set('date', d);
          const r = await fetchJSON<SingleResp>(u.toString());
          return [d, r] as const;
        })
      );
      const map: Record<string, SingleResp> = {};
      for (const it of results) {
        if (it.status === 'fulfilled') {
          const [d, r] = it.value;
          map[d] = r;
        }
      }
      setBusy(map);
    } catch (e) {
      // молча — нам важнее не уронить сетку дат
      console.warn('busy load failed', e);
    } finally {
      setLoadingBusy(false);
    }
  }

  useEffect(() => { reloadBusy(); }, [org, employeeID, token, dates]);

  const canCheckBusy = Boolean(org && employeeID && token);

  function fmtDayLabel(isoDate: string) {
    if (!isoDate) return '';
    const dt = new Date(`${isoDate}T00:00:00`);
    const s = dt.toLocaleDateString('ru-RU', {
      weekday: 'short', day: '2-digit', month: '2-digit'
    });
    return s.replace(/^[а-яё]/, (ch) => ch.toUpperCase());
  }

  function goToQuiz(iso: string) {
    const u = new URL('/order/quiz', window.location.origin);
    u.searchParams.set('date', iso);
    u.searchParams.set('step','1');
    // прокинем креды из текущей страницы
    if (org)        u.searchParams.set('org', org);
    if (employeeID) u.searchParams.set('employeeID', employeeID);
    if (token)      u.searchParams.set('token', token);
    router.push(u.toString());
  }

  return (
    <main>
      <Panel title="Добро пожаловать!">
        <p className="text-white/80">
          Здесь вы можете выбрать обед на подходящий день. Нажмите на дату ниже.
        </p>
      </Panel>

      {/* Подсказка, если не хватает кредов для проверки занятости */}
      {!canCheckBusy && (
        <Panel title="Данные доступа">
          <div className="text-sm text-white/70 mb-2">
            Чтобы отмечать занятые даты и открывать модалку с составом заказа, укажите ваши креды
            (обычно они подставляются автоматически по персональной ссылке).
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
        </Panel>
      )}

      <Panel title="Выберите дату">
        {loadingDates && <div className="text-white/60 text-sm">Загрузка дат…</div>}
        {error && <div className="text-red-400 text-sm">Ошибка: {error}</div>}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {dates.map((d) => {
            const has = Boolean(busy[d]?.summary); // есть заказ — занято
            return (
              <Button
                key={d}
                className="w-full"
                variant={has ? 'ghost' : 'primary'} // ghost = серый, primary = жёлтый
                onClick={() => goToQuiz(d)}
                title={fmtDayLabel(d)}
              >
                {fmtDayLabel(d)}
              </Button>
            );
          })}
        </div>

        {/* Легенда */}
        <div className="flex items-center gap-4 mt-4 text-xs text-white/60">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded bg-yellow-400" /> свободно
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded bg-white/10" /> уже заказано
          </span>
          {canCheckBusy && (
            <Button size="sm" variant="ghost" onClick={reloadBusy} disabled={loadingBusy}>
              {loadingBusy ? 'Обновление…' : 'Обновить статусы'}
            </Button>
          )}
        </div>
      </Panel>
    </main>
  );
}
