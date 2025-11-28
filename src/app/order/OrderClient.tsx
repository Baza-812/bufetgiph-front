'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import HintDates from '@/components/HintDates';

interface Order {
  id: string;
  fields: {
    'Order Date'?: string;
    Status?: string;
    'Meal Boxes'?: string[];
    'Order Lines'?: string[];
    TariffCode?: string;
    EmployeePayableAmount?: number;
    ProgramType?: string;
    Payment?: string[];
  };
}

interface OrgMeta {
  vidDogovora: string;
  minTeamSize: number | null;
  freeDeliveryMinOrders: number | null;
  priceFull: number | null;
  priceLight: number | null;
  bank: {
    name: string;
    legalName: string;
    bankName: string;
    inn: string;
    kpp: string;
    account: string;
    bic: string;
    contactPhone: string;
    contactEmail: string;
    footerText: string;
    acquiringProvider: string;
  } | null;
}

interface EmployeeMeta {
  employeeID: string;
  role: string;
  fullName: string;
  organization: string;
}

export default function OrderClient() {
  const sp = useSearchParams();
  const org = sp.get('org') || '';
  const employeeID = sp.get('employeeID') || '';
  const token = sp.get('token') || '';

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [orgMeta, setOrgMeta] = useState<OrgMeta | null>(null);
  const [employeeMeta, setEmployeeMeta] = useState<EmployeeMeta | null>(null);

  const [cancelling, setCancelling] = useState<string | null>(null);

  useEffect(() => {
    if (!org || !employeeID || !token) {
      setError('Отсутствуют параметры org, employeeID или token');
      setLoading(false);
      return;
    }

    Promise.all([
      fetchOrgMeta(),
      fetchEmployeeMeta(),
      fetchOrders(),
    ]).finally(() => setLoading(false));
  }, [org, employeeID, token]);

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

  async function fetchOrders() {
    try {
      const res = await fetch(`/api/order?employeeID=${employeeID}&org=${org}&token=${token}`, {
        method: 'GET',
      });
      if (!res.ok) throw new Error('Не удалось загрузить заказы');
      const data = await res.json();
      if (data.ok && Array.isArray(data.orders)) {
        setOrders(data.orders);
      }
    } catch (e: any) {
      setError(e.message || 'Ошибка загрузки заказов');
    }
  }

  async function handleCancel(orderId: string) {
    if (!confirm('Вы уверены, что хотите отменить этот заказ?')) return;

    setCancelling(orderId);
    try {
      const res = await fetch(`/api/order_cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeID, org, token, orderId }),
      });

      if (!res.ok) throw new Error('Не удалось отменить заказ');
      const data = await res.json();

      if (data.ok) {
        alert(data.refundInitiated 
          ? `Заказ отменён. Возврат ${data.refundAmount} ₽ инициирован.`
          : 'Заказ отменён.'
        );
        await fetchOrders();
      } else {
        throw new Error(data.error || 'Ошибка отмены');
      }
    } catch (e: any) {
      alert(e.message || 'Ошибка отмены заказа');
    } finally {
      setCancelling(null);
    }
  }

  async function handlePayOnline(orderId: string) {
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order) return;

      const amount = order.fields.EmployeePayableAmount || 0;

      const res = await fetch(`/api/payment_create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeID,
          org,
          token,
          orderIds: [orderId],
          amount,
          paymentMethod: 'Online',
        }),
      });

      if (!res.ok) throw new Error('Не удалось создать платёж');
      const data = await res.json();

      if (data.ok && data.paymentLink) {
        window.location.href = data.paymentLink;
      } else {
        throw new Error(data.error || 'Ошибка создания платежа');
      }
    } catch (e: any) {
      alert(e.message || 'Ошибка создания платежа');
    }
  }

  function getButtonColor(status: string): 'yellow' | 'gray' | 'red' {
    if (status === 'AwaitingPayment') return 'yellow';
    if (status === 'New' || status === 'Confirmed') return 'gray';
    return 'red';
  }

  function getButtonText(status: string): string {
    if (status === 'AwaitingPayment') return 'Ожидает оплаты';
    if (status === 'New') return 'Новый';
    if (status === 'Confirmed') return 'Подтверждён';
    if (status === 'Cancelled') return 'Отменён';
    return status;
  }

  if (loading) return <Panel><p>Загрузка...</p></Panel>;
  if (error) return <Panel><p className="text-red-600">{error}</p></Panel>;

  const isStarshiy = orgMeta?.vidDogovora === 'Starshiy';
  const role = employeeMeta?.role || 'Employee';

  return (
    <div className="space-y-6">
      <Panel>
        <h1 className="text-2xl font-bold mb-4">Мои заказы</h1>

        {employeeMeta && (
          <div className="mb-4 p-4 bg-blue-50 rounded">
            <p><strong>Сотрудник:</strong> {employeeMeta.fullName}</p>
            <p><strong>Роль:</strong> {role}</p>
          </div>
        )}

        {isStarshiy && orgMeta && (
          <div className="mb-4 p-4 bg-green-50 rounded">
            <h3 className="font-bold mb-2">Программа «Старший»</h3>
            {role === 'Komanda' && (
              <>
                <p><strong>Полный обед:</strong> {orgMeta.priceFull} ₽</p>
                <p><strong>Лёгкий обед:</strong> {orgMeta.priceLight} ₽</p>
              </>
            )}
            {role === 'Ambassador' && (
              <p className="text-green-700 font-semibold">Бесплатные обеды для амбассадоров</p>
            )}
            {orgMeta.minTeamSize && (
              <p className="mt-2 text-sm text-gray-600">
                Минимальный размер команды: {orgMeta.minTeamSize} человек
              </p>
            )}
            {orgMeta.freeDeliveryMinOrders && (
              <p className="text-sm text-gray-600">
                Бесплатная доставка от {orgMeta.freeDeliveryMinOrders} заказов
              </p>
            )}
          </div>
        )}

        {isStarshiy && orgMeta?.bank && (
          <div className="mb-4 p-4 bg-yellow-50 rounded border border-yellow-200">
            <h3 className="font-bold mb-2">Реквизиты для оплаты</h3>
            <p><strong>Организация:</strong> {orgMeta.bank.legalName}</p>
            <p><strong>ИНН:</strong> {orgMeta.bank.inn}</p>
            <p><strong>КПП:</strong> {orgMeta.bank.kpp}</p>
            <p><strong>Банк:</strong> {orgMeta.bank.bankName}</p>
            <p><strong>Расчётный счёт:</strong> {orgMeta.bank.account}</p>
            <p><strong>БИК:</strong> {orgMeta.bank.bic}</p>
            {orgMeta.bank.contactPhone && (
              <p><strong>Телефон:</strong> {orgMeta.bank.contactPhone}</p>
            )}
            {orgMeta.bank.contactEmail && (
              <p><strong>Email:</strong> {orgMeta.bank.contactEmail}</p>
            )}
            {orgMeta.bank.footerText && (
              <p className="mt-2 text-sm text-gray-600">{orgMeta.bank.footerText}</p>
            )}
          </div>
        )}

        <HintDates org={org} />

        <div className="mt-4">
          <Button href={`/order/quiz?org=${org}&employeeID=${employeeID}&token=${token}`}>
            Сделать новый заказ
          </Button>
        </div>
      </Panel>

      {orders.length === 0 ? (
        <Panel>
          <p className="text-gray-600">У вас пока нет заказов.</p>
        </Panel>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const status = order.fields.Status || 'Unknown';
            const date = order.fields['Order Date'] || '—';
            const tariff = order.fields.TariffCode || 'Full';
            const amount = order.fields.EmployeePayableAmount;
            const programType = order.fields.ProgramType || 'Standard';

            const buttonColor = getButtonColor(status);
            const buttonText = getButtonText(status);

            const canCancel = status !== 'Cancelled' && status !== 'Delivered';
            const needsPayment = status === 'AwaitingPayment';

            return (
              <Panel key={order.id}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">Заказ на {date}</p>
                    <p className="text-sm text-gray-600">ID: {order.id}</p>
                    {programType === 'Starshiy' && (
                      <p className="text-sm text-green-600 font-semibold">Программа «Старший»</p>
                    )}
                    {amount !== undefined && amount !== null && (
                      <p className="text-lg font-bold mt-2">
                        Сумма к оплате: {amount} ₽
                        {tariff === 'Light' && <span className="text-sm text-gray-500"> (Лёгкий)</span>}
                        {tariff === 'Full' && <span className="text-sm text-gray-500"> (Полный)</span>}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <div
                      className={`px-4 py-2 rounded text-white font-semibold text-center ${
                        buttonColor === 'yellow'
                          ? 'bg-yellow-500'
                          : buttonColor === 'gray'
                          ? 'bg-gray-500'
                          : 'bg-red-500'
                      }`}
                    >
                      {buttonText}
                    </div>

                    {needsPayment && (
                      <Button
                        onClick={() => handlePayOnline(order.id)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        Оплатить онлайн
                      </Button>
                    )}

                    {canCancel && (
                      <Button
                        onClick={() => handleCancel(order.id)}
                        disabled={cancelling === order.id}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        {cancelling === order.id ? 'Отмена...' : 'Отменить заказ'}
                      </Button>
                    )}

                    <Button
                      href={`/order/quiz?org=${org}&employeeID=${employeeID}&token=${token}&orderId=${order.id}`}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Изменить заказ
                    </Button>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
