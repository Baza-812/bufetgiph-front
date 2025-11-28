// src/app/order/OrderClient.tsx
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import { fetchJSON } from '@/lib/api';

type OrgInfo = {
  ok: boolean;
  org?: {
    name: string;
    vidDogovora?: string;
    priceFull?: number | null;
    priceLight?: number | null;
    footerText?: string | null;
  };
};

type Employee = {
  id: string;
  name: string;
  role: string;
  org: string;
};

type MealBox = {
  id: string;
  name: string;
  price: number;
  description: string;
};

type OrderDate = {
  date: string;
  displayDate: string;
  available: boolean;
};

export default function OrderClient() {
  const sp = useSearchParams();
  const router = useRouter();

  const qOrg = sp.get('org') || '';
  const qEmp = sp.get('employeeID') || '';
  const qTok = sp.get('token') || '';
  const qRole = sp.get('role') || '';

  const [org, setOrg] = useState(qOrg);
  const [employeeID, setEmployeeID] = useState(qEmp);
  const [token, setToken] = useState(qTok);
  const [role, setRole] = useState(qRole);
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [debugMode, setDebugMode] = useState(false);

  // Состояния для заказа
  const [availableDates, setAvailableDates] = useState<OrderDate[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [mealBoxes, setMealBoxes] = useState<MealBox[]>([]);
  const [selectedMealBox, setSelectedMealBox] = useState<string | null>(null);

  // Загружаем из localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (!org) setOrg(localStorage.getItem('baza.org') || '');
      if (!employeeID) setEmployeeID(localStorage.getItem('baza.employeeID') || '');
      if (!token) setToken(localStorage.getItem('baza.token') || '');
      if (!role) setRole(localStorage.getItem('baza.role') || '');
    } catch (e) {
      console.error('localStorage read error:', e);
    }
  }, []);

  // Сохраняем в localStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (org) localStorage.setItem('baza.org', org);
      if (employeeID) localStorage.setItem('baza.employeeID', employeeID);
      if (token) localStorage.setItem('baza.token', token);
      if (role) localStorage.setItem('baza.role', role);
    } catch (e) {
      console.error('localStorage write error:', e);
    }
  }, [org, employeeID, token, role]);

  // Загружаем информацию об организации
  useEffect(() => {
    (async () => {
      if (!org) return;
      try {
        const r = await fetchJSON<OrgInfo>(`/api/org_info?org=${encodeURIComponent(org)}`);
        console.log('🔍 org_info response:', r);
        setOrgInfo(r);
      } catch (e) {
        console.error('❌ Failed to load org info:', e);
      }
    })();
  }, [org]);

  // Загружаем информацию о сотруднике
  useEffect(() => {
    (async () => {
      if (!employeeID || !token) {
        setLoading(false);
        return;
      }
      try {
        // Здесь должен быть запрос к API для получения данных сотрудника
        // Пока заглушка
        setEmployee({
          id: employeeID,
          name: 'Загрузка...',
          role: role || 'Employee',
          org: org,
        });
        setLoading(false);
      } catch (e) {
        console.error('❌ Failed to load employee:', e);
        setLoading(false);
      }
    })();
  }, [employeeID, token, org, role]);

  // Загружаем доступные даты
  useEffect(() => {
    (async () => {
      if (!org) return;
      try {
        const r = await fetchJSON<{ dates: OrderDate[] }>(`/api/dates?org=${encodeURIComponent(org)}`);
        setAvailableDates(r.dates || []);
      } catch (e) {
        console.error('❌ Failed to load dates:', e);
      }
    })();
  }, [org]);

  // Загружаем meal boxes для выбранной даты
  useEffect(() => {
    (async () => {
      if (!selectedDate || !org) return;
      try {
        const r = await fetchJSON<{ mealBoxes: MealBox[] }>(
          `/api/menu?org=${encodeURIComponent(org)}&date=${encodeURIComponent(selectedDate)}`
        );
        setMealBoxes(r.mealBoxes || []);
      } catch (e) {
        console.error('❌ Failed to load meal boxes:', e);
      }
    })();
  }, [selectedDate, org]);

  const isStarshiy = orgInfo?.org?.vidDogovora === 'Starshiy';
  const isKomanda = role?.toLowerCase() === 'komanda';
  const needsStarshiy = isStarshiy && isKomanda;

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="text-white">Загрузка...</div>
      </main>
    );
  }

  if (!employeeID || !token) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <Panel title="Ошибка">
          <p className="text-white/80">Неверная ссылка. Пожалуйста, используйте ссылку из письма.</p>
        </Panel>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 p-4 space-y-4">
        {/* Кнопка диагностики (скрытая по умолчанию) */}
        {process.env.NODE_ENV === 'development' && (
          <div>
            <Button onClick={() => setDebugMode((v) => !v)} variant="ghost" size="sm">
              {debugMode ? '🔒 Скрыть отладку' : '🔍 Диагностика'}
            </Button>
          </div>
        )}

        {/* Панель диагностики (только в dev режиме) */}
        {debugMode && (
          <Panel title="🔍 Диагностика программы Старший">
            <div className="space-y-2 text-sm font-mono">
              <div className="grid grid-cols-2 gap-2">
                <div className="text-white/60">org:</div>
                <div className="text-white font-bold">{org || '—'}</div>
                <div className="text-white/60">role:</div>
                <div className="text-white font-bold">{role || '—'}</div>
                <div className="text-white/60">vidDogovora:</div>
                <div className="text-white font-bold">{orgInfo?.org?.vidDogovora || '—'}</div>
                <div className="text-white/60">needsStarshiy:</div>
                <div className={needsStarshiy ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                  {needsStarshiy ? '✅ ВКЛЮЧЕНО' : '❌ ВЫКЛЮЧЕНО'}
                </div>
              </div>
            </div>
          </Panel>
        )}

        {/* Информация о сотруднике */}
        <Panel title="Информация о сотруднике">
          <div className="space-y-2 text-sm">
            <div>
              Организация: <span className="font-semibold">{orgInfo?.org?.name || org}</span>
            </div>
            <div>
              Роль: <span className="font-semibold">{role || 'Employee'}</span>
            </div>
            {needsStarshiy && (
              <div className="mt-4 p-3 bg-yellow-400/10 border border-yellow-400/30 rounded-xl">
                <div className="text-yellow-400 font-bold">🌟 Программа "Старший" активна</div>
              </div>
            )}
          </div>
        </Panel>

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

        {/* Выбор даты */}
        <Panel title="1. Выберите дату заказа">
          {availableDates.length === 0 ? (
            <p className="text-white/60 text-sm">Нет доступных дат для заказа</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {availableDates.map((d) => (
                <button
                  key={d.date}
                  onClick={() => setSelectedDate(d.date)}
                  disabled={!d.available}
                  className={`
                    p-3 rounded-xl border transition-all
                    ${selectedDate === d.date
                      ? 'bg-yellow-400 border-yellow-400 text-black font-bold'
                      : d.available
                      ? 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                      : 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'
                    }
                  `}
                >
                  {d.displayDate}
                </button>
              ))}
            </div>
          )}
        </Panel>

        {/* Выбор Meal Box */}
        {selectedDate && (
          <Panel title="2. Выберите Meal Box">
            {mealBoxes.length === 0 ? (
              <p className="text-white/60 text-sm">Нет доступных Meal Box на эту дату</p>
            ) : (
              <div className="space-y-3">
                {mealBoxes.map((mb) => (
                  <button
                    key={mb.id}
                    onClick={() => setSelectedMealBox(mb.id)}
                    className={`
                      w-full p-4 rounded-xl border transition-all text-left
                      ${selectedMealBox === mb.id
                        ? 'bg-yellow-400 border-yellow-400 text-black'
                        : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                      }
                    `}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-bold">{mb.name}</div>
                      <div className="font-bold">{mb.price} ₽</div>
                    </div>
                    <div className={`text-sm ${selectedMealBox === mb.id ? 'text-black/70' : 'text-white/60'}`}>
                      {mb.description}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Panel>
        )}

        {/* Кнопка оформления заказа */}
        {selectedDate && selectedMealBox && (
          <div className="flex gap-3">
            <Button
              onClick={() => {
                // Здесь логика создания заказа
                console.log('Создание заказа:', { selectedDate, selectedMealBox });
              }}
              className="flex-1"
            >
              Оформить заказ
            </Button>
          </div>
        )}
      </div>

      {/* Футер с реквизитами из Banks.FooterText */}
      {needsStarshiy && orgInfo?.org?.footerText && (
        <footer className="mt-auto p-4 bg-black/20 border-t border-white/10">
          <div className="max-w-4xl mx-auto text-xs text-white/60 whitespace-pre-line">
            {orgInfo.org.footerText}
          </div>
        </footer>
      )}
    </main>
  );
}
