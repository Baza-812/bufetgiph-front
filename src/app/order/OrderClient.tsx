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
    tariffCode?: string;
    paymentMethod?: string;
    paymentLink?: string;
    status?: string;
  };
};

type OrgInfo = {
  ok: boolean;
  org?: {
    name: string;
    vidDogovora?: string;
    priceFull?: number | null;
    priceLight?: number | null;
    footerText?: string | null;
    cutoffTime?: string | null;
  };
};

export default function OrderClient() {
  const router = useRouter();

  // креды
  const [org, setOrg] = useState('');
  const [employeeID, setEmployeeID] = useState('');
  const [token, setToken] = useState('');
  const [role, setRole] = useState('');
  const [employeeName, setEmployeeName] = useState('');

  // данные организации
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);

  // данные
  const [dates, setDates] = useState<string[]>([]);
  const [busy, setBusy] = useState<Record<string, SingleResp>>({});
  const [busyReady, setBusyReady] = useState(false);

  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');

  // 1) забираем креды из query/localStorage (один раз)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const o = q.get('org') || localStorage.getItem('baza.org') || '';
    const e = q.get('employeeID') || localStorage.getItem('baza.employeeID') || '';
    const t = q.get('token') || localStorage.getItem('baza.token') || '';
    const r = q.get('role') || localStorage.getItem('baza.role') || '';
    const n = q.get('name') || localStorage.getItem('baza.name') || '';
    
    setOrg(o); 
    setEmployeeID(e); 
    setToken(t);
    setRole(r);
    setEmployeeName(n);
    
    if (o && e && t) {
      localStorage.setItem('baza.org', o);
      localStorage.setItem('baza.employeeID', e);
      localStorage.setItem('baza.token', t);
    }
    if (r) localStorage.setItem('baza.role', r);
    if (n) localStorage.setItem('baza.name', n);
  }, []);

  // 1.5) загружаем информацию об организации
  useEffect(() => {
    (async () => {
      if (!org) return;
      try {
        const r = await fetchJSON<OrgInfo>(`/api/org_info?org=${encodeURIComponent(org)}`);
        setOrgInfo(r);
      } catch (e) {
        console.error('❌ Failed to load org info:', e);
      }
    })();
  }, [org]);

  // 2) опубликованные даты
  useEffect(() => {
    (async () => {
      if (!org) return;
      try {
        setLoading(true); 
        setError('');
        const r = await fetchJSON<{ ok: boolean; dates: string[] }>(`/api/dates?org=${encodeURIComponent(org)}`);
        setDates(r.dates || []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [org]);

  // Перезагрузка «занятости» с полными данными заказов
  const reloadBusy = useCallback(async () => {
    if (!employeeID || !org || !token || dates.length === 0) return;
    setBusyReady(false);
    try {
      // Загружаем полные данные заказов для всех дат
      const promises = dates.map(async (d) => {
        try {
          const u = new URL('/api/hr_orders', window.location.origin);
          u.searchParams.set('mode', 'single');
          u.searchParams.set('employeeID', employeeID);
          u.searchParams.set('org', org);
          u.searchParams.set('token', token);
          u.searchParams.set('date', d);
          const r = await fetchJSON<SingleResp>(u.toString());
          return { date: d, data: r };
        } catch {
          return { date: d, data: { ok: true, summary: null } };
        }
      });
      
      const results = await Promise.all(promises);
      const map: Record<string, SingleResp> = {};
      results.forEach(({ date, data }) => {
        map[date] = data;
      });
      setBusy(map);
    } catch {
      const map: Record<string, SingleResp> = {};
      for (const d of dates) map[d] = { ok: false, summary: null };
      setBusy(map);
    } finally {
      setBusyReady(true);
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

  // Проверка программы "Старший"
  const isStarshiy = orgInfo?.org?.vidDogovora === 'Starshiy';
  const isKomanda = role?.toLowerCase() === 'komanda';
  const needsStarshiy = isStarshiy && isKomanda;

  // Подсчёт неоплаченных заказов
  const unpaidOrders = useMemo(() => {
    return Object.entries(busy)
      .filter(([_, order]) => {
        const s = order.summary;
        return s && s.paymentMethod === 'card' && s.status !== 'paid';
      })
      .map(([date, order]) => ({ date, order: order.summary! }));
  }, [busy]);

  const totalUnpaid = useMemo(() => {
    return unpaidOrders.reduce((sum, { order }) => {
      const tariff = order.tariffCode;
      const price = tariff === 'full' 
        ? (orgInfo?.org?.priceFull || 0)
        : tariff === 'light'
        ? (orgInfo?.org?.priceLight || 0)
        : 0;
      return sum + price;
    }, 0);
  }, [unpaidOrders, orgInfo]);

  // 4) клик по дате
  async function handlePickDate(d: string) {
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

  // Определяем вариант кнопки для даты
  function getDateVariant(d: string): 'primary' | 'ghost' | 'danger' {
    const order = busy[d]?.summary;
    if (!order) return 'primary'; // свободно
    if (order.paymentMethod === 'card' && order.status !== 'paid') return 'danger'; // требуется оплата
    return 'ghost'; // уже заказано
  }

  return (
    <main>
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
        {/* Блок "Итого к оплате" в правом верхнем углу */}
        {needsStarshiy && unpaidOrders.length > 0 && (
          <div className="fixed top-4 right-4 z-40 bg-red-500/90 backdrop-blur-sm border border-red-400 rounded-xl p-4 shadow-lg max-w-xs">
            <div className="text-white font-bold text-lg mb-2">Итого к оплате</div>
            <div className="text-white text-2xl font-bold mb-3">{totalUnpaid} ₽</div>
            <div className="text-white/80 text-xs mb-3">
              Неоплаченных заказов: {unpaidOrders.length}
            </div>
            <Button
              variant="primary"
              className="w-full"
              onClick={() => {
                // TODO: реализовать массовую оплату
                alert('Функция массовой оплаты в разработке');
              }}
            >
              Оплатить всё
            </Button>
          </div>
        )}

        <Panel title="Добро пожаловать!">
          <p className="text-white/80">
            Здесь вы можете выбрать обед на подходящий день. Нажмите на дату ниже.
          </p>
        </Panel>

        {/* Информация о сотруднике */}
        {orgInfo?.org && (
          <Panel title="Информация о сотруднике">
            <div className="space-y-2 text-sm">
              {employeeName && (
                <div>
                  Сотрудник: <span className="font-semibold">{employeeName}</span>
                </div>
              )}
              <div>
                Организация: <span className="font-semibold">{orgInfo.org.name}</span>
              </div>
              {needsStarshiy && (
                <div className="mt-4 p-3 bg-yellow-400/10 border border-yellow-400/30 rounded-xl">
                  <div className="text-yellow-400 font-bold">🌟 Программа "Старший" активна</div>
                </div>
              )}
            </div>
          </Panel>
        )}

        {/* Тарифы программы Старший */}
        {needsStarshiy && orgInfo?.org && (
          <Panel title="Тарифы">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <div className="text-lg font-bold text-yellow-400 mb-2">Полный обед</div>
                <div className="text-2xl font-bold text-white mb-2">
                  {orgInfo.org.priceFull != null ? `${orgInfo.org.priceFull} ₽` : '—'}
                </div>
                <div className="text-sm text-white/70">Салат + Суп + Основное + Гарнир</div>
              </div>

              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <div className="text-lg font-bold text-yellow-400 mb-2">Лёгкий обед</div>
                <div className="text-2xl font-bold text-white mb-2">
                  {orgInfo.org.priceLight != null ? `${orgInfo.org.priceLight} ₽` : '—'}
                </div>
                <div className="text-sm text-white/70">Салат + Основное + Гарнир</div>
              </div>
            </div>
          </Panel>
        )}

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
              const label = fmtDayLabel(d);
              const variant = getDateVariant(d);
              return (
                <Button
                  key={d}
                  onClick={() => handlePickDate(d)}
                  className="w-full"
                  variant={variant}
                  disabled={!busyReady}
                >
                  {label}
                </Button>
              );
            })}
          </div>

          {/* Подсказки */}
          <div className="mt-6 flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-yellow-400"></div>
              <span className="text-white/70">— свободно</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-white/10 border border-white/20"></div>
              <span className="text-white/70">— уже заказано</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-500"></div>
              <span className="text-white/70">— требуется оплата</span>
            </div>
          </div>

          <div className="mt-4 text-xs text-white/50">
            Нажмите на дату, чтобы оформить заказ. Заказ на следующий день можно изменить/отменить до{' '}
            {orgInfo?.org?.cutoffTime || '22:00'} текущего дня.
          </div>
        </Panel>

        {/* Модалка со составом */}
        {selected && (
          <DateModal
            iso={selected}
            employeeID={employeeID}
            org={org}
            token={token}
            info={busy[selected]}
            onClose={() => setSelected(null)}
            onChanged={reloadBusy}
            needsStarshiy={needsStarshiy}
            orgInfo={orgInfo}
          />
        )}

        {/* Футер с реквизитами из Banks.FooterText */}
        {needsStarshiy && orgInfo?.org?.footerText && (
          <footer className="mt-8 p-4 bg-black/20 border border-white/10 rounded-xl">
            <div className="text-xs text-white/60 whitespace-pre-line">
              {orgInfo.org.footerText}
            </div>
          </footer>
        )}
      </div>
    </main>
  );
}

/* ——— Модалка: состав + действия ——— */
function DateModal({
  iso, employeeID, org, token, info, onClose, onChanged, needsStarshiy, orgInfo
}: {
  iso: string;
  employeeID: string; 
  org: string; 
  token: string;
  info?: SingleResp; 
  onClose: ()=>void; 
  onChanged: ()=>void;
  needsStarshiy: boolean;
  orgInfo: OrgInfo | null;
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

  // Определяем выбранный тариф и цену
  const selectedTariff = sum?.tariffCode;
  const selectedPrice = selectedTariff === 'full'
    ? orgInfo?.org?.priceFull
    : selectedTariff === 'light'
    ? orgInfo?.org?.priceLight
    : null;

  const needsPayment = sum?.paymentMethod === 'card' && sum?.status !== 'paid';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/90 p-2 sm:p-6">
      <div className="w-full sm:max-w-lg bg-[#1a1a1a] border border-white/10 rounded-2xl p-4">
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

              {/* Показываем ВЫБРАННЫЙ тариф в модалке для программы "Старший" */}
              {needsStarshiy && selectedTariff && selectedPrice != null && (
                <div className="mt-3 p-3 bg-yellow-400/10 border border-yellow-400/30 rounded-xl">
                  <div className="text-yellow-400 font-bold mb-2">🌟 Программа "Старший"</div>
                  <div className="text-sm">
                    <div className="text-white/60">Выбранный тариф:</div>
                    <div className="font-bold text-lg">
                      {selectedTariff === 'full' ? 'Полный обед' : 'Лёгкий обед'} — {selectedPrice} ₽
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {!loading && !sum?.orderId && (
            <div className="text-white/70">
              Не удалось получить состав заказа. Вы можете перейти к изменению.
            </div>
          )}

          {err && <div className="text-red-400">{err}</div>}

          <div className="flex gap-3 pt-2 flex-wrap">
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

            {/* Кнопка "Оплатить" если требуется оплата */}
            {needsPayment && sum?.paymentLink && (
              <Button
                variant="primary"
                onClick={() => {
                  window.open(sum.paymentLink, '_blank');
                }}
              >
                Оплатить
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
