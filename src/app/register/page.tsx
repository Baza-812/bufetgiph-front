// src/app/register/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Input, { Field } from '@/components/ui/Input';
import { fetchJSON } from '@/lib/api';
import { buildConsentText, buildPolicyText } from '@/lib/registerLegalDocs';
import LegalDocModal from './LegalDocModal';

type OrgResp = {
  ok: boolean;
  name?: string;
  orgName?: string;
  portionType?: string;
  operatorPd?: string;
  domain?: string;
  error?: string;
};
type RegisterResp = {
  ok: boolean;
  /** false если нет RESEND/MAIL_FROM или ошибка Resend — запись сотрудника всё равно создана */
  emailSent?: boolean;
  /** совместимость со старым API */
  sent?: boolean;
  error?: string;
};

function TextLinkButton({
  children,
  onOpen,
}: {
  children: React.ReactNode;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="text-yellow-400 underline underline-offset-2 hover:text-yellow-300 text-left inline p-0 border-0 bg-transparent cursor-pointer font-inherit text-sm leading-snug"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpen();
      }}
    >
      {children}
    </button>
  );
}

export default function RegisterPage() {
  const [org, setOrg] = useState('');
  const [orgName, setOrgName] = useState<string>('');
  const [operatorPd, setOperatorPd] = useState('');
  const [orgDomain, setOrgDomain] = useState('');
  const [lastError, setLastError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);

  const [legalModal, setLegalModal] = useState<null | 'consent' | 'policy'>(null);

  const [loading, setLoading] = useState(false);

  const consentDoc = useMemo(() => buildConsentText(operatorPd), [operatorPd]);
  const policyDoc = useMemo(() => buildPolicyText(operatorPd, orgDomain), [operatorPd, orgDomain]);

  // вытащим org из ?org=... и подтянем название организации
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const o = q.get('org') || '';
    setOrg(o);

    if (o) {
      (async () => {
        try {
          setLastError('');
          const u = new URL('/api/org_info', window.location.origin);
          u.searchParams.set('org', o);
          const js = await fetchJSON<OrgResp>(u.toString());
          if (!js.ok) throw new Error(js.error || 'Организация не найдена');
          setOrgName(js.name || js.orgName || '');
          setOperatorPd(js.operatorPd || '');
          setOrgDomain(js.domain || '');
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          setLastError(msg);
        }
      })();
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!org) {
      setLastError('Не передан код организации (org).');
      return;
    }
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setLastError('Заполните Фамилию, Имя и Email.');
      return;
    }
    if (!consentAccepted) {
      setLastError('Нужно отметить согласие на обработку персональных данных.');
      return;
    }

    try {
      setLoading(true);
      setLastError('');
      setOkMsg('');
      const resp = await fetchJSON<RegisterResp>('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          consent: true,
        }),
      });

      if (!resp.ok) throw new Error(resp.error || 'Не удалось завершить регистрацию');

      const mailed = Boolean(resp.emailSent ?? resp.sent);
      if (mailed) {
        setOkMsg('Готово! Мы отправили письмо с персональной ссылкой для заказа обедов.');
      } else {
        setOkMsg(
          'Регистрация сохранена. Письмо сейчас не удалось отправить — напишите в поддержку или попробуйте снова через некоторое время.',
        );
      }
      setFirstName('');
      setLastName('');
      setEmail('');
      setConsentAccepted(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <Panel title="Регистрация сотрудника">
        <div className="text-white/80 mb-3">
          {orgName ? (
            <>Организация: <span className="font-semibold">{orgName}</span></>
          ) : (
            <>Организация: <span className="text-white/60">—</span></>
          )}
        </div>

        <form onSubmit={onSubmit} className="space-y-4 max-w-xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Фамилия">
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Иванов"
                maxLength={64}
                required
              />
            </Field>
            <Field label="Имя">
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Иван"
                maxLength={64}
                required
              />
            </Field>
          </div>

          <Field
            label="Email"
            hint="На этот адрес придёт персональная постоянная ссылка для заказа обедов"
          >
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              inputMode="email"
              maxLength={120}
              required
            />
          </Field>

          <label className="flex gap-3 items-start cursor-pointer select-none">
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(e) => setConsentAccepted(e.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 rounded border-white/20 bg-white/5 text-yellow-400 focus:ring-brand-500"
            />
            <span className="text-sm text-white/80 leading-snug">
              Даю{' '}
              <TextLinkButton onOpen={() => setLegalModal('consent')}>
                согласие на обработку персональных данных
              </TextLinkButton>{' '}
              для регистрации и получения персональной ссылки.
            </span>
          </label>

          <p className="text-xs text-white/55 leading-snug pl-0 md:pl-7">
            Нажимая кнопку, я подтверждаю, что ознакомлен(а) с{' '}
            <TextLinkButton onOpen={() => setLegalModal('policy')}>
              Политикой обработки персональных данных
            </TextLinkButton>
            .
          </p>

          {lastError && <div className="text-red-400 text-sm">{lastError}</div>}
          {okMsg && <div className="text-emerald-400 text-sm">{okMsg}</div>}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={loading || !consentAccepted}>
              {loading ? 'Отправляем…' : 'Зарегистрировать'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setFirstName('');
                setLastName('');
                setEmail('');
                setConsentAccepted(false);
                setOkMsg('');
                setLastError('');
              }}
            >
              Очистить
            </Button>
          </div>
        </form>
      </Panel>

      {legalModal === 'consent' && (
        <LegalDocModal title="Согласие на обработку персональных данных" onClose={() => setLegalModal(null)}>
          {consentDoc}
        </LegalDocModal>
      )}
      {legalModal === 'policy' && (
        <LegalDocModal title="Политика в отношении обработки персональных данных" onClose={() => setLegalModal(null)}>
          {policyDoc}
        </LegalDocModal>
      )}
    </main>
  );
}
