// src/app/order/quiz/QuizClient.tsx
'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Input, { Field } from '@/components/ui/Input';
import { fetchJSON, fmtDayLabel } from '@/lib/api';

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  category: string;
  allergens?: string[];
  photoUrl?: string;
}

interface OrgMeta {
  ok: boolean;
  vidDogovora?: string;
  minTeamSize?: number | null;
  freeDeliveryMinOrders?: number | null;
  priceFull?: number | null;
  priceLight?: number | null;
  bank?: {
    name: string;
    legalName: string;
    bankName: string;
    inn: string;
    kpp: string;
    account: string;
    bic: string;
    contactPhone?: string;
    contactEmail?: string;
    footerText?: string;
    acquiringProvider?: string;
  } | null;
}

interface EmployeeMeta {
  ok: boolean;
  employeeID: string;
  role: string;
  fullName: string;
  organization: string;
}

export default function QuizClient() {
  const router = useRouter();
  const sp = useSearchParams();

  const dateISO = sp.get('date') || '';
  const stepStr = sp.get('step') || '1';
  const org = sp.get('org') || '';
  const employeeID = sp.get('employeeID') || '';
  const token = sp.get('token') || '';
  const orderId = sp.get('orderId') || '';

  const [step, setStep] = useState(parseInt(stepStr, 10) || 1);

  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [mealBox, setMealBox] = useState('');
  const [extra1, setExtra1] = useState('');
  const [extra2, setExtra2] = useState('');

  const [orgMeta, setOrgMeta] = useState<OrgMeta | null>(null);
  const [employeeMeta, setEmployeeMeta] = useState<EmployeeMeta | null>(null);
  const [tariffCode, setTariffCode] = useState<'Full' | 'Light'>('Full');
  const [paymentMethod, setPaymentMethod] = useState<'Online' | 'Cash'>('Online');

  // Загрузка метаданных организации
  useEffect(() => {
    (async () => {
      if (!org) return;
      try {
        const r = await fetchJSON<OrgMeta>(`/api/org_meta?org=${encodeURIComponent(org)}`);
        if (r.ok) setOrgMeta(r);
      } catch (e) {
        console.error('Failed to load org meta:', e);
      }
    })();
  }, [org]);

  // Загрузка метаданных сотрудника
  useEffect(() => {
    (async () => {
      if (!employeeID || !org || !token) return;
      try {
        const r = await fetchJSON<EmployeeMeta>(
          `/api/employee_meta?employeeID=${encodeURIComponent(employeeID)}&org=${encodeURIComponent(org)}&token=${encodeURIComponent(token)}`
        );
        if (r.ok) setEmployeeMeta(r);
      } catch (e) {
        console.error('Failed to load employee meta:', e);
      }
    })();
  }, [employeeID, org, token]);

  // Загрузка меню
  useEffect(() => {
    (async () => {
      if (!dateISO || !org) return;
      try {
        setLoading(true); setError('');
        const r = await fetchJSON<{ ok: boolean; menu: MenuItem[] }>(
          `/api/menu?date=${encodeURIComponent(dateISO)}&org=${encodeURIComponent(org)}`
        );
        setMenu(r.menu || []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [dateISO, org]);

  const mealBoxes = useMemo(() => menu.filter(m => m.category === 'MealBox'), [menu]);
  const extras = useMemo(() => menu.filter(m => m.category === 'Extra'), [menu]);

  const isStarshiy = orgMeta?.vidDogovora === 'Starshiy';
  const role = employeeMeta?.role || 'Employee';

  async function handleSubmit() {
    if (!mealBox) {
      setError('Выберите Meal Box');
      return;
    }
    try {
      setLoading(true); setError('');

      let employeePayableAmount: number | undefined;
      if (isStarshiy && role === 'Komanda') {
        employeePayableAmount = tariffCode === 'Full' ? (orgMeta?.priceFull || 0) : (orgMeta?.priceLight || 0);
      }

      const body: any = {
        employeeID, org, token, date: dateISO,
        mealBox, extra1, extra2,
      };

      if (isStarshiy) {
        body.tariffCode = tariffCode;
        body.programType = 'Starshiy';
        if (employeePayableAmount !== undefined) {
          body.employeePayableAmount = employeePayableAmount;
        }
      }

      if (orderId) body.orderId = orderId;

      const endpoint = orderId ? '/api/order_update' : '/api/order';
      const r = await fetchJSON<{
        ok: boolean;
        orderId?: string;
        error?: string;
      }>(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!r.ok) throw new Error(r.error || 'Не удалось создать/обновить заказ');

      const finalOrderId = r.orderId || orderId;
      const needsPayment = isStarshiy && role === 'Komanda' && employeePayableAmount && employeePayableAmount > 0;

      if (needsPayment && paymentMethod === 'Online') {
        const payRes = await fetchJSON<{
          ok: boolean;
          paymentLink?: string;
          error?: string;
        }>('/api/payment_create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeID, org, token,
            orderIds: [finalOrderId],
            amount: employeePayableAmount,
            paymentMethod: 'Online',
          }),
        });

        if (payRes.ok && payRes.paymentLink) {
          window.location.href = payRes.paymentLink;
          return;
        }
      }

      const u = new URL('/order', window.location.origin);
      u.searchParams.set('org', org);
      u.searchParams.set('employeeID', employeeID);
      u.searchParams.set('token', token);
      router.push(u.toString());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const selectedMealBoxItem = mealBoxes.find(m => m.id === mealBox);
  const selectedExtra1Item = extras.find(m => m.id === extra1);
  const selectedExtra2Item = extras.find(m => m.id === extra2);

  const employeePayableAmount = useMemo(() => {
    if (!isStarshiy || role !== 'Komanda') return undefined;
    return tariffCode === 'Full' ? (orgMeta?.priceFull || 0) : (orgMeta?.priceLight || 0);
  }, [isStarshiy, role, tariffCode, orgMeta]);

  return (
    <main>
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
        <Panel title={`Заказ на ${fmtDayLabel(dateISO)}`}>
          <p className="text-white/80 text-sm">
            {orderId ? 'Изменение существующего заказа' : 'Создание нового заказа'}
          </p>
        </Panel>

        {/* Информация о сотруднике */}
        {employeeMeta && (
          <Panel title="Информация о сотруднике">
            <div className="space-y-1 text-sm text-white/80">
              <p><strong>Сотрудник:</strong> {employeeMeta.fullName}</p>
              <p><strong>Роль:</strong> {role}</p>
            </div>
          </Panel>
        )}

        {/* Выбор тарифа для программы «Старший» */}
        {isStarshiy && role === 'Komanda' && orgMeta && (
          <Panel title="Выбор тарифа">
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => setTariffCode('Full')}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    tariffCode === 'Full'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="font-bold text-lg">Полный обед</div>
                  <div className="text-2xl font-bold text-blue-400 mt-1">{orgMeta.priceFull} ₽</div>
                  <div className="text-xs text-white/60 mt-2">Основное блюдо + гарнир + салат + напиток</div>
                </button>

                <button
                  onClick={() => setTariffCode('Light')}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    tariffCode === 'Light'
                      ? 'border-green-500 bg-green-500/10'
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="font-bold text-lg">Лёгкий обед</div>
                  <div className="text-2xl font-bold text-green-400 mt-1">{orgMeta.priceLight} ₽</div>
                  <div className="text-xs text-white/60 mt-2">Салат + напиток</div>
                </button>
              </div>

              {employeePayableAmount !== undefined && (
                <div className="text-center p-3 bg-white/5 rounded-xl border border-white/10">
                  <span className="text-white/60">Сумма к оплате:</span>{' '}
                  <span className="font-bold text-xl text-white">{employeePayableAmount} ₽</span>
                </div>
              )}
            </div>
          </Panel>
        )}

        {/* Выбор способа оплаты */}
        {isStarshiy && role === 'Komanda' && employeePayableAmount && employeePayableAmount > 0 && (
          <Panel title="Способ оплаты">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => setPaymentMethod('Online')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  paymentMethod === 'Online'
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-white/10 bg-white/5 hover:border-white/20'
                }`}
              >
                <div className="font-bold">Онлайн-оплата</div>
                <div className="text-xs text-white/60 mt-1">Банковская карта</div>
              </button>

              <button
                onClick={() => setPaymentMethod('Cash')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  paymentMethod === 'Cash'
                    ? 'border-yellow-500 bg-yellow-500/10'
                    : 'border-white/10 bg-white/5 hover:border-white/20'
                }`}
              >
                <div className="font-bold">Наличные</div>
                <div className="text-xs text-white/60 mt-1">Оплата при получении</div>
              </button>
            </div>
          </Panel>
        )}

        {loading && <div className="text-white/60 text-sm">Загрузка меню…</div>}
        {error && <div className="text-red-400 text-sm mb-4">{error}</div>}

        {step === 1 && (
          <Panel title="1. Выберите Meal Box">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {mealBoxes.map(item => (
                <MenuCard
                  key={item.id}
                  item={item}
                  selected={mealBox === item.id}
                  onSelect={() => setMealBox(item.id)}
                />
              ))}
            </div>
            {mealBoxes.length === 0 && !loading && (
              <div className="text-white/60 text-sm">Нет доступных Meal Box на эту дату.</div>
            )}
            <div className="flex gap-3 mt-4">
              <Button onClick={() => setStep(2)} disabled={!mealBox}>
                Далее
              </Button>
              <Button variant="ghost" onClick={() => router.back()}>
                Назад
              </Button>
            </div>
          </Panel>
        )}

        {step === 2 && (
          <Panel title="2. Выберите Extra 1 (опционально)">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {extras.map(item => (
                <MenuCard
                  key={item.id}
                  item={item}
                  selected={extra1 === item.id}
                  onSelect={() => setExtra1(item.id)}
                />
              ))}
            </div>
            {extras.length === 0 && !loading && (
              <div className="text-white/60 text-sm">Нет доступных Extra на эту дату.</div>
            )}
            <div className="flex gap-3 mt-4">
              <Button onClick={() => setStep(3)}>Далее</Button>
              <Button variant="ghost" onClick={() => setStep(1)}>
                Назад
              </Button>
            </div>
          </Panel>
        )}

        {step === 3 && (
          <Panel title="3. Выберите Extra 2 (опционально)">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {extras.map(item => (
                <MenuCard
                  key={item.id}
                  item={item}
                  selected={extra2 === item.id}
                  onSelect={() => setExtra2(item.id)}
                />
              ))}
            </div>
            {extras.length === 0 && !loading && (
              <div className="text-white/60 text-sm">Нет доступных Extra на эту дату.</div>
            )}
            <div className="flex gap-3 mt-4">
              <Button onClick={() => setStep(4)}>Далее</Button>
              <Button variant="ghost" onClick={() => setStep(2)}>
                Назад
              </Button>
            </div>
          </Panel>
        )}

        {step === 4 && (
          <Panel title="4. Подтверждение">
            <div className="space-y-3">
              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <div className="font-bold mb-2">Ваш заказ:</div>
                <div className="space-y-1 text-sm">
                  <div>
                    <span className="text-white/60">Meal Box:</span>{' '}
                    {selectedMealBoxItem?.name || '—'}
                  </div>
                  <div>
                    <span className="text-white/60">Extra 1:</span>{' '}
                    {selectedExtra1Item?.name || '—'}
                  </div>
                  <div>
                    <span className="text-white/60">Extra 2:</span>{' '}
                    {selectedExtra2Item?.name || '—'}
                  </div>
                  {isStarshiy && (
                    <>
                      <div className="mt-2 pt-2 border-t border-white/10">
                        <span className="text-white/60">Тариф:</span>{' '}
                        <span className="font-semibold">
                          {tariffCode === 'Full' ? 'Полный обед' : 'Лёгкий обед'}
                        </span>
                      </div>
                      {employeePayableAmount !== undefined && (
                        <div>
                          <span className="text-white/60">Сумма к оплате:</span>{' '}
                          <span className="font-bold text-lg">{employeePayableAmount} ₽</span>
                        </div>
                      )}
                      {employeePayableAmount && employeePayableAmount > 0 && (
                        <div>
                          <span className="text-white/60">Способ оплаты:</span>{' '}
                          <span className="font-semibold">
                            {paymentMethod === 'Online' ? 'Онлайн-оплата' : 'Наличные'}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {error && <div className="text-red-400 text-sm">{error}</div>}

              <div className="flex gap-3">
                <Button onClick={handleSubmit} disabled={loading}>
                  {loading ? 'Отправка…' : orderId ? 'Сохранить изменения' : 'Подтвердить заказ'}
                </Button>
                <Button variant="ghost" onClick={() => setStep(3)}>
                  Назад
                </Button>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </main>
  );
}

function MenuCard({
  item,
  selected,
  onSelect,
}: {
  item: MenuItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`
        relative rounded-xl border-2 p-4 text-left transition-all
        ${selected ? 'border-blue-500 bg-blue-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}
      `}
    >
      {item.photoUrl && (
        <img
          src={item.photoUrl}
          alt={item.name}
          className="w-full h-32 object-cover rounded-lg mb-3"
        />
      )}
      <div className="font-bold">{item.name}</div>
      {item.description && (
        <div className="text-xs text-white/60 mt-1">{item.description}</div>
      )}
      {item.allergens && item.allergens.length > 0 && (
        <div className="text-xs text-yellow-400 mt-2">
          Аллергены: {item.allergens.join(', ')}
        </div>
      )}
      {selected && (
        <div className="absolute top-2 right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </div>
      )}
    </button>
  );
}
