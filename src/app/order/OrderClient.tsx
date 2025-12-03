'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import HintDates from '@/components/HintDates';

interface OrderData {
  date: string;
  status: string;
  mealBox?: string;
  extra1?: string;
  extra2?: string;
  employeeName?: string;
  tariffCode?: string;
  paymentMethod?: string;
  paid?: boolean;
}

interface DayData {
  date: string;
  label: string;
  isBusy: boolean;
  order?: OrderData;
  needsPayment?: boolean;
}

interface OrgInfo {
  name?: string;
  vidDogovora?: string;
  cutoffTime?: string;
  footerText?: string;
  employeeName?: string;
}

export default function OrderClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [days, setDays] = useState<DayData[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);

  const orgId = searchParams.get('org') || localStorage.getItem('orgId') || '';
  const employeeId = searchParams.get('employee') || localStorage.getItem('employeeId') || '';
  const role = searchParams.get('role') || localStorage.getItem('role') || '';

  useEffect(() => {
    if (orgId) localStorage.setItem('orgId', orgId);
    if (employeeId) localStorage.setItem('employeeId', employeeId);
    if (role) localStorage.setItem('role', role);
  }, [orgId, employeeId, role]);

  // Fetch org info
  useEffect(() => {
    if (!orgId) return;
    fetch(`/api/org_info?orgId=${orgId}&employeeId=${employeeId}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) setOrgInfo(data.org);
      });
  }, [orgId, employeeId]);

  // Fetch dates
  useEffect(() => {
    if (!orgId || !employeeId) return;
    fetch(`/api/dates?orgId=${orgId}`)
      .then(r => r.json())
      .then(data => {
        if (!data.ok) return;
        const datesArr = data.dates || [];
        fetch(`/api/busy?orgId=${orgId}&employeeId=${employeeId}`)
          .then(r2 => r2.json())
          .then(busyData => {
            const busySet = new Set(busyData.busyDates || []);
            const ordersMap = new Map<string, OrderData>((busyData.orders || []).map((o: OrderData) => [o.date, o]));
            const mapped = datesArr.map((d: string) => {
              const order: OrderData | undefined = ordersMap.get(d);
              const needsPayment = order ? (order.paymentMethod === 'Online' && !order.paid) : false;
              return {
                date: d,
                label: formatDateLabel(d),
                isBusy: busySet.has(d),
                order,
                needsPayment
              };
            });
            setDays(mapped);
          });
      });
  }, [orgId, employeeId]);

  const isStarshiyActive = orgInfo?.vidDogovora === 'Starshiy' && role === 'komanda';

  const tariffs = useMemo(() => {
    if (!isStarshiyActive) return [];
    return [
      { name: 'Полный обед', price: 390, desc: 'Салат + Суп + Основное + Гарнир' },
      { name: 'Лёгкий обед', price: 320, desc: 'Салат + Основное + Гарнир' }
    ];
  }, [isStarshiyActive]);

  const unpaidOrders = useMemo(() => {
    return days.filter(d => d.needsPayment);
  }, [days]);

  const totalToPay = useMemo(() => {
    return unpaidOrders.reduce((sum, d) => {
      const tariffCode = d.order?.tariffCode;
      const tariff = tariffs.find(t => t.name === tariffCode);
      return sum + (tariff?.price || 0);
    }, 0);
  }, [unpaidOrders, tariffs]);

  const handleDateClick = (day: DayData) => {
    if (day.isBusy) {
      setSelectedDate(day.date);
      setModalOpen(true);
    } else {
      router.push(`/order/quiz?date=${day.date}&org=${orgId}&employee=${employeeId}&role=${role}`);
    }
  };

  const handleCancel = () => {
    if (!selectedDate) return;
    fetch('/api/order_cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, employeeId, date: selectedDate })
    }).then(() => {
      setModalOpen(false);
      window.location.reload();
    });
  };

  const handleEdit = () => {
    if (!selectedDate) return;
    router.push(`/order/quiz?date=${selectedDate}&org=${orgId}&employee=${employeeId}&role=${role}&edit=1`);
  };

  const handlePayOrder = () => {
    if (!selectedDate) return;
    const day = days.find(d => d.date === selectedDate);
    if (!day?.order) return;
    const order = day.order;
    const tariff = tariffs.find(t => t.name === order.tariffCode);
    const amount = tariff?.price || 0;
    alert(`Переход на оплату ${amount} ₽ за заказ на ${day.label}`);
    // Здесь интеграция с платёжной системой
  };

  const handlePayAll = () => {
    alert(`Переход на оплату всех заказов: ${totalToPay} ₽`);
    // Здесь интеграция с платёжной системой
  };

  const selectedDay = days.find(d => d.date === selectedDate);
  const selectedOrder = selectedDay?.order;
  const selectedTariff = tariffs.find(t => t.name === selectedOrder?.tariffCode);

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', backgroundColor: '#000', color: '#fff', minHeight: '100vh' }}>
      <h1 style={{ fontSize: '24px', marginBottom: '10px' }}>Добро пожаловать!</h1>
      <p style={{ marginBottom: '30px' }}>Здесь вы можете выбрать обед на подходящий день. Нажмите на дату ниже.</p>

      {/* Employee Info */}
      <Panel style={{ marginBottom: '20px', padding: '15px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '10px' }}>Информация о сотруднике</h2>
        {orgInfo?.employeeName && (
          <p style={{ marginBottom: '5px' }}>Сотрудник: <strong>{orgInfo.employeeName}</strong></p>
        )}
        <p style={{ marginBottom: '5px' }}>Организация: <strong>{orgInfo?.name || orgId}</strong></p>
        {isStarshiyActive && (
          <div style={{ marginTop: '10px', padding: '10px', backgroundColor: '#333', borderRadius: '8px', border: '2px solid #FFD700' }}>
            ⭐ <strong>Программа "Старший" активна</strong>
          </div>
        )}
      </Panel>

      {/* Tariffs */}
      {isStarshiyActive && tariffs.length > 0 && (
        <Panel style={{ marginBottom: '20px', padding: '15px' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '15px' }}>Тарифы</h2>
          <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
            {tariffs.map(t => (
              <div key={t.name} style={{ flex: '1 1 45%', padding: '15px', backgroundColor: '#222', borderRadius: '8px', border: '1px solid #444' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '5px' }}>{t.name}</h3>
                <p style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '5px' }}>{t.price} ₽</p>
                <p style={{ fontSize: '12px', color: '#aaa' }}>{t.desc}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Total to Pay */}
      {isStarshiyActive && unpaidOrders.length > 0 && (
        <Panel style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#1a1a1a', border: '2px solid #ff4444' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '18px', marginBottom: '5px' }}>Итого к оплате</h2>
              <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#FFD700' }}>{totalToPay} ₽</p>
              <p style={{ fontSize: '12px', color: '#aaa' }}>Неоплаченных заказов: {unpaidOrders.length}</p>
            </div>
            <Button onClick={handlePayAll} style={{ backgroundColor: '#FFD700', color: '#000', fontWeight: 'bold', padding: '12px 24px' }}>
              Оплатить всё
            </Button>
          </div>
        </Panel>
      )}

      {/* Date Selection */}
      <Panel style={{ marginBottom: '20px', padding: '15px' }}>
        <h2 style={{ fontSize: '18px', marginBottom: '15px' }}>Выберите дату</h2>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {days.map(day => (
            <Button
              key={day.date}
              onClick={() => handleDateClick(day)}
              style={{
                flex: '1 1 30%',
                minWidth: '120px',
                backgroundColor: day.isBusy ? '#FFD700' : '#333',
                color: day.isBusy ? '#000' : '#fff',
                position: 'relative',
                padding: '12px'
              }}
            >
              {day.label}
              {day.needsPayment && (
                <span style={{ position: 'absolute', top: '5px', right: '5px', width: '10px', height: '10px', backgroundColor: 'red', borderRadius: '50%' }}></span>
              )}
            </Button>
          ))}
        </div>
        <div style={{ marginTop: '15px', fontSize: '12px', display: 'flex', gap: '15px' }}>
          <span>🟨 — свободно</span>
          <span>⬜ — уже заказано</span>
          <span style={{ color: 'red' }}>🔴 — требуется оплата</span>
        </div>
        <HintDates cutoffTime={orgInfo?.cutoffTime || '18:00'} />
      </Panel>

      {/* Footer */}
      {orgInfo?.footerText && (
        <div style={{ marginTop: '30px', padding: '15px', backgroundColor: '#111', borderRadius: '8px', fontSize: '12px', color: '#aaa', whiteSpace: 'pre-wrap' }}>
          {orgInfo.footerText}
        </div>
      )}

      {/* Modal */}
      {modalOpen && selectedDay && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: '#222', padding: '30px', borderRadius: '12px', maxWidth: '500px', width: '90%', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px' }}>{selectedDay.label}</h2>
              <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '24px', cursor: 'pointer' }}>✕</button>
            </div>

            {selectedOrder ? (
              <>
                <p style={{ marginBottom: '15px', fontSize: '16px' }}>
                  {selectedOrder.status === 'Cancelled' ? 'Заказ отменён.' : 'Заказ уже оформлен на эту дату.'}
                </p>

                {selectedOrder.status !== 'Cancelled' && (
                  <>
                    {selectedOrder.employeeName && (
                      <p style={{ marginBottom: '8px' }}>Сотрудник: <strong>{selectedOrder.employeeName}</strong></p>
                    )}
                    <p style={{ marginBottom: '8px' }}>Meal Box: <strong>{selectedOrder.mealBox || 'Не указано'}</strong></p>
                    {selectedOrder.extra1 && <p style={{ marginBottom: '8px' }}>Экстра 1: <strong>{selectedOrder.extra1}</strong></p>}
                    {selectedOrder.extra2 && <p style={{ marginBottom: '8px' }}>Экстра 2: <strong>{selectedOrder.extra2}</strong></p>}

                    {isStarshiyActive && selectedTariff && (
                      <div style={{ marginTop: '15px', padding: '12px', backgroundColor: '#333', borderRadius: '8px' }}>
                        <p style={{ fontSize: '14px', marginBottom: '5px' }}>Тариф: <strong>{selectedTariff.name}</strong></p>
                        <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#FFD700' }}>{selectedTariff.price} ₽</p>
                        <p style={{ fontSize: '12px', color: '#aaa' }}>{selectedTariff.desc}</p>
                      </div>
                    )}

                    <div style={{ marginTop: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <Button onClick={() => setModalOpen(false)} style={{ flex: '1', backgroundColor: '#FFD700', color: '#000' }}>OK</Button>
                      <Button onClick={handleEdit} style={{ flex: '1', backgroundColor: '#555', color: '#fff' }}>Изменить</Button>
                      <Button onClick={handleCancel} style={{ flex: '1', backgroundColor: '#d32f2f', color: '#fff' }}>Отменить</Button>
                      {selectedDay.needsPayment && (
                        <Button onClick={handlePayOrder} style={{ flex: '1 1 100%', backgroundColor: '#4CAF50', color: '#fff', fontWeight: 'bold' }}>
                          Оплатить ({selectedTariff?.price || 0} ₽)
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </>
            ) : (
              <p>Нет данных о заказе.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  return `${days[date.getDay()]}, ${d.toString().padStart(2, '0')}.${m.toString().padStart(2, '0')}`;
}
