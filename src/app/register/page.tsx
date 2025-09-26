// src/app/register/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Input, { Field } from '@/components/ui/Input';
import { fetchJSON } from '@/lib/api';

type OrgInfoResp = { ok: boolean; name?: string; error?: string };
type RegisterResp =
  | { ok: true; employeeId: string }
  | { ok: false; error: string };

export default function RegisterPage() {
  const [org, setOrg] = useState('');
  const [orgName, setOrgName] = useState<string>('');

  const [lastName, setLastName] = useState('');
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>('');
  const [err, setErr] = useState<string>('');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const o = q.get('org') || '';
    setOrg(o);

    (async () => {
      if (!o) return;
      try {
        setErr('');
        const resp = await fetchJSON<OrgInfoResp>(`/api/org_info?org=${encodeURIComponent(o)}`);
        if (!resp.ok) throw new Error(resp.error || 'Ошибка загрузки организации');
        setOrgName(resp?.name || '');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setErr(msg);
      }
    })();
  }, []);

  async function submit() {
    try {
      setBusy(true);
      setErr(''); setMsg('');
      const body = { org, lastName, firstName, email };
      const opts: RequestInit = {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(body),
      };
      const r = await fetchJSON<RegisterResp>('/api/register', opts);
      if (!r.ok) throw new Error(r.error || 'Не удалось зарегистрировать сотрудника');
      setMsg('Готово! Ссылка отправлена на указанный email.');
      setLastName(''); setFirstName(''); setEmail('');
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : String(e);
      setErr(m);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <Panel title="Регистрация сотрудника">
        <div className="text-white/80 mb-2">
          Организация: <span className="font-semibold">{orgName || org || '—'}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Фамилия">
            <Input
              value={lastName}
              onChange={e=>setLastName(e.target.value)}
              placeholder="Иванов"
              maxLength={64}
            />
          </Field>
          <Field label="Имя">
            <Input
              value={firstName}
              onChange={e=>setFirstName(e.target.value)}
              placeholder="Иван"
              maxLength={64}
            />
          </Field>
          <Field label='Email' help='На этот адрес придёт постоянная ссылка для заказа обедов'>
            <Input
              type="email"
              value={email}
              onChange={e=>setEmail(e.target.value)}
              placeholder="name@company.com"
              maxLength={120}
            />
          </Field>
        </div>

        {err && <div className="text-red-400 text-sm mt-3">{err}</div>}
        {msg && <div className="text-green-400 text-sm mt-3">{msg}</div>}

        <div className="mt-4 flex gap-3">
          <Button onClick={submit} disabled={busy || !org || !email || !lastName || !firstName}>
            {busy ? 'Отправка…' : 'Зарегистрировать и выслать ссылку'}
          </Button>
        </div>
      </Panel>
    </main>
  );
}
