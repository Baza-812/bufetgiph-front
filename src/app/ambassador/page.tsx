// src/app/ambassador/page.tsx
'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import { fetchJSON } from '@/lib/api';

type TeamMember = {
  id: string;
  name: string;
  role: string;
  hasOrder: boolean;
  isPaid: boolean;
};

type TeamStats = {
  totalOrders: number;
  paidOrders: number;
  minForDelivery: number;
  minForFreeAmbassador: number;
  deliveryAllowed: boolean;
  ambassadorFree: boolean;
  members: TeamMember[];
};

type DateStats = {
  date: string;
  stats: TeamStats;
  label: string;
};

function AmbassadorDashboardContent() {
  const sp = useSearchParams();
  const router = useRouter();
  
  const [org, setOrg] = useState('');
  const [employeeID, setEmployeeID] = useState('');
  const [token, setToken] = useState('');
  
  const [employeeName, setEmployeeName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [employeeRole, setEmployeeRole] = useState('');
  
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dateStats, setDateStats] = useState<Record<string, TeamStats>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  /** Время отсечки из Airtable для напоминаний (с team_stats) */
  const [cutoffTimeLabel, setCutoffTimeLabel] = useState('');
  /** Время отсечки из Organizations (Cutoff Time), для текста напоминаний */
  const [cutoffTimeLabel, setCutoffTimeLabel] = useState('');

  // 1) Получаем креды из query/localStorage
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

  // 2) Получаем информацию о сотруднике
  useEffect(() => {
    if (!employeeID || !org || !token) return;
    (async () => {
      try {
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

  // 3) Проверка что пользователь - Ambassador
  useEffect(() => {
    if (!employeeRole) {
      setError('');
      return;
    }
    if (employeeRole !== 'Ambassador') {
      setError('Доступ к этой странице разрешен только для Амбассадоров');
    } else {
      setError('');
    }
  }, [employeeRole]);

  // 4) Загружаем список дат
  useEffect(() => {
    if (!org) return;
    (async () => {
      try {
        const r = await fetchJSON<{ ok: boolean; dates?: string[] }>(`/api/dates?org=${encodeURIComponent(org)}`);
        if (r.ok && r.dates) {
          setDates(r.dates);
          setSelectedDate((prev) => {
            if (prev && r.dates!.includes(prev)) return prev;
            return r.dates![0] ?? null;
          });
        }
      } catch (err) {
        console.error('Failed to load dates:', err);
      }
    })();
  }, [org]);

  // 5) Загружаем статистику для выбранной даты
  useEffect(() => {
    if (!org || !selectedDate) return;
    
    (async () => {
      setLoading(true);
      try {
        const r = await fetchJSON<{
          ok: boolean;
          stats?: TeamStats;
          members?: TeamMember[];
          cutoffTimeLabel?: string;
        }>(
          `/api/ambassador/team_stats?org=${encodeURIComponent(org)}&date=${selectedDate}`
        );
        if (r?.ok && r.stats) {
          const full: TeamStats = {
            ...r.stats,
            members: r.stats.members ?? r.members ?? [],
          };
          setDateStats((prev) => ({ ...prev, [selectedDate]: full }));
          if (typeof r.cutoffTimeLabel === 'string' && r.cutoffTimeLabel.trim()) {
            setCutoffTimeLabel(r.cutoffTimeLabel.trim());
          }
        }
      } catch (err) {
        console.error('Failed to load team stats:', err);
        setError('Не удалось загрузить статистику');
      } finally {
        setLoading(false);
      }
    })();
  }, [org, selectedDate]);

  // Получаем информацию об организации
  useEffect(() => {
    if (!org) return;
    (async () => {
      try {
        const r = await fetchJSON<{ ok: boolean; name?: string }>(`/api/org_info?org=${encodeURIComponent(org)}`);
        if (r.ok && r.name) setOrgName(r.name);
      } catch {
        // не критично
      }
    })();
  }, [org]);

  const currentStats = selectedDate ? dateStats[selectedDate] : null;
  const membersList = currentStats?.members ?? [];

  // Форматирование даты
  const formatDate = (isoDate: string) => {
    const d = new Date(isoDate);
    const day = d.getDate();
    const month = d.toLocaleDateString('ru-RU', { month: 'short' });
    const weekday = d.toLocaleDateString('ru-RU', { weekday: 'short' });
    return `${day} ${month} (${weekday})`;
  };

  // Проверка доступа
  if (employeeRole && employeeRole !== 'Ambassador') {
    return (
      <main className="min-h-screen bg-zinc-900 text-white p-4">
        <div className="max-w-2xl mx-auto">
          <Panel title="Доступ запрещен">
            <div className="text-red-400 mb-4">{error}</div>
            <Button onClick={() => router.push('/order')}>Вернуться к заказам</Button>
          </Panel>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-900 text-white p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Заголовок */}
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold mb-2">
            <span className="text-yellow-400">👑</span> Личный кабинет Амбассадора
          </h1>
          {employeeName && (
            <p className="text-white/70">
              {employeeName} {orgName && `• ${orgName}`}
            </p>
          )}
        </div>

        {/* Выбор даты */}
        <Panel title="Выберите дату">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {dates.map(d => (
              <Button
                key={d}
                onClick={() => setSelectedDate(d)}
                variant={selectedDate === d ? 'primary' : 'ghost'}
                className="w-full"
              >
                {formatDate(d)}
              </Button>
            ))}
          </div>
        </Panel>

        {/* Статистика */}
        {loading && (
          <Panel title="Загрузка">
            <div className="text-white/70">Загрузка статистики...</div>
          </Panel>
        )}

        {error && (
          <Panel title="Ошибка">
            <div className="text-red-400">{error}</div>
          </Panel>
        )}

        {/* Статистика только после подтверждения роли (не светим данные TeamMember до редиректа) */}
        {!loading && !error && currentStats && selectedDate && employeeRole === 'Ambassador' && (
          <>
            {/* Общая статистика */}
            <Panel title={`Статистика на ${formatDate(selectedDate)}`}>
              <div className="space-y-4">
                {/* Прогресс-бар для доставки */}
                <div>
                  <div className="flex justify-between mb-2 text-sm">
                    <span className="text-white/70">Минимум для доставки</span>
                    <span className={`font-semibold ${
                      currentStats.deliveryAllowed ? 'text-green-400' : 'text-yellow-400'
                    }`}>
                      {currentStats.paidOrders} / {currentStats.minForDelivery}
                    </span>
                  </div>
                  <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all ${
                        currentStats.deliveryAllowed ? 'bg-green-500' : 'bg-yellow-500'
                      }`}
                      style={{ 
                        width: `${Math.min(100, (currentStats.paidOrders / currentStats.minForDelivery) * 100)}%` 
                      }}
                    />
                  </div>
                </div>

                {/* Прогресс-бар для бесплатного обеда */}
                <div>
                  <div className="flex justify-between mb-2 text-sm">
                    <span className="text-white/70">Бесплатный обед для Амбассадора</span>
                    <span className={`font-semibold ${
                      currentStats.ambassadorFree ? 'text-green-400' : 'text-yellow-400'
                    }`}>
                      {currentStats.paidOrders} / {currentStats.minForFreeAmbassador}
                    </span>
                  </div>
                  <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all ${
                        currentStats.ambassadorFree ? 'bg-green-500' : 'bg-yellow-500'
                      }`}
                      style={{ 
                        width: `${Math.min(100, (currentStats.paidOrders / currentStats.minForFreeAmbassador) * 100)}%` 
                      }}
                    />
                  </div>
                </div>

                {/* Статусы */}
                <div className="flex gap-3 text-sm">
                  <div className={`flex-1 p-3 rounded-lg ${
                    currentStats.deliveryAllowed 
                      ? 'bg-green-500/20 border border-green-400/30' 
                      : 'bg-yellow-500/20 border border-yellow-400/30'
                  }`}>
                    <div className="text-white/70 mb-1">Доставка</div>
                    <div className={`font-semibold ${
                      currentStats.deliveryAllowed ? 'text-green-400' : 'text-yellow-400'
                    }`}>
                      {currentStats.deliveryAllowed ? '✓ Разрешена' : '⚠ Минимум не набран'}
                    </div>
                  </div>
                  
                  <div className={`flex-1 p-3 rounded-lg ${
                    currentStats.ambassadorFree 
                      ? 'bg-green-500/20 border border-green-400/30' 
                      : 'bg-yellow-500/20 border border-yellow-400/30'
                  }`}>
                    <div className="text-white/70 mb-1">Ваш обед</div>
                    <div className={`font-semibold ${
                      currentStats.ambassadorFree ? 'text-green-400' : 'text-yellow-400'
                    }`}>
                      {currentStats.ambassadorFree ? '✓ Бесплатно' : '⚠ Требуется оплата'}
                    </div>
                  </div>
                </div>
              </div>
            </Panel>

            {/* Список команды */}
            <Panel title="Состав команды">
              {membersList.length === 0 ? (
                <div className="text-white/60 text-sm">Никто еще не сделал заказ на эту дату</div>
              ) : (
                <div className="space-y-2">
                  {membersList.map(member => (
                    <div 
                      key={member.id}
                      className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <span className="text-white font-medium">{member.name}</span>
                          <span className="text-white/50 text-xs">
                            {member.role === 'Ambassador' ? '👑 Амбассадор' : 'Участник'}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {/* Статус заказа */}
                        {member.hasOrder ? (
                          <span className="text-green-400 text-sm">✓ Заказал</span>
                        ) : (
                          <span className="text-white/40 text-sm">—</span>
                        )}
                        
                        {/* Статус оплаты */}
                        {member.hasOrder && (
                          member.isPaid ? (
                            <span className="px-2 py-1 bg-green-500/20 border border-green-400/30 rounded text-green-400 text-xs font-semibold">
                              Оплачено
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-yellow-500/20 border border-yellow-400/30 rounded text-yellow-400 text-xs font-semibold">
                              Ожидает оплаты
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            {/* Уведомления */}
            {!currentStats.deliveryAllowed && (
              <div className="bg-yellow-500/10 border border-yellow-400/30 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <div className="font-semibold text-yellow-400 mb-1">
                      Минимум для доставки не набран
                    </div>
                    <div className="text-white/70 text-sm">
                      Для доставки на {formatDate(selectedDate)} необходимо еще{' '}
                      <strong className="text-white">{currentStats.minForDelivery - currentStats.paidOrders}</strong>{' '}
                      {currentStats.minForDelivery - currentStats.paidOrders === 1 ? 'заказ' : 'заказа/ов'}.
                      Напомните коллегам о необходимости сделать заказ до{' '}
                      <strong className="text-white">{cutoffTimeLabel || 'указанного времени'}</strong> накануне доставки.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!currentStats.ambassadorFree && currentStats.deliveryAllowed && (
              <div className="bg-blue-500/10 border border-blue-400/30 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">ℹ️</span>
                  <div>
                    <div className="font-semibold text-blue-400 mb-1">
                      Ваш обед будет платным
                    </div>
                    <div className="text-white/70 text-sm">
                      Для бесплатного обеда необходимо еще{' '}
                      <strong className="text-white">{currentStats.minForFreeAmbassador - currentStats.paidOrders}</strong>{' '}
                      {currentStats.minForFreeAmbassador - currentStats.paidOrders === 1 ? 'заказ' : 'заказа/ов'}.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Действия */}
        <div className="flex gap-3">
          <Button onClick={() => router.push('/order')} variant="ghost">
            ← К заказам
          </Button>
          <Button 
            onClick={() => {
              if (selectedDate) {
                router.push(`/order?org=${org}&employeeID=${employeeID}&token=${token}`);
              }
            }}
            disabled={!selectedDate}
          >
            Сделать заказ
          </Button>
        </div>

        {/* Автообновление */}
        <div className="text-center text-white/50 text-xs mt-4">
          Статистика обновляется автоматически при загрузке страницы
        </div>
      </div>
    </main>
  );
}

export default function AmbassadorDashboard() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-zinc-900 text-white p-4">
        <div className="max-w-4xl mx-auto">
          <Panel title="Загрузка">
            <div className="text-white/70">Загрузка личного кабинета...</div>
          </Panel>
        </div>
      </main>
    }>
      <AmbassadorDashboardContent />
    </Suspense>
  );
}
