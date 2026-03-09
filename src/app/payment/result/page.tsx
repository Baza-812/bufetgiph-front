// src/app/payment/result/page.tsx
'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import { fetchJSON } from '@/lib/api';

type PaymentStatus = {
  ok: boolean;
  status?: string;
  paid?: boolean;
  amount?: number;
  error?: string;
  bankInfo?: {
    legalName: string;
    inn: string;
    kpp: string;
    footer: string;
  };
};

function PaymentResultContent() {
  const sp = useSearchParams();
  const router = useRouter();
  
  const paymentId = sp.get('paymentId');
  const orderId = sp.get('orderId');
  
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [pollingCount, setPollingCount] = useState(0);

  // Получаем org, employeeID, token из localStorage
  const [org, setOrg] = useState('');
  const [employeeID, setEmployeeID] = useState('');
  const [token, setToken] = useState('');

  useEffect(() => {
    setOrg(localStorage.getItem('baza.org') || '');
    setEmployeeID(localStorage.getItem('baza.employeeID') || '');
    setToken(localStorage.getItem('baza.token') || '');
  }, []);

  // Polling статуса платежа
  useEffect(() => {
    if (!paymentId || !orderId) {
      setStatus({ ok: false, error: 'Missing payment or order ID' });
      setLoading(false);
      return;
    }

    let ignore = false;
    let intervalId: NodeJS.Timeout;

    const checkStatus = async () => {
      try {
        const u = new URL('/api/payment/status', window.location.origin);
        u.searchParams.set('paymentId', paymentId);
        u.searchParams.set('orderId', orderId);
        
        const r = await fetchJSON<PaymentStatus>(u.toString());
        
        if (!ignore) {
          setStatus(r);
          setLoading(false);
          
          // Останавливаем polling, если платеж завершен
          if (r.status === 'succeeded' || r.status === 'canceled') {
            if (intervalId) clearInterval(intervalId);
          }
          
          setPollingCount(prev => prev + 1);
        }
      } catch (e) {
        if (!ignore) {
          setStatus({ 
            ok: false, 
            error: e instanceof Error ? e.message : String(e) 
          });
          setLoading(false);
        }
      }
    };

    // Первый запрос сразу
    checkStatus();
    
    // Polling каждые 3 секунды (максимум 20 раз = 1 минута)
    if (pollingCount < 20) {
      intervalId = setInterval(checkStatus, 3000);
    }

    return () => {
      ignore = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [paymentId, orderId, pollingCount]);

  const goToHome = () => {
    const u = new URL('/order', window.location.origin);
    if (org) u.searchParams.set('org', org);
    if (employeeID) u.searchParams.set('employeeID', employeeID);
    if (token) u.searchParams.set('token', token);
    router.push(u.toString());
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 flex items-center justify-center p-4">
        <Panel title="Обработка платежа">
          <div className="text-center text-white/70">
            Проверяем статус платежа...
          </div>
        </Panel>
      </main>
    );
  }

  if (!status?.ok || status.error) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 flex items-center justify-center p-4">
        <Panel title="Ошибка">
          <div className="text-red-400 mb-4">
            {status?.error || 'Не удалось получить информацию о платеже'}
          </div>
          <Button onClick={goToHome}>Вернуться на главную</Button>
        </Panel>
      </main>
    );
  }

  const isSuccess = status.status === 'succeeded' && status.paid;
  const isPending = status.status === 'pending' || status.status === 'waiting_for_capture';
  const isCanceled = status.status === 'canceled';

  return (
    <main className="min-h-screen bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <Panel title={isSuccess ? '✅ Оплата успешна!' : isPending ? '⏳ Ожидание оплаты' : '❌ Оплата отменена'}>
          <div className="space-y-4">
            {isSuccess && (
              <div className="text-white/90">
                Ваш платеж успешно обработан. Дополнительные блюда добавлены к вашему заказу.
              </div>
            )}

            {isPending && (
              <div className="text-white/70">
                Платеж еще обрабатывается. Пожалуйста, подождите...
                <div className="text-xs text-white/50 mt-2">
                  Проверка статуса: {pollingCount} / 20
                </div>
              </div>
            )}

            {isCanceled && (
              <div className="text-white/70">
                Платеж был отменен. Вы можете вернуться и попробовать снова.
              </div>
            )}

            {status.amount && (
              <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                <div className="text-white/60 text-sm">Сумма платежа:</div>
                <div className="text-2xl font-bold text-yellow-400">{status.amount} ₽</div>
              </div>
            )}

            <div className="mt-6">
              <Button onClick={goToHome}>
                {isSuccess ? 'Вернуться на главную' : 'Назад к заказам'}
              </Button>
            </div>
          </div>
        </Panel>

        {/* Footer с реквизитами */}
        {status.bankInfo && (
          <div className="mt-6 rounded-xl bg-white/5 border border-white/10 p-4 text-xs text-white/60">
            <div className="font-semibold text-white/80 mb-2">Реквизиты получателя платежа:</div>
            {status.bankInfo.legalName && <div className="mb-1">{status.bankInfo.legalName}</div>}
            {status.bankInfo.inn && <div>ИНН: {status.bankInfo.inn}</div>}
            {status.bankInfo.kpp && <div>КПП: {status.bankInfo.kpp}</div>}
            {status.bankInfo.footer && (
              <div className="mt-2 whitespace-pre-wrap">{status.bankInfo.footer}</div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function PaymentResultPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 flex items-center justify-center">
        <div className="text-white">Загрузка...</div>
      </main>
    }>
      <PaymentResultContent />
    </Suspense>
  );
}
