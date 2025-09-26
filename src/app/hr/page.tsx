// src/app/hr/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Input, { Field } from '@/components/ui/Input';

type HRListResp = {
  ok: boolean;
  count: number;
  items: {
    id: string;
    name: string;
    email: string;
    status: string;
    role: string;
    hasToken: boolean;
    personalUrl: string | null;
    lastInvite: string | null; // YYYY-MM-DD
  }[];
};

export default function HRPage() {
  const [org, setOrg] = useState('');
  const [employeeID, setEmployeeID] = useState('');
  const [token, setToken] = useState('');

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [rows, setRows] = useState<HRListResp['items']>([]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const o = q.get('org') || localStorage.getItem('baza.org') || '';
    const e = q.get('employeeID') || localStorage.getItem('baza.employeeID') || '';
    const t = q.get('token') || localStorage.getItem('baza.token') || '';
    setOrg(o); setEmployeeID(e); setToken(t);
  }, []);

  async function load() {
    if (!org || !employeeID || !token) { setErr('Укажите org, employeeID и token'); return; }
    try {
      setLoading(true); setErr('');
      const u = new URL('/api/hr_employees', window.location.origin);
      u.searchParams.set('org', org);
      u.searchParams.set('employeeID', employeeID);
      u.searchParams.set('token', token);
      const r = await fetch(u.toString());
      const js: HRListResp = await r.json();
      if (!js.ok) throw new Error((js as any).error || 'Ошибка загрузки');
      setRows(js.items || []);
      // сохраним доступы
      localStorage.setItem('baza.org', org);
      localStorage.setItem('baza.employeeID', employeeID);
      localStorage.setItem('baza.token', token);
    } catch (e:any) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  function toCSV() {
    const sep = ';';
    const lines = [
      ['FullName','Email','Status','Role','HasToken','PersonalURL','LastInvite'].join(sep),
      ...rows.map(r => [
        csvCell(r.name),
        csvCell(r.email),
        csvCell(r.status),
        csvCell(r.role),
        r.hasToken ? '1' : '0',
        csvCell(r.personalUrl || ''),
        csvCell(r.lastInvite || '')
      ].join(sep))
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `employees_${org}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const countWithToken = useMemo(() => rows.filter(r=>r.hasToken).length, [rows]);

  return (
    <main>
      <Panel title="Сотрудники (HR)">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Org"><Input value={org} onChange={e=>setOrg(e.target.value)} placeholder="org120" /></Field>
          <Field label="Ваш Employee ID"><Input value={employeeID} onChange={e=>setEmployeeID(e.target.value)} placeholder="rec..." /></Field>
          <Field label="Token"><Input value={token} onChange={e=>setToken(e.target.value)} placeholder="token" /></Field>
        </div>
        <div className="mt-4 flex gap-3">
          <Button onClick={load} disabled={loading}>{loading ? 'Загрузка…' : 'Загрузить список'}</Button>
          <Button variant="ghost" onClick={toCSV} disabled={!rows.length}>Скачать CSV</Button>
        </div>
        {err && <div className="text-red-400 text-sm mt-2">{err}</div>}
      </Panel>

      {!!rows.length && (
        <Panel title={`Сотрудники: ${rows.length} (c активной ссылкой: ${countWithToken})`}>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-white/70">
                  <th className="py-2 pr-4">ФИО</th>
                  <th className="py-2 pr-4">E-mail</th>
                  <th className="py-2 pr-4">Статус</th>
                  <th className="py-2 pr-4">Роль</th>
                  <th className="py-2 pr-4">Ссылка</th>
                  <th className="py-2 pr-0">Последняя рассылка</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-t border-white/10">
                    <td className="py-2 pr-4">{r.name || '—'}</td>
                    <td className="py-2 pr-4">{r.email || '—'}</td>
                    <td className="py-2 pr-4">{r.status || '—'}</td>
                    <td className="py-2 pr-4">{r.role || '—'}</td>
                    <td className="py-2 pr-4">
                      {r.hasToken && r.personalUrl ? (
                        <CopyLink url={r.personalUrl} />
                      ) : <span className="text-white/50">нет</span>}
                    </td>
                    <td className="py-2 pr-0">{r.lastInvite || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </main>
  );
}

function csvCell(v: string) {
  const needsQuotes = /[;"\n]/.test(v);
  const esc = v.replace(/"/g, '""');
  return needsQuotes ? `"${esc}"` : esc;
}

function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={async ()=>{ await navigator.clipboard.writeText(url); setDone(true); setTimeout(()=>setDone(false), 1200); }}
      className="text-xs inline-flex items-center px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20"
      title={url}
    >
      {done ? 'Скопировано' : 'Копировать'}
    </button>
  );
}
