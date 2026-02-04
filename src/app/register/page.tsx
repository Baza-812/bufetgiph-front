// src/app/register/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Input, { Field } from '@/components/ui/Input';
import { fetchJSON } from '@/lib/api';

type OrgResp = { ok: boolean; name?: string; orgName?: string; portionType?: string; error?: string };
type RegisterResp = {
  ok: boolean;
  // backend возвращает ok=true как при создании новой записи,
  // так и при режиме "существует — выслать ссылку".
  // Ссылку в UI не показываем.
  error?: string;
};

export default function RegisterPage() {
  const [org, setOrg] = useState('');
  const [orgName, setOrgName] = useState<string>('');
  const [lastError, setLastError] = useState('');
  const [okMsg, setOkMsg] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');
  const [email, setEmail]         = useState('');

  const [loading, setLoading]     = useState(false);

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
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          setLastError(msg);
        }
      })();
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!org) { setLastError('Не передан код организации (org).'); return; }
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setLastError('Заполните Фамилию, Имя и Email.');
      return;
    }

    try {
      setLoading(true); setLastError(''); setOkMsg('');
      const resp = await fetchJSON<RegisterResp>('/api/register', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          org,
          firstName: firstName.trim(),
          lastName:  lastName.trim(),
          email:     email.trim().toLowerCase(),
        }),
      });

      if (!resp.ok) throw new Error(resp.error || 'Не удалось завершить регистрацию');

      // Успешно: просто показываем сообщение.
      setOkMsg('Готово! Мы отправили письмо с персональной ссылкой для заказа обедов.');
      setFirstName('');
      setLastName('');
      setEmail('');
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
                onChange={e=>setLastName(e.target.value)}
                placeholder="Иванов"
                maxLength={64}
                required
              />
            </Field>
            <Field label="Имя">
              <Input
                value={firstName}
                onChange={e=>setFirstName(e.target.value)}
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
              onChange={e=>setEmail(e.target.value)}
              placeholder="name@company.com"
              inputMode="email"
              maxLength={120}
              required
            />
          </Field>

          {lastError && <div className="text-red-400 text-sm">{lastError}</div>}
          {okMsg && <div className="text-emerald-400 text-sm">{okMsg}</div>}

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={loading}>
              {loading ? 'Отправляем…' : 'Зарегистрировать'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={()=>{
                setFirstName(''); setLastName(''); setEmail(''); setOkMsg(''); setLastError('');
              }}
            >
              Очистить
            </Button>
          </div>
        </form>
      </Panel>
    </main>
  );
}
