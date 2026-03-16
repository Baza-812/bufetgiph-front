// src/app/order/OrderClient.tsx
'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Input, { Field } from '@/components/ui/Input';
import { fetchJSON, fmtDayLabel, MenuItem } from '@/lib/api';
import HintDates from '@/components/HintDates';
import PaidExtrasModal from '@/components/PaidExtrasModal';



type SingleResp = {
  ok: boolean;
  summary: null | {
    fullName: string;
    date: string;
    mealBox: string;
    extra1: string;
    extra2: string;
    paidExtras?: Array<{ name: string; qty: number; unitPrice: number; lineSum: number }>;
    paymentInfo?: {
      status: string;
      amount: number;
      paymentLink: string;
      paymentId: string;
    } | null;
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
  const [busyReady, setBusyReady] = useState(false); // ← готовность статуса занятости/серости

  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null); // для модалки
  const [error, setError] = useState('');
  
  // информация о сотруднике и организации
  const [employeeName, setEmployeeName] = useState('');
  const [orgName, setOrgName] = useState('');

  // для редактирования платных допов
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [paidModalOpen, setPaidModalOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState<string | null>(null);

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

  // 2) информация об организации
  useEffect(() => {
    (async () => {
      if (!org) return;
      try {
        const r = await fetchJSON<{ ok: boolean; name?: string }>(`/api/org_info?org=${encodeURIComponent(org)}`);
        if (r.ok && r.name) setOrgName(r.name);
      } catch {
        // не критично
      }
    })();
  }, [org]);

  // 3) информация о сотруднике
  useEffect(() => {
    if (!employeeID || !org || !token) return;
    (async () => {
      try {
        // Используем API для получения информации о сотруднике
        const u = new URL('/api/employee_info', window.location.origin);
        u.searchParams.set('employeeID', employeeID);
        u.searchParams.set('org', org);
        u.searchParams.set('token', token);
        const r = await fetchJSON<{ ok: boolean; fullName?: string }>(u.toString());
        if (r?.ok && r.fullName) setEmployeeName(r.fullName);
      } catch {
        // не критично
      }
    })();
  }, [employeeID, org, token]);

   // 4) опубликованные даты
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

  // Перезагрузка «занятости» одним запросом /api/busy
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

  // первичная загрузка busy
  useEffect(() => { reloadBusy(); }, [reloadBusy]);

  // обновлять при возвращении на вкладку (после квиза)
  useEffect(() => {
    const onFocus = () => { reloadBusy(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reloadBusy]);

  const name = useMemo(() => busy[selected || '']?.summary?.fullName || '', [busy, selected]);

  // 4) клик по дате
  async function handlePickDate(d: string) {
    // Если занятость ещё не подгрузилась — проверим точечно, чтобы не улететь в квиз по ошибке
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
          setSelected(d); // есть заказ — модалка
          return;
        }
        // свободно — квиз
        const q = new URL('/order/quiz', window.location.origin);
        q.searchParams.set('date', d);
        q.searchParams.set('step', '1');
        q.searchParams.set('org', org);
        q.searchParams.set('employeeID', employeeID);
        q.searchParams.set('token', token);
        router.push(q.toString());
        return;
      } catch {
        // на ошибке — пускаем в квиз, чтобы не стопорить пользователя
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

    // Когда занятость известна — решаем локально
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
    setSelected(d); // занято — модалка
  }

  return (
    <main>
      {/* НОВОЕ: общий контейнер, чтобы не тянуться на всю ширину на десктопе */}
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
      <Panel title="Добро пожаловать!">
        <p className="text-white/80">
          Здесь вы можете выбрать обед на подходящий день. Нажмите на дату ниже.
        </p>
      </Panel>

      {/* Информация о сотруднике */}
      {(employeeName || orgName) && (
        <Panel title="Информация о сотруднике">
          <div className="space-y-1 text-sm">
            {employeeName && (
              <div className="text-white/80">
                <span className="text-white/60">Имя:</span>{' '}
                <span className="font-semibold">{employeeName}</span>
              </div>
            )}
            {orgName && (
              <div className="text-white/80">
                <span className="text-white/60">Организация:</span>{' '}
                <span className="font-semibold">{orgName}</span>
              </div>
            )}
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
            const has = Boolean(busy[d]?.summary); // СЕРОЕ если заказ уже есть
            const label = fmtDayLabel(d);
            return (
              <Button
                key={d}
                onClick={() => handlePickDate(d)}
                className="w-full"
                variant={has ? 'ghost' : 'primary'}
                disabled={!busyReady} // ← до загрузки «серости» клики блокируем
              >
                {label}
              </Button>
            );
          })}
        </div>

        <HintDates />
        
        {/* Легенда */}
        
      </Panel>

      {/* Модалка со составом — показываем только когда выбран день */}
      {selected && (
        <DateModal
          iso={selected}
          employeeID={employeeID}
          org={org}
          token={token}
          info={busy[selected]}
          onClose={() => setSelected(null)}
          onChanged={reloadBusy}
          onOpenPaidModal={(orderId, date) => {
            setEditingOrderId(orderId);
            setEditingDate(date);
            setSelected(null);
            setPaidModalOpen(true);
          }}
        />
      )}

      {/* Модалка редактирования платных допов */}
      {paidModalOpen && editingOrderId && editingDate && (
        <PaidExtrasEditModal
          orderId={editingOrderId}
          date={editingDate}
          employeeID={employeeID}
          org={org}
          token={token}
          onClose={() => {
            setPaidModalOpen(false);
            setEditingOrderId(null);
            setEditingDate(null);
            reloadBusy();
          }}
        />
      )}
      </div>
    </main>
  );
}

/* Модалка редактирования платных допов */
function PaidExtrasEditModal({
  orderId, date, employeeID, org, token, onClose
}: {
  orderId: string;
  date: string;
  employeeID: string;
  org: string;
  token: string;
  onClose: () => void;
}) {
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentExtras, setCurrentExtras] = useState<Array<{ itemId: string; qty: number }>>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Загружаем menu и текущие paid extras
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        setLoading(true);
        
        // Загружаем меню
        const menuUrl = new URL('/api/menu', window.location.origin);
        menuUrl.searchParams.set('date', date);
        menuUrl.searchParams.set('org', org);
        const menuResp = await fetchJSON<{ items?: any[]; records?: any[]; menu?: any[] }>(menuUrl.toString());
        const rows = (menuResp.items ?? menuResp.records ?? menuResp.menu ?? []);
        
        // Преобразуем в MenuItem[]
        const menuItems: MenuItem[] = rows.map((r: any) => ({
          id: r.id || '',
          name: r.name || r.fields?.Name || '',
          description: r.description || r.fields?.Description || '',
          category: r.category || r.fields?.Category || '',
          price: r.price || r.fields?.Price || 0,
        }));
        
        if (!ignore) setMenu(menuItems);

        // Загружаем текущий заказ чтобы получить paidExtras
        const summaryUrl = new URL('/api/hr_orders', window.location.origin);
        summaryUrl.searchParams.set('mode', 'single');
        summaryUrl.searchParams.set('employeeID', employeeID);
        summaryUrl.searchParams.set('org', org);
        summaryUrl.searchParams.set('token', token);
        summaryUrl.searchParams.set('date', date);
        
        const summaryResp = await fetchJSON<SingleResp>(summaryUrl.toString());
        
        if (!ignore && summaryResp.summary?.paidExtras) {
          // Преобразуем из backend формата в формат для модалки
          const extras = summaryResp.summary.paidExtras.map(ex => {
            // Найдем itemId по имени
            const item = menuItems.find(m => m.name === ex.name);
            return {
              itemId: item?.id || '',
              qty: ex.qty,
            };
          }).filter(ex => ex.itemId);
          
          setCurrentExtras(extras);
        }
      } catch (e) {
        if (!ignore) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    
    return () => { ignore = true; };
  }, [date, org, employeeID, token]);

  const handleSave = async (extras: Array<{ itemId: string; qty: number }>) => {
    try {
      setSaving(true);
      setErr('');
      
      // Подготавливаем paidExtras с ценами
      const paidExtrasWithPrice = extras
        .map((ex) => {
          const item = menu.find((m) => m.id === ex.itemId);
          return {
            itemId: ex.itemId,
            qty: ex.qty,
            unitPrice: item?.price || 0,
            chargeToEmployee: true,
          };
        })
        .filter((ex) => ex.qty > 0 && ex.unitPrice > 0);

      const totalAmount = paidExtrasWithPrice.reduce((sum, ex) => sum + (ex.qty * ex.unitPrice), 0);

      // Вызываем order_update только с paidExtras (без изменения основного заказа)
      await fetchJSON('/api/order_update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeID,
          org,
          token,
          orderId,
          date,
          paidExtras: paidExtrasWithPrice.length > 0 ? paidExtrasWithPrice : [],
          hardDelete: true,
        }),
      });

      // Если есть платные допы - создаем платеж и редиректим на оплату
      if (totalAmount > 0) {
        const paymentResp = await fetchJSON<{ ok: boolean; paymentUrl?: string; error?: string }>(
          '/api/payment/create',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId,
              employeeID,
              org,
              token,
              amount: totalAmount,
              description: `Дополнительные блюда к заказу`,
            }),
          }
        );

        if (!paymentResp?.ok || !paymentResp.paymentUrl) {
          throw new Error(paymentResp?.error || 'Не удалось создать платеж');
        }

        // Редирект на страницу оплаты ЮKassa
        window.location.href = paymentResp.paymentUrl;
        return;
      }

      // Если допы удалены (сумма = 0) - просто закрываем
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
        <div className="text-white">Загрузка меню...</div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
        <div className="bg-panel border border-white/10 rounded-2xl p-4 max-w-md">
          <div className="text-red-400 mb-4">{err}</div>
          <Button onClick={onClose}>Закрыть</Button>
        </div>
      </div>
    );
  }

  return (
    <PaidExtrasModal
      menu={menu}
      initialExtras={currentExtras}
      onSave={handleSave}
      onClose={onClose}
    />
  );
}

/* ——— Модалка: состав + действия — всегда остаётся открытой; показывает лоадер, пока тянем детали ——— */
function DateModal({
  iso, employeeID, org, token, info, onClose, onChanged, onOpenPaidModal,
}: {
  iso: string;
  employeeID: string; org: string; token: string;
  info?: SingleResp; onClose: ()=>void; onChanged: ()=>void;
  onOpenPaidModal?: (orderId: string, date: string) => void;
}) {
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState('');
  const [sum, setSum] = useState<SingleResp['summary'] | null>(info?.summary || null);
  const [loading, setLoading] = useState(false);
  const [showCancelSuccess, setShowCancelSuccess] = useState(false);

  // дозагружаем детали, если у нас только «заглушка» (orderId='__has__') или ничего нет
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso, employeeID, org, token]);

  async function cancelOrder() {
    if (!sum?.orderId) return;
    const hasPaidExtras = sum.paidExtras && sum.paidExtras.length > 0;
    const hasSucceededPayment = sum.paymentInfo?.status === 'succeeded';
    
    try {
      setWorking(true); setErr('');
      
      await fetchJSON('/api/order_cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeID, org, token, orderId: sum.orderId, reason: 'user_cancel' })
      });
      
      setWorking(false);
      
      // Если был оплаченный платеж - показываем сообщение о возврате
      if (hasPaidExtras && hasSucceededPayment) {
        setShowCancelSuccess(true);
        setTimeout(() => {
          onClose();
          onChanged();
        }, 3000);
      } else {
        onClose();
        onChanged();
      }
    } catch(e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
      setWorking(false);
    }
  }

  // Экран успешной отмены с возвратом
  if (showCancelSuccess) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/90 p-2 sm:p-6">
        <div className="w-full sm:max-w-lg bg-panel border border-white/10 rounded-2xl p-6 text-center">
          <div className="text-4xl mb-4">✓</div>
          <div className="text-xl font-bold text-white mb-2">Заказ отменен</div>
          <div className="text-white/70 mb-4">
            Средства за дополнительные блюда будут возвращены на ваш счет в течение нескольких минут.
          </div>
          <div className="text-sm text-white/50">
            Переход на главную через 3 секунды...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/90 p-2 sm:p-6">
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
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 mb-3">
                <div><span className="text-white/60">Сотрудник:</span> {sum?.fullName || '—'}</div>
                <div><span className="text-white/60">Meal Box:</span> {sum?.mealBox || '—'}</div>
                <div><span className="text-white/60">Экстра 1:</span> {sum?.extra1 || '—'}</div>
                <div><span className="text-white/60">Экстра 2:</span> {sum?.extra2 || '—'}</div>
              </div>

              {/* Платные допы */}
              {sum.paidExtras && sum.paidExtras.length > 0 && (() => {
                const paymentStatus = sum.paymentInfo?.status || 'unknown';
                const isSucceeded = paymentStatus === 'succeeded';
                const isPending = paymentStatus === 'pending';
                
                const containerClass = isSucceeded
                  ? 'rounded-xl bg-green-900/20 border border-green-500/30 p-3 mb-3'
                  : isPending
                  ? 'rounded-xl bg-yellow-900/20 border border-yellow-500/30 p-3 mb-3'
                  : 'rounded-xl bg-red-900/20 border border-red-500/30 p-3 mb-3';
                
                return (
                  <div className={containerClass}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-white/90 font-semibold">Дополнительные блюда</div>
                      {sum.paymentInfo && (
                        <div className={`text-xs px-2 py-1 rounded ${
                          isSucceeded
                            ? 'bg-green-600/20 text-green-400 border border-green-500/30' 
                            : isPending
                            ? 'bg-yellow-600/20 text-yellow-400 border border-yellow-500/30'
                            : 'bg-red-600/20 text-red-400 border border-red-500/30'
                        }`}>
                          {isSucceeded ? '✓ Оплачено' : 
                           isPending ? '⏳ Ожидает оплаты' : 
                           '✕ Не оплачено'}
                        </div>
                      )}
                    </div>
                  <div className="space-y-1 text-sm">
                    {sum.paidExtras.map((ex, i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-white/80">{ex.name} × {ex.qty}</span>
                        <span className="text-yellow-400 font-semibold">{ex.lineSum} ₽</span>
                      </div>
                    ))}
                  </div>
                    <div className="border-t border-white/10 mt-2 pt-2 flex justify-between font-semibold">
                      <span className="text-white/90">
                        {isSucceeded ? 'Оплачено:' : 'К оплате:'}
                      </span>
                      <span className="text-yellow-400">
                        {sum.paidExtras.reduce((acc, ex) => acc + ex.lineSum, 0)} ₽
                      </span>
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          {!loading && !sum?.orderId && (
            <div className="text-white/70">
              Не удалось получить состав заказа. Вы можете перейти к изменению.
            </div>
          )}

          {err && <div className="text-red-400">{err}</div>}

          <div className="flex flex-wrap gap-2 pt-2">
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

            {sum?.orderId && onOpenPaidModal && (
              <Button
                variant="ghost"
                onClick={() => onOpenPaidModal(sum.orderId, iso)}
                className="!bg-green-600 hover:!bg-green-700 !text-white"
              >
                Доп блюда
              </Button>
            )}

            {/* Кнопка "Оплатить" если допы есть но не оплачены */}
            {sum?.paidExtras && sum.paidExtras.length > 0 && 
             sum.paymentInfo && sum.paymentInfo.status !== 'succeeded' && (
              <Button
                variant="ghost"
                onClick={() => {
                  // Редирект на существующий payment link или создать новый
                  if (sum.paymentInfo?.paymentLink) {
                    window.location.href = sum.paymentInfo.paymentLink;
                  } else if (sum.orderId && onOpenPaidModal) {
                    // Если нет payment link - открываем редактирование допов (создаст новый платеж)
                    onOpenPaidModal(sum.orderId, iso);
                  }
                }}
                className="!bg-yellow-600 hover:!bg-yellow-700 !text-white"
              >
                💳 Оплатить
              </Button>
            )}

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
