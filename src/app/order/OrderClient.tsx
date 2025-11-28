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
    priceFull?: number;
    priceLight?: number;
    bankName?: string;
    bankINN?: string;
    bankKPP?: string;
    bankAccount?: string;
    bankBIK?: string;
    bankCorrespondent?: string;
  };
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
  const [debugMode, setDebugMode] = useState(false);

  // Загружаем из localStorage
  useEffect(() => {
    if (!org) setOrg(localStorage.getItem('baza.org') || '');
    if (!employeeID) setEmployeeID(localStorage.getItem('baza.employeeID') || '');
    if (!token) setToken(localStorage.getItem('baza.token') || '');
    if (!role) setRole(localStorage.getItem('baza.role') || '');
  }, []);

  // Сохраняем в localStorage
  useEffect(() => {
    if (org) localStorage.setItem('baza.org', org);
    if (employeeID) localStorage.setItem('baza.employeeID', employeeID);
    if (token) localStorage.setItem('baza.token', token);
    if (role) localStorage.setItem('baza.role', role);
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

  const isStarshiy = orgInfo?.org?.vidDogovora === 'Starshiy';
  const isKomanda = role?.toLowerCase() === 'komanda';
  const needsStarshiy = isStarshiy && isKomanda;

  console.log('🔍 Debug:', {
    org,
    role,
    vidDogovora: orgInfo?.org?.vidDogovora,
    isStarshiy,
    isKomanda,
    needsStarshiy
  });

  return (
    <main className="p-4">
      {/* Кнопка для включения отладки */}
      <div className="mb-4">
        <Button onClick={() => setDebugMode(!debugMode)} variant="ghost">
          {debugMode ? '🔒 Скрыть отладку' : '🔍 Показать отладку'}
        </Button>
      </div>

      {/* Панель отладки */}
      {debugMode && (
        <Panel title="🔍 Диагностика программы Старший">
          <div className="space-y-2 text-sm font-mono">
            <div className="grid grid-cols-2 gap-2">
              <div className="text-white/60">org:</div>
              <div className="text-white font-bold">{org || '—'}</div>

              <div className="text-white/60">employeeID:</div>
              <div className="text-white font-bold">{employeeID || '—'}</div>

              <div className="text-white/60">role:</div>
              <div className="text-white font-bold">{role || '—'}</div>

              <div className="text-white/60">vidDogovora:</div>
              <div className="text-white font-bold">{orgInfo?.org?.vidDogovora || '—'}</div>

              <div className="text-white/60">isStarshiy:</div>
              <div className={isStarshiy ? 'text-green-400' : 'text-red-400'}>
                {isStarshiy ? '✅ ДА' : '❌ НЕТ'}
              </div>

              <div className="text-white/60">isKomanda:</div>
              <div className={isKomanda ? 'text-green-400' : 'text-red-400'}>
                {isKomanda ? '✅ ДА' : '❌ НЕТ'}
              </div>

              <div className="text-white/60">needsStarshiy:</div>
              <div className={needsStarshiy ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                {needsStarshiy ? '✅ ВКЛЮЧЕНО' : '❌ ВЫКЛЮЧЕНО'}
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-white/10">
              <div className="text-white/60 mb-2">Полный ответ org_info:</div>
              <pre className="text-xs text-white/80 bg-black/30 p-2 rounded overflow-auto">
                {JSON.stringify(orgInfo, null, 2)}
              </pre>
            </div>

            <div className="mt-4 pt-4 border-t border-white/10">
              <div className="text-white/60 mb-2">localStorage:</div>
              <pre className="text-xs text-white/80 bg-black/30 p-2 rounded overflow-auto">
{`baza.org: ${localStorage.getItem('baza.org')}
baza.role: ${localStorage.getItem('baza.role')}
baza.employeeID: ${localStorage.getItem('baza.employeeID')}
baza.token: ${localStorage.getItem('baza.token')}`}
              </pre>
            </div>
          </div>
        </Panel>
      )}

      {/* Основной контент */}
      <Panel title="Информация о сотруднике">
        <div className="space-y-2 text-sm">
          <div>Организация: <span className="font-semibold">{orgInfo?.org?.name || org}</span></div>
          <div>Роль: <span className="font-semibold">{role || '—'}</span></div>
          {needsStarshiy && (
            <div className="mt-4 p-3 bg-yellow-400/10 border border-yellow-400/30 rounded-xl">
              <div className="text-yellow-400 font-bold">🌟 Программа "Старший" активна</div>
            </div>
          )}
        </div>
      </Panel>

      {needsStarshiy && orgInfo?.org && (
        <Panel title="Тарифы">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl bg-white/5 border border-white/10 p-4">
              <div className="text-lg font-bold text-yellow-400 mb-2">Полный обед</div>
              <div className="text-2xl font-bold text-white mb-2">
                {orgInfo.org.priceFull ? `${orgInfo.org.priceFull} ₽` : '—'}
              </div>
              <div className="text-sm text-white/70">
                Салат + Суп + Основное + Гарнир
              </div>
            </div>

            <div className="rounded-xl bg-white/5 border border-white/10 p-4">
              <div className="text-lg font-bold text-yellow-400 mb-2">Лёгкий обед</div>
              <div className="text-2xl font-bold text-white mb-2">
                {orgInfo.org.priceLight ? `${orgInfo.org.priceLight} ₽` : '—'}
              </div>
              <div className="text-sm text-white/70">
                Салат + Основное + Гарнир
              </div>
            </div>
          </div>
        </Panel>
      )}

      {needsStarshiy && orgInfo?.org?.bankName && (
        <Panel title="Реквизиты для оплаты">
          <div className="space-y-2 text-sm">
            <div><span className="text-white/60">Банк:</span> {orgInfo.org.bankName}</div>
            {orgInfo.org.bankINN && <div><span className="text-white/60">ИНН:</span> {orgInfo.org.bankINN}</div>}
            {orgInfo.org.bankKPP && <div><span className="text-white/60">КПП:</span> {orgInfo.org.bankKPP}</div>}
            {orgInfo.org.bankAccount && <div><span className="text-white/60">Расчётный счёт:</span> {orgInfo.org.bankAccount}</div>}
            {orgInfo.org.bankBIK && <div><span className="text-white/60">БИК:</span> {orgInfo.org.bankBIK}</div>}
            {orgInfo.org.bankCorrespondent && <div><span className="text-white/60">Корр. счёт:</span> {orgInfo.org.bankCorrespondent}</div>}
          </div>
        </Panel>
      )}
    </main>
  );
}
