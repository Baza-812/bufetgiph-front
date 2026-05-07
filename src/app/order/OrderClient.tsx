// src/app/order/OrderClient.tsx
'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Input, { Field } from '@/components/ui/Input';
import { fetchJSON, fmtDayLabel, MenuItem, friendlyOrderDeadlineMessage } from '@/lib/api';
import HintDates from '@/components/HintDates';
import PaidExtrasModal from '@/components/PaidExtrasModal';

function normOrderStatus(s?: string) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

/** Эмодзи в UI → значение Single select в Airtable MealFeedback.Rating */
const FEEDBACK_OPTIONS: { emoji: string; rating: string }[] = [
  { emoji: '😞', rating: 'Очень плохо' },
  { emoji: '😐', rating: 'Плохо' },
  { emoji: '🙂', rating: 'Нормально' },
  { emoji: '😃', rating: 'Хорошо' },
  { emoji: '🤩', rating: 'Отлично' },
];

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
    /** Значение single select в Airtable (напр. AwaitingPayment, New, Confirmed) */
    orderStatus?: string;
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
  /** Даты с заказом в статусе AwaitingPayment (Ambassador / основной обед без завершённой оплаты) */
  const [awaitingPaymentByDate, setAwaitingPaymentByDate] = useState<Record<string, boolean>>({});
  const [busyReady, setBusyReady] = useState(false); // ← готовность статуса занятости/серости

  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null); // для модалки
  const [error, setError] = useState('');
  
  // информация о сотруднике и организации
  const [employeeName, setEmployeeName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [employeeRole, setEmployeeRole] = useState('');

  // для редактирования платных допов
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [paidModalOpen, setPaidModalOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  
  // для модального окна с инструкцией
  const [showInstructionModal, setShowInstructionModal] = useState(false);

  // для Ambassador программы
  const [pricingPlan, setPricingPlan] = useState<{
    contractType: string;
    fullMealPrice: number;
    lightMealPrice: number;
    teamMinForDelivery: number;
    teamMinForFreeAmbassador: number;
    deliveryAddress: string;
    /** Подпись времени отсечки из Airtable (Cutoff Time), напр. «17:00» */
    cutoffTimeLabel?: string;
    bankInfo?: {
      legalName: string;
      inn: string;
      kpp: string;
      phone: string;
      footer: string;
    };
  } | null>(null);

  const [teamStats, setTeamStats] = useState<Record<string, {
    totalOrders: number;
    paidOrders: number;
    minForDelivery: number;
    minForFreeAmbassador: number;
    deliveryAllowed: boolean;
    ambassadorFree: boolean;
  }>>({});

  const [feedbackEligibleDates, setFeedbackEligibleDates] = useState<string[]>([]);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<Record<string, boolean>>({});
  const [feedbackModalDate, setFeedbackModalDate] = useState<string | null>(null);
  /** idle — креды ещё не готовы; loading — запрос; ok / error — ответ */
  const [feedbackStatus, setFeedbackStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');

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
        const r = await fetchJSON<{ ok: boolean; fullName?: string; role?: string }>(u.toString());
        if (r?.ok) {
          if (r.fullName) setEmployeeName(r.fullName);
          if (r.role) setEmployeeRole(String(r.role).trim());
        }
      } catch {
        // не критично
      }
    })();
  }, [employeeID, org, token]);

  // 3b) загружаем pricing plan для Ambassador организаций
  useEffect(() => {
    if (!org) return;
    (async () => {
      try {
        const r = await fetchJSON<any>(`/api/pricing_plan?org=${encodeURIComponent(org)}`);
        if (r?.ok) {
          setPricingPlan(r);
        }
      } catch (err) {
        console.error('Failed to load pricing plan:', err);
      }
    })();
  }, [org]);

  // 3c) загружаем team stats для Ambassador/TeamMember
  useEffect(() => {
    if (!org || !dates.length) return;
    if (employeeRole !== 'Ambassador' && employeeRole !== 'TeamMember') return;
    if (pricingPlan?.contractType !== 'Ambassador') return;

    (async () => {
      try {
        const statsMap: Record<string, any> = {};
        
        // Загружаем статистику для всех доступных дат
        for (const date of dates) {
          try {
            const r = await fetchJSON<any>(
              `/api/ambassador/team_stats?org=${encodeURIComponent(org)}&date=${date}`
            );
            if (r?.ok && r.stats) {
              statsMap[date] = {
                ...r.stats,
                members: r.stats.members ?? r.members ?? [],
              };
            }
          } catch {
            // Пропускаем ошибки для отдельных дат
          }
        }
        
        setTeamStats(statsMap);
      } catch (err) {
        console.error('Failed to load team stats:', err);
      }
    })();
  }, [org, dates, employeeRole, pricingPlan]);

  const reloadFeedback = useCallback(async () => {
    if (!employeeID || !org || !token) {
      setFeedbackStatus('idle');
      setFeedbackEligibleDates([]);
      setFeedbackSubmitted({});
      return;
    }
    setFeedbackStatus('loading');
    try {
      const u = new URL('/api/feedback', window.location.origin);
      u.searchParams.set('employeeID', employeeID);
      u.searchParams.set('org', org);
      u.searchParams.set('token', token);
      const r = await fetchJSON<{
        ok: boolean;
        eligibleDates?: string[];
        feedbackSubmitted?: Record<string, boolean>;
      }>(u.toString());
      if (r?.ok) {
        const el = r.eligibleDates || [];
        setFeedbackEligibleDates(el);
        // Сохраняем локально true, пока GET ещё не видит новую запись в Airtable (иначе модалка откатывается к форме)
        setFeedbackSubmitted((prev) => {
          const server = r.feedbackSubmitted || {};
          const out: Record<string, boolean> = {};
          for (const d of el) {
            out[d] = Boolean(server[d] || prev[d]);
          }
          return out;
        });
        setFeedbackStatus('ok');
      } else {
        setFeedbackEligibleDates([]);
        setFeedbackSubmitted({});
        setFeedbackStatus('error');
      }
    } catch (e) {
      console.error('[OrderClient] /api/feedback failed:', e);
      setFeedbackEligibleDates([]);
      setFeedbackSubmitted({});
      setFeedbackStatus('error');
    }
  }, [employeeID, org, token]);

  useEffect(() => {
    reloadFeedback();
  }, [reloadFeedback]);

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
      const r = await fetchJSON<{
        ok: boolean;
        busy: Record<string, boolean>;
        awaitingPayment?: Record<string, boolean>;
      }>(`/api/busy?${qs.toString()}`);
      const ap: Record<string, boolean> = {};
      const map: Record<string, SingleResp> = {};
      for (const d of dates) {
        ap[d] = Boolean(r.awaitingPayment?.[d]);
        map[d] = r.busy[d]
          ? { ok: true, summary: { orderId: '__has__', fullName: '', date: d, mealBox: '', extra1: '', extra2: '' } as any }
          : { ok: true, summary: null };
      }
      setAwaitingPaymentByDate(ap);
      setBusy(map);
    } catch {
      const map: Record<string, SingleResp> = {};
      for (const d of dates) map[d] = { ok: false, summary: null };
      setAwaitingPaymentByDate({});
      setBusy(map);
    } finally {
      setBusyReady(true);
    }
  }, [dates, employeeID, org, token]);

  // первичная загрузка busy
  useEffect(() => { reloadBusy(); }, [reloadBusy]);

  // обновлять при возвращении на вкладку (после квиза)
  useEffect(() => {
    const onFocus = () => {
      reloadBusy();
      reloadFeedback();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reloadBusy, reloadFeedback]);

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

  function handlePickFeedbackDate(d: string) {
    if (feedbackSubmitted[d]) return;
    setFeedbackModalDate(d);
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

      {/* Баннер доп. блюд */}
      <div className="mb-4">
        <div className="relative overflow-hidden rounded-2xl mb-3">
          <img
            src="/images/paid-extras-banner.png"
            alt="Дополнительные блюда"
            className="w-full h-auto"
          />
        </div>
        
        {/* Краткая инструкция про доп. блюда */}
        <div className="mt-1 px-2 text-sm text-white/80">
          <p className="mb-2">
            <strong className="text-white">Новая возможность!</strong> Закажите дополнительные блюда к обеду с оплатой онлайн. 
            Выберите любые позиции из меню на этапе подтверждения или добавьте к существующему заказу. 
            Оплата картой через ЮКасса. Возврат средств при отмене - автоматический.
          </p>
          <button
            onClick={() => setShowInstructionModal(true)}
            className="text-yellow-400 hover:text-yellow-300 underline transition-colors"
          >
            Подробнее...
          </button>
        </div>
      </div>

      {/* Блок с ценами и условиями для Ambassador организаций */}
      {pricingPlan?.contractType === 'Ambassador' && (
        <div className="space-y-4">
          <Panel title="Варианты обедов">
            <div className="space-y-3">
              {/* Полный обед */}
              <div className="bg-white/5 p-3 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-white text-lg">Полный обед</span>
                  <span className="text-yellow-400 font-bold text-xl">{pricingPlan.fullMealPrice} ₽</span>
                </div>
                <p className="text-white/70 text-sm">
                  Салат + Суп + Основное блюдо + Гарнир
                </p>
              </div>

              {/* Легкий обед */}
              <div className="bg-white/5 p-3 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-white text-lg">Лёгкий обед</span>
                  <span className="text-yellow-400 font-bold text-xl">{pricingPlan.lightMealPrice} ₽</span>
                </div>
                <p className="text-white/70 text-sm">
                  Салат или Суп + Основное блюдо + Гарнир
                </p>
              </div>

              {/* Условия доставки */}
              <div className="mt-4 p-3 bg-blue-500/10 rounded-lg border border-blue-400/30">
                <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
                  <span>📦</span>
                  <span>Условия доставки</span>
                </h4>
                <ul className="text-sm text-white/70 space-y-1 list-disc list-inside">
                  <li>Минимум <strong className="text-white">{pricingPlan.teamMinForDelivery} оплаченных обедов</strong> для доставки</li>
                  <li>Заказ и оплата до <strong className="text-white">{pricingPlan.cutoffTimeLabel?.trim() || '—'}</strong> накануне доставки</li>
                  <li>Доставка: <strong className="text-white">{pricingPlan.deliveryAddress}</strong></li>
                </ul>
              </div>
            </div>
          </Panel>
        </div>
      )}

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
          
          {/* Кнопка перехода в личный кабинет для Ambassador */}
          {employeeRole === 'Ambassador' && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <Button
                onClick={() => router.push(`/ambassador?org=${org}&employeeID=${employeeID}&token=${token}`)}
                className="w-full"
              >
                <span className="mr-2">👑</span>
                Личный кабинет Амбассадора
              </Button>
            </div>
          )}
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
            const has = Boolean(busy[d]?.summary); // занято, если заказ уже есть
            const awaitingPay = Boolean(awaitingPaymentByDate[d]);
            const label = fmtDayLabel(d);
            const stats = teamStats[d];
            const showStats = pricingPlan?.contractType === 'Ambassador' && 
                             (employeeRole === 'Ambassador' || employeeRole === 'TeamMember');
            const dateBtnClass =
              has && awaitingPay
                ? 'ring-2 ring-amber-400/85 ring-offset-2 ring-offset-zinc-950 bg-amber-950/35 hover:bg-amber-950/45'
                : '';
            const dateTitle = awaitingPay
              ? 'Заказ создан, оплата основного обеда не завершена — откройте день и нажмите «Оплатить»'
              : undefined;
            
            return (
              <div key={d} className="relative">
                <Button
                  onClick={() => handlePickDate(d)}
                  className={`w-full ${dateBtnClass}`}
                  variant={has ? 'ghost' : 'primary'}
                  title={dateTitle}
                  disabled={!busyReady} // ← до загрузки «серости» клики блокируем
                >
                  {label}
                </Button>
                
                {/* Счетчик команды для Ambassador/TeamMember */}
                {showStats && stats && (
                  <div className="mt-1 text-center">
                    <span className={`text-xs font-medium ${
                      stats.paidOrders >= stats.minForDelivery 
                        ? 'text-green-400' 
                        : 'text-yellow-400'
                    }`}>
                      {stats.paidOrders} / {stats.minForDelivery}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!(
          pricingPlan?.contractType === 'Ambassador' &&
          (employeeRole === 'Ambassador' || employeeRole === 'TeamMember')
        ) && <HintDates />}

        {pricingPlan?.contractType === 'Ambassador' &&
          (employeeRole === 'Ambassador' || employeeRole === 'TeamMember') && (
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-white/65">
              <span className="inline-flex items-center gap-2">
                <span className="inline-block h-8 w-10 shrink-0 rounded-xl bg-yellow-400" aria-hidden />
                Свободный день
              </span>
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-block h-8 w-10 shrink-0 rounded-xl bg-white/5 ring-1 ring-white/15"
                  aria-hidden
                />
                Заказ принят (нет незавершённой оплаты)
              </span>
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-block h-8 w-10 shrink-0 rounded-xl bg-amber-950/40 ring-2 ring-amber-400/80"
                  aria-hidden
                />
                Ожидает оплаты основного обеда
              </span>
            </div>
          )}

        {org && employeeID && token && (
          <div className="mt-8 pt-6 border-t border-white/10">
            <p className="text-sm font-semibold text-white mb-2">Оценка обедов</p>

            {feedbackStatus !== 'ok' && feedbackStatus !== 'error' && (
              <div className="text-white/50 text-sm">Загрузка…</div>
            )}

            {feedbackStatus === 'error' && (
              <div className="rounded-lg border border-amber-500/35 bg-amber-950/25 px-3 py-2 text-amber-100/95 text-sm">
                Не удалось загрузить блок оценок. Убедитесь, что задеплоен API с маршрутом{' '}
                <code className="text-xs bg-black/30 px-1 rounded">/api/feedback</code>
                , в Airtable создана таблица MealFeedback (см. MEAL_FEEDBACK_AIRTABLE.md в репозитории API), и откройте консоль браузера (F12) по сообщению об ошибке.
              </div>
            )}

            {feedbackStatus === 'ok' && feedbackEligibleDates.length === 0 && (
              <p className="text-white/55 text-sm leading-relaxed">
                Здесь появятся до пяти последних дней, на которые у вас был заказ и уже закрыт приём заказов на эти дни.
                Если все ваши обеды ещё в «открытом» календаре выше, оценить пока нечего.
              </p>
            )}

            {feedbackStatus === 'ok' && feedbackEligibleDates.length > 0 && (
              <>
                <p className="text-sm text-white/75 mb-3">
                  Оцените недавние обеды — это займёт несколько секунд.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {feedbackEligibleDates.map((d) => {
                    const done = Boolean(feedbackSubmitted[d]);
                    const label = fmtDayLabel(d);
                    return (
                      <div key={`fb-${d}`} className="relative">
                        <Button
                          type="button"
                          onClick={() => handlePickFeedbackDate(d)}
                          className={`w-full ${
                            done
                              ? '!ring-2 !ring-green-500/70 !bg-green-950/30 !text-white/85 cursor-not-allowed'
                              : 'bg-white/10 text-white/90 hover:bg-white/15'
                          }`}
                          variant="ghost"
                          disabled={done}
                          title={done ? 'Оценка уже отправлена' : 'Оставить отзыв об обеде'}
                        >
                          <span className="flex items-center justify-center gap-1.5">
                            {label}
                            {done && (
                              <span className="text-green-400 font-semibold shrink-0" aria-hidden>
                                ✓
                              </span>
                            )}
                          </span>
                        </Button>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs text-white/45">
                  Кнопки ниже основного календаря — для дней, на которые приём заказов уже закрыт. Можно отправить только оценку, без текста.
                </p>
              </>
            )}
          </div>
        )}
      </Panel>

      {feedbackModalDate && (
        <MealFeedbackModal
          iso={feedbackModalDate}
          employeeID={employeeID}
          org={org}
          token={token}
          alreadySubmitted={Boolean(feedbackSubmitted[feedbackModalDate])}
          onClose={() => setFeedbackModalDate(null)}
          onSuccess={(dateIso) => {
            setFeedbackSubmitted((prev) => ({ ...prev, [dateIso]: true }));
            reloadFeedback();
          }}
        />
      )}

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

      {/* Модальное окно с инструкцией по дополнительным блюдам */}
      {showInstructionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90">
          <div className="bg-zinc-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Заголовок */}
            <div className="sticky top-0 bg-zinc-900 border-b border-white/10 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Инструкция: Как заказать дополнительные блюда</h2>
              <button
                onClick={() => setShowInstructionModal(false)}
                className="text-white/60 hover:text-white text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* Контент инструкции */}
            <div className="px-6 py-4 space-y-6 text-white/90">
              {/* Что это? */}
              <section>
                <h3 className="text-lg font-semibold text-white mb-2">Что это?</h3>
                <p className="text-sm">
                  Теперь вы можете заказать любые дополнительные блюда из меню сверх корпоративного набора. 
                  Дополнительные блюда оплачиваются онлайн банковской картой через безопасный сервис ЮКасса.
                </p>
              </section>

              {/* Как добавить */}
              <section>
                <h3 className="text-lg font-semibold text-white mb-2">Как добавить дополнительные блюда?</h3>
                
                <div className="space-y-4 text-sm">
                  <div>
                    <h4 className="font-semibold text-white mb-1">Вариант 1: При создании нового заказа</h4>
                    <ol className="list-decimal list-inside space-y-1 ml-2">
                      <li>Пройдите стандартный квиз выбора обеда (meal box, салат, суп и т.д.)</li>
                      <li>На последнем шаге подтверждения нажмите <span className="text-yellow-400">"+ Добавить блюда дополнительно"</span></li>
                      <li>Выберите нужные блюда из меню и укажите количество</li>
                      <li>Нажмите <span className="text-yellow-400">"Готово"</span> - вы вернетесь к подтверждению заказа</li>
                      <li>Проверьте состав и сумму, нажмите <span className="text-yellow-400">"Оплатить и подтвердить"</span></li>
                      <li>Вы будете перенаправлены на страницу оплаты ЮКасса</li>
                      <li>Оплатите заказ картой - после оплаты вас вернет обратно</li>
                    </ol>
                  </div>

                  <div>
                    <h4 className="font-semibold text-white mb-1">Вариант 2: Добавить к существующему заказу</h4>
                    <ol className="list-decimal list-inside space-y-1 ml-2">
                      <li>Выберите дату, на которую уже оформлен заказ</li>
                      <li>В открывшемся окне нажмите <span className="text-green-400">"Доп блюда"</span></li>
                      <li>Выберите дополнительные блюда и количество</li>
                      <li>Нажмите <span className="text-yellow-400">"Сохранить и оплатить"</span></li>
                      <li>Оплатите через ЮКасса</li>
                    </ol>
                  </div>
                </div>
              </section>

              {/* Статус оплаты */}
              <section>
                <h3 className="text-lg font-semibold text-white mb-2">Как посмотреть статус оплаты?</h3>
                <p className="text-sm mb-2">
                  Откройте модальное окно заказа - блок "Дополнительные блюда" будет подсвечен:
                </p>
                <ul className="text-sm space-y-1 ml-4">
                  <li><span className="text-green-400">🟢 Зеленая рамка</span> - успешно оплачено</li>
                  <li><span className="text-yellow-400">🟡 Желтая рамка</span> - ожидает оплаты</li>
                  <li><span className="text-red-400">🔴 Красная рамка</span> - оплата не прошла</li>
                </ul>
                <p className="text-sm mt-2">
                  Для неоплаченных допов доступна кнопка <span className="text-yellow-400">"Оплатить"</span> для повторной попытки.
                </p>
              </section>

              {/* Отмена */}
              <section>
                <h3 className="text-lg font-semibold text-white mb-2">Как отменить заказ с дополнительными блюдами?</h3>
                <ol className="list-decimal list-inside space-y-1 ml-2 text-sm">
                  <li>Откройте модальное окно заказа</li>
                  <li>Нажмите <span className="text-red-400">"Отменить"</span></li>
                  <li>Если дополнительные блюда были оплачены, средства будут <strong>автоматически возвращены</strong> на вашу карту в течение нескольких минут</li>
                  <li>Вы увидите уведомление об отмене и возврате средств</li>
                </ol>
              </section>

              {/* Отмена в ЮКасса */}
              <section>
                <h3 className="text-lg font-semibold text-white mb-2">Что делать если отменили оплату в ЮКасса?</h3>
                <p className="text-sm">
                  Если вы нажали "Отменить" на странице оплаты ЮКасса:
                </p>
                <ul className="list-disc list-inside space-y-1 ml-4 text-sm mt-2">
                  <li>Основной корпоративный заказ будет сохранен</li>
                  <li>Дополнительные блюда будут в статусе "Ожидает оплаты"</li>
                  <li>Вы сможете вернуться и оплатить их позже через кнопку <span className="text-yellow-400">"Оплатить"</span></li>
                </ul>
              </section>

              {/* Ограничения */}
              <section>
                <h3 className="text-lg font-semibold text-white mb-2">Ограничения по времени</h3>
                <p className="text-sm">
                  Заказ дополнительных блюд доступен до <strong>22:00 текущего дня</strong> (как и изменение основного заказа).
                </p>
              </section>

              {/* Безопасность */}
              <section>
                <h3 className="text-lg font-semibold text-white mb-2">Безопасность</h3>
                <p className="text-sm">
                  Оплата производится через <strong>ЮКасса</strong> - официальный платежный сервис от Сбербанка. 
                  Мы не храним данные ваших карт. Все транзакции защищены по стандартам PCI DSS.
                </p>
              </section>
            </div>

            {/* Футер с кнопкой закрытия */}
            <div className="sticky bottom-0 bg-zinc-900 border-t border-white/10 px-6 py-4">
              <button
                onClick={() => setShowInstructionModal(false)}
                className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-semibold py-3 rounded-xl transition-colors"
              >
                Понятно
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Футер с контактами для Ambassador организаций */}
      {pricingPlan?.contractType === 'Ambassador' && pricingPlan.bankInfo && (
        <div className="mt-8 border-t border-white/10 pt-6">
          <Panel title="Контакты и реквизиты">
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-white/60">Организация:</span>{' '}
                <span className="text-white font-medium">{pricingPlan.bankInfo.legalName}</span>
              </div>
              <div className="flex gap-6 flex-wrap">
                <div>
                  <span className="text-white/60">ИНН:</span>{' '}
                  <span className="text-white">{pricingPlan.bankInfo.inn}</span>
                </div>
                {pricingPlan.bankInfo.kpp && (
                  <div>
                    <span className="text-white/60">КПП:</span>{' '}
                    <span className="text-white">{pricingPlan.bankInfo.kpp}</span>
                  </div>
                )}
              </div>
              <div>
                <span className="text-white/60">Телефон:</span>{' '}
                <span className="text-white">{pricingPlan.bankInfo.phone}</span>
              </div>
              {pricingPlan.bankInfo.footer && (
                <div className="mt-3 pt-3 border-t border-white/10 text-white/70">
                  {pricingPlan.bankInfo.footer}
                </div>
              )}
            </div>
          </Panel>
        </div>
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
      const raw = e instanceof Error ? e.message : String(e);
      setErr(friendlyOrderDeadlineMessage(raw));
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
        console.log('[DateModal] hr_orders response:', JSON.stringify(r?.summary, null, 2));
        console.log('[DateModal] paymentInfo:', r?.summary?.paymentInfo);
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
              {normOrderStatus(sum.orderStatus) === 'awaitingpayment' && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-amber-100/95 text-sm">
                  <div className="font-semibold mb-0.5">Ожидает оплаты основного обеда</div>
                  <div className="text-amber-100/80 text-xs">
                    Заказ сохранён, но оплата не завершена (например, вы вышли из окна ЮKassa). Завершите оплату кнопкой ниже или через «Изменить», если ссылка недоступна.
                  </div>
                  {!(sum.paymentInfo?.paymentLink) && (
                    <div className="mt-2 text-xs text-amber-200/90">
                      Ссылки на оплату пока нет в системе — откройте «Изменить» и снова нажмите подтверждение: будет создан платёж и редирект в ЮKassa.
                    </div>
                  )}
                </div>
              )}
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
                
                console.log('[DateModal] Rendering paid extras. paymentStatus:', paymentStatus, 'isSucceeded:', isSucceeded, 'isPending:', isPending);
                
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

            {(() => {
              if (!sum) return null;
              const mainAwaiting = normOrderStatus(sum.orderStatus) === 'awaitingpayment';
              const pay = sum.paymentInfo;
              const payIncomplete = pay && pay.status !== 'succeeded';
              const hasLink = Boolean(pay?.paymentLink);
              const extrasPending =
                (sum.paidExtras?.length ?? 0) > 0 && payIncomplete && hasLink;
              const mainPending = mainAwaiting && payIncomplete && hasLink;
              const showPay = extrasPending || mainPending;

              if (!showPay) return null;

              return (
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (pay?.paymentLink) {
                      window.location.href = pay.paymentLink;
                    } else if (sum.orderId && onOpenPaidModal) {
                      onOpenPaidModal(sum.orderId, iso);
                    }
                  }}
                  className="!bg-yellow-600 hover:!bg-yellow-700 !text-white"
                >
                  💳 Оплатить
                </Button>
              );
            })()}

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

function MealFeedbackModal({
  iso,
  employeeID,
  org,
  token,
  alreadySubmitted,
  onClose,
  onSuccess,
}: {
  iso: string;
  employeeID: string;
  org: string;
  token: string;
  alreadySubmitted: boolean;
  onClose: () => void;
  onSuccess: (dateIso: string) => void;
}) {
  const thanksTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleModalClose = useCallback(() => {
    if (thanksTimerRef.current) {
      clearTimeout(thanksTimerRef.current);
      thanksTimerRef.current = null;
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (thanksTimerRef.current) {
        clearTimeout(thanksTimerRef.current);
        thanksTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (thanksTimerRef.current) {
      clearTimeout(thanksTimerRef.current);
      thanksTimerRef.current = null;
    }
    setStep(alreadySubmitted ? 'thanks' : 'form');
    setSelectedRating(null);
    setComment('');
    setErr('');
    setSending(false);
  }, [iso, alreadySubmitted]);

  async function submit() {
    if (!selectedRating) return;
    setSending(true);
    setErr('');
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeID,
          org,
          token,
          date: iso,
          rating: selectedRating,
          comment: comment.trim() || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || `Ошибка ${res.status}`);
      }
      onSuccess(iso);
      setStep('thanks');
      thanksTimerRef.current = window.setTimeout(() => {
        thanksTimerRef.current = null;
        onClose();
      }, 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/90 p-2 sm:p-6">
      <div className="w-full sm:max-w-md bg-panel border border-white/10 rounded-2xl p-4 shadow-xl">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="text-xs text-white/50 uppercase tracking-wide">Обед на дату</div>
            <div className="text-lg font-bold text-white">{fmtDayLabel(iso)}</div>
          </div>
          <button type="button" onClick={handleModalClose} className="text-white/60 hover:text-white text-sm shrink-0">
            Закрыть
          </button>
        </div>

        {step === 'thanks' ? (
          <div className="py-4 text-center space-y-4">
            <div className="text-4xl" aria-hidden>✓</div>
            <p className="text-white text-base leading-relaxed">
              Спасибо! Вы помогаете нам стать лучше.
            </p>
            <p className="text-white/45 text-xs">Окно закроется через пару секунд…</p>
            <Button type="button" onClick={handleModalClose} className="w-full" variant="ghost">
              Закрыть сейчас
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-white/90 text-sm font-medium">Как вам обед?</p>

            <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
              {FEEDBACK_OPTIONS.map(({ emoji, rating }) => {
                const isSel = selectedRating === rating;
                return (
                  <button
                    key={rating}
                    type="button"
                    onClick={() => setSelectedRating(rating)}
                    className={`text-3xl sm:text-4xl leading-none p-3 rounded-2xl transition border-2 ${
                      isSel
                        ? 'border-yellow-400 bg-yellow-400/15 scale-105 shadow-lg ring-2 ring-yellow-400/50'
                        : 'border-transparent bg-white/5 hover:bg-white/10'
                    }`}
                    title={rating}
                    aria-label={rating}
                    aria-pressed={isSel}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>

            <div>
              <label className="block text-xs text-white/50 mb-1.5">
                По желанию: что понравилось или что улучшить
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, 300))}
                maxLength={300}
                rows={3}
                placeholder="Можно оставить пустым"
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:outline-none focus:ring-2 focus:ring-yellow-400/40 resize-y min-h-[88px]"
              />
              <div className="text-right text-xs text-white/40 mt-0.5">{comment.length}/300</div>
            </div>

            {err && <div className="text-red-400 text-sm">{err}</div>}

            <Button
              type="button"
              onClick={submit}
              disabled={!selectedRating || sending}
              className="w-full"
            >
              {sending ? 'Отправка…' : 'Отправить'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
