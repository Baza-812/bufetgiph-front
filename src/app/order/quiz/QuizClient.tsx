'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';

interface MenuItem {
  id: string;
  fields: {
    Name?: string;
    Category?: string;
    Description?: string;
    Photo?: Array<{ url: string }>;
  };
}

interface OrgMeta {
  vidDogovora: string;
  priceFull: number | null;
  priceLight: number | null;
}

interface EmployeeMeta {
  role: string;
}

export default function QuizClient() {
  const sp = useSearchParams();
  const router = useRouter();

  const org = sp.get('org') || '';
  const employeeID = sp.get('employeeID') || '';
  const token = sp.get('token') || '';
  const dateParam = sp.get('date') || '';
  const orderIdParam = sp.get('orderId') || '';

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState('');

  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [mains, setMains] = useState<MenuItem[]>([]);
  const [sides, setSides] = useState<MenuItem[]>([]);
  const [extras, setExtras] = useState<MenuItem[]>([]);

  const [selectedMain, setSelectedMain] = useState('');
  const [selectedSide, setSelectedSide] = useState('');
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);

  const [tariffCode, setTariffCode] = useState<'Full' | 'Light'>('Full');

  const [submitting, setSubmitting] = useState(false);

  const [orgMeta, setOrgMeta] = useState<OrgMeta | null>(null);
  const [employeeMeta, setEmployeeMeta] = useState<EmployeeMeta | null>(null);

  useEffect(() => {
    if (!org || !employeeID || !token) {
      setError('Отсутствуют параметры org, employeeID или token');
      setLoading(false);
      return;
    }

    Promise.all([
      fetchOrgMeta(),
      fetchEmployeeMeta(),
      fetchDates(),
    ]).finally(() => setLoading(false));
  }, [org, employeeID, token]);

  useEffect(() => {
    if (dateParam && dates.includes(dateParam)) {
      setSelectedDate(dateParam);
      setStep(2);
    }
  }, [dateParam, dates]);

  useEffect(() => {
    if (selectedDate) {
      fetchMenu(selectedDate);
    }
  }, [selectedDate]);

  async function fetchOrgMeta() {
    try {
      const res = await fetch(`/api/org_meta?org=${org}`);
      if (!res.ok) throw new Error('Не удалось загрузить метаданные организации');
      const data = await res.json();
      if (data.ok) setOrgMeta(data);
    } catch (e: any) {
      console.error('fetchOrgMeta error:', e);
    }
  }

  async function fetchEmployeeMeta() {
    try {
      const res = await fetch(`/api/employee_meta?employeeID=${employeeID}&org=${org}&token=${token}`);
      if (!res.ok) throw new Error('Не удалось загрузить метаданные сотрудника');
      const data = await res.json();
      if (data.ok) setEmployeeMeta(data);
    } catch (e: any) {
      console.error('fetchEmployeeMeta error:', e);
    }
  }

  async function fetchDates() {
    try {
      const res = await fetch(`/api/dates?org=${org}`);
      if (!res.ok) throw new Error('Не удалось загрузить даты');
      const data = await res.json();
      if (data.ok && Array.isArray(data.dates)) {
        setDates(data.dates);
      }
    } catch (e: any) {
      setError(e.message || 'Ошибка загрузки дат');
    }
  }

  async function fetchMenu(date: string) {
    try {
      const res = await fetch(`/api/menu?org=${org}&date=${date}`);
      if (!res.ok) throw new Error('Не удалось загрузить меню');
      const data = await res.json();
      if (data.ok && Array.isArray(data.menu)) {
        setMenu(data.menu);
        setMains(data.menu.filter((m: MenuItem) => m.fields.Category === 'Main'));
        setSides(data.menu.filter((m: MenuItem) => m.fields.Category === 'Side'));
        setExtras(data.menu.filter((m: MenuItem) => m.fields.Category === 'Extra'));
      }
    } catch (e: any) {
      setError(e.message || 'Ошибка загрузки меню');
    }
  }

  async function handleSubmit(paymentMethod: 'Online' | 'Cash' | null) {
    if (!selectedMain) {
      alert('Выберите основное блюдо');
      return;
    }

    setSubmitting(true);

    try {
      const body: any = {
        employeeID,
        org,
        token,
        date: selectedDate,
        included: {
          mainId: selectedMain,
          sideId: selectedSide || null,
          extras: selectedExtras,
        },
        tariffCode,
        clientToken: `${Date.now()}_${Math.random()}`,
      };

      if (paymentMethod) {
        body.paymentMethod = paymentMethod;
      }

      const endpoint = orderIdParam ? '/api/order_update' : '/api/order';
      if (orderIdParam) body.orderId = orderIdParam;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Не удалось создать/обновить заказ');
      const data = await res.json();

      if (data.ok) {
        // Если статус AwaitingPayment и метод Online — создаём платёж
        if (data.orderStatus === 'AwaitingPayment' && paymentMethod === 'Online') {
          const payRes = await fetch('/api/payment_create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employeeID,
              org,
              token,
              orderIds: [data.orderId],
              amount: data.employeePayableAmount || 0,
              paymentMethod: 'Online',
            }),
          });

          if (!payRes.ok) throw new Error('Не удалось создать платёж');
          const payData = await payRes.json();

          if (payData.ok && payData.paymentLink) {
            window.location.href = payData.paymentLink;
            return;
          }
        }

        alert(orderIdParam ? 'Заказ обновлён!' : 'Заказ создан!');
        router.push(`/order?org=${org}&employeeID=${employeeID}&token=${token}`);
      } else {
        throw new Error(data.error || 'Ошибка создания заказа');
      }
    } catch (e: any) {
      alert(e.message || 'Ошибка создания заказа');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <Panel><p>Загрузка...</p></Panel>;
  if (error) return <Panel><p className="text-red-600">{error}</p></Panel>;

  const isStarshiy = orgMeta?.vidDogovora === 'Starshiy';
  const role = employeeMeta?.role || 'Employee';
  const isKomanda = role === 'Komanda';
  const isAmbassador = role === 'Ambassador';

  const currentPrice = isStarshiy && isKomanda
    ? (tariffCode === 'Light' ? orgMeta?.priceLight : orgMeta?.priceFull)
    : null;

  // Шаг 1: Выбор даты
  if (step === 1) {
    return (
      <Panel>
        <h1 className="text-2xl font-bold mb-4">Выберите дату</h1>
        {dates.length === 0 ? (
          <p className="text-gray-600">Нет доступных дат для заказа.</p>
        ) : (
          <div className="space-y-2">
            {dates.map((date) => (
              <Button
                key={date}
                onClick={() => {
                  setSelectedDate(date);
                  setStep(2);
                }}
                className="w-full"
              >
                {date}
              </Button>
            ))}
          </div>
        )}
      </Panel>
    );
  }

  // Шаг 2: Выбор основного блюда
  if (step === 2) {
    return (
      <Panel>
        <h1 className="text-2xl font-bold mb-4">Выберите основное блюдо</h1>
        <p className="text-gray-600 mb-4">Дата: {selectedDate}</p>

        {mains.length === 0 ? (
          <p className="text-gray-600">Нет доступных основных блюд.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {mains.map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  setSelectedMain(item.id);
                  setStep(3);
                }}
                className={`border rounded p-4 cursor-pointer hover:bg-blue-50 ${
                  selectedMain === item.id ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                }`}
              >
                {item.fields.Photo?.[0]?.url && (
                  <img
                    src={item.fields.Photo[0].url}
                    alt={item.fields.Name || ''}
                    className="w-full h-40 object-cover rounded mb-2"
                  />
                )}
                <h3 className="font-semibold">{item.fields.Name || 'Без названия'}</h3>
                {item.fields.Description && (
                  <p className="text-sm text-gray-600">{item.fields.Description}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4">
          <Button onClick={() => setStep(1)} className="bg-gray-500 hover:bg-gray-600">
            Назад
          </Button>
        </div>
      </Panel>
    );
  }

  // Шаг 3: Выбор салата (с кнопкой "Без салата")
  if (step === 3) {
    return (
      <Panel>
        <h1 className="text-2xl font-bold mb-4">Выберите салат</h1>
        <p className="text-gray-600 mb-4">Дата: {selectedDate}</p>

        <div className="mb-4">
          <Button
            onClick={() => {
              setSelectedSide('');
              setStep(4);
            }}
            className="bg-yellow-500 hover:bg-yellow-600 w-full"
          >
            Без салата
          </Button>
        </div>

        {sides.length === 0 ? (
          <p className="text-gray-600">Нет доступных салатов.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sides.map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  setSelectedSide(item.id);
                  setStep(4);
                }}
                className={`border rounded p-4 cursor-pointer hover:bg-blue-50 ${
                  selectedSide === item.id ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
                }`}
              >
                {item.fields.Photo?.[0]?.url && (
                  <img
                    src={item.fields.Photo[0].url}
                    alt={item.fields.Name || ''}
                    className="w-full h-40 object-cover rounded mb-2"
                  />
                )}
                <h3 className="font-semibold">{item.fields.Name || 'Без названия'}</h3>
                {item.fields.Description && (
                  <p className="text-sm text-gray-600">{item.fields.Description}</p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4">
          <Button onClick={() => setStep(2)} className="bg-gray-500 hover:bg-gray-600">
            Назад
          </Button>
        </div>
      </Panel>
    );
  }

  // Шаг 4: Выбор допов (до 2)
  if (step === 4) {
    return (
      <Panel>
        <h1 className="text-2xl font-bold mb-4">Выберите дополнения (до 2)</h1>
        <p className="text-gray-600 mb-4">Дата: {selectedDate}</p>

        {extras.length === 0 ? (
          <p className="text-gray-600">Нет доступных дополнений.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {extras.map((item) => {
              const isSelected = selectedExtras.includes(item.id);
              const canSelect = selectedExtras.length < 2 || isSelected;

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (isSelected) {
                      setSelectedExtras(selectedExtras.filter((id) => id !== item.id));
                    } else if (canSelect) {
                      setSelectedExtras([...selectedExtras, item.id]);
                    }
                  }}
                  className={`border rounded p-4 cursor-pointer ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : canSelect
                      ? 'border-gray-300 hover:bg-blue-50'
                      : 'border-gray-200 bg-gray-100 cursor-not-allowed'
                  }`}
                >
                  {item.fields.Photo?.[0]?.url && (
                    <img
                      src={item.fields.Photo[0].url}
                      alt={item.fields.Name || ''}
                      className="w-full h-40 object-cover rounded mb-2"
                    />
                  )}
                  <h3 className="font-semibold">{item.fields.Name || 'Без названия'}</h3>
                  {item.fields.Description && (
                    <p className="text-sm text-gray-600">{item.fields.Description}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Button onClick={() => setStep(3)} className="bg-gray-500 hover:bg-gray-600">
            Назад
          </Button>
          <Button onClick={() => setStep(5)} className="bg-blue-600 hover:bg-blue-700">
            Далее
          </Button>
        </div>
      </Panel>
    );
  }

  // Шаг 5: Подтверждение (с выбором тарифа и тремя кнопками)
  if (step === 5) {
    const selectedMainItem = mains.find((m) => m.id === selectedMain);
    const selectedSideItem = sides.find((s) => s.id === selectedSide);
    const selectedExtrasItems = extras.filter((e) => selectedExtras.includes(e.id));

    return (
      <Panel>
        <h1 className="text-2xl font-bold mb-4">Подтверждение заказа</h1>
        <p className="text-gray-600 mb-4">Дата: {selectedDate}</p>

        <div className="mb-4">
          <h3 className="font-semibold mb-2">Ваш заказ:</h3>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Основное:</strong> {selectedMainItem?.fields.Name || 'Не выбрано'}
            </li>
            <li>
              <strong>Салат:</strong> {selectedSideItem?.fields.Name || 'Без салата'}
            </li>
            {selectedExtrasItems.length > 0 && (
              <li>
                <strong>Дополнения:</strong>{' '}
                {selectedExtrasItems.map((e) => e.fields.Name).join(', ')}
              </li>
            )}
          </ul>
        </div>

        {isStarshiy && isKomanda && (
          <div className="mb-4 p-4 bg-yellow-50 rounded border border-yellow-200">
            <h3 className="font-semibold mb-2">Выберите тариф:</h3>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="tariff"
                  value="Full"
                  checked={tariffCode === 'Full'}
                  onChange={() => setTariffCode('Full')}
                />
                <span>Полный обед ({orgMeta?.priceFull} ₽)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="tariff"
                  value="Light"
                  checked={tariffCode === 'Light'}
                  onChange={() => setTariffCode('Light')}
                />
                <span>Лёгкий обед ({orgMeta?.priceLight} ₽)</span>
              </label>
            </div>
            {currentPrice !== null && (
              <p className="mt-2 text-lg font-bold">Сумма к оплате: {currentPrice} ₽</p>
            )}
          </div>
        )}

        {isStarshiy && isAmbassador && (
          <div className="mb-4 p-4 bg-green-50 rounded border border-green-200">
            <p className="text-green-700 font-semibold">Бесплатный обед для амбассадора</p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          {isStarshiy && isKomanda && (
            <>
              <Button
                onClick={() => handleSubmit('Online')}
                disabled={submitting}
                className="bg-green-600 hover:bg-green-700"
              >
                {submitting ? 'Обработка...' : 'Оплатить онлайн'}
              </Button>
              <Button
                onClick={() => handleSubmit('Cash')}
                disabled={submitting}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {submitting ? 'Обработка...' : 'Оплатить наличными'}
              </Button>
            </>
          )}

          {(!isStarshiy || isAmbassador) && (
            <Button
              onClick={() => handleSubmit(null)}
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {submitting ? 'Обработка...' : 'Подтвердить заказ'}
            </Button>
          )}

          <Button
            onClick={() => {
              setStep(1);
              setSelectedMain('');
              setSelectedSide('');
              setSelectedExtras([]);
            }}
            disabled={submitting}
            className="bg-yellow-500 hover:bg-yellow-600"
          >
            Сделать заказ на ещё один день
          </Button>

          <Button
            onClick={() => setStep(4)}
            disabled={submitting}
            className="bg-gray-500 hover:bg-gray-600"
          >
            Назад
          </Button>
        </div>
      </Panel>
    );
  }

  return null;
}
