'use client';

import { useEffect, useState } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Input, { Field } from '@/components/ui/Input';

type OrgResp = { ok:boolean; orgName?:string; org?:string; error?:string };
type RegisterResp = { ok:boolean; sent?:boolean; email?:string; error?:string };

export default function RegisterPage() {
  const [org, setOrg] = useState('');
  const [orgName, setOrgName] = useState<string>('');

  const [lastName, setLastName]   = useState('');
  const [firstName, setFirstName] = useState('');
  const [email, setEmail]         = useState('');

  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState('');
  const [okMsg, setOkMsg]     = useState<string>('');

  // читаем org из ссылки и подтягиваем её название
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const o = q.get('org') || '';
    setOrg(o);

    if (o) {
      fetch(`/api/org_name?org=${encodeURIComponent(o)}`)
        .then(r => r.json())
        .then((js:OrgResp) => setOrgName(js.orgName || ''))
        .catch(()=>{});
    }
  }, []);

  function canSubmit() {
    return !!(org && lastName.trim() && firstName.trim() && email.trim());
  }

  async function onSubmit() {
    try {
      setErr(''); setOkMsg(''); setLoading(true);

      // примитивная валидация e-mail
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        throw new Error('Введите корректный e-mail');
      }

      const r = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          org,
          firstName: firstName.trim(),
          lastName : lastName.trim(),
          email    : email.trim(),
        })
      });
      const js: RegisterResp = await r.json();
      if (!js.ok) throw new Error(js.error || 'Не удалось выполнить регистрацию');

      // Ссылку НЕ показываем — только сообщение об успехе
      setOkMsg(`Письмо с персональной ссылкой отправлено на ${js.email || email}.`);
    } catch (e:any) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <Panel title={`Регистрация для заказа обедов${orgName ? ' · '+orgName : ''}`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Фамилия">
            {/* компактная ширина */}
            <Input className="max-w-sm" value={lastName} onChange={e=>setLastName(e.target.value)} />
          </Field>

          <Field label="Имя">
            <Input className="max-w-sm" value={firstName} onChange={e=>setFirstName(e.target.value)} />
          </Field>

          <div className="md:col-span-2">
  <Field label="Email">
    <Input
      className="max-w-md"
      type="email"
      value={email}
      onChange={(e) => setEmail(e.target.value)}
    />
    {/* подсказка вместо prop help */}
    <p className="text-white/60 text-xs mt-1">
      На этот адрес придёт постоянная персональная ссылка для заказа обедов.
    </p>
  </Field>
</div>
        </div>

        {err && <div className="text-red-400 text-sm mt-3">{err}</div>}
        {okMsg && <div className="text-green-400 text-sm mt-3">{okMsg}</div>}

        <div className="mt-4 flex gap-3">
          <Button onClick={onSubmit} disabled={!canSubmit() || loading}>
            {loading ? 'Отправка…' : 'Отправить'}
          </Button>
          <Button variant="ghost" onClick={()=>history.back()}>Назад</Button>
        </div>
      </Panel>
    </main>
  );
}
