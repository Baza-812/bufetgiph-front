// src/app/order/OrderClient.tsx
'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Input, { Field } from '@/components/ui/Input';
import { fetchJSON, fmtDayLabel } from '@/lib/api';
import HintDates from '@/components/HintDates';

/* ===================== НОВОЕ: мини-опросник ===================== */

const POLL_ID = 'wk-2025-11-24';
const POLL_DEADLINE_UTC = Date.UTC(2025, 9, 31, 20, 59, 59); // 31 Oct 23:59 (Europe/Bucharest +03) = 20:59:59 UTC

type PollState = {
  a: number; // Скандинавская
  b: number; // Греческая
  youVoted: 'a' | 'b' | null;
  loaded: boolean;
  error?: string;
};

function isPollClosed(): boolean {
  return Date.now() > POLL_DEADLINE_UTC;
}

function prettySplit(a: number, b: number) {
  const total = Math.max(1, a + b);
  const pa = a / total;
  const pb = b / total;
  return {
    aWidth: Math.max(6, Math.round(pa * 100)),
    bWidth: Math.max(6, Math.round(pb * 100)),
    leader: pa === pb ? 'tie' : pa > pb ? 'a' : 'b',
  };
}

function ResultBars(props: { a: number; b: number }) {
  const { aWidth, bWidth, leader } = prettySplit(props.a, props.b);
  const tag = (key: 'a' | 'b') => (leader === 'tie' ? 'идут ровно' : leader === key ? 'лидирует' : 'чуть позади');

  return (
    <div className="mt-3 space-y-3">
      <div>
        <div className="flex items-center justify-between mb-1 text-sm">
          <span className="text-white/70">Скандинавская</span>
          <span className="text-white/40">{tag('a')}</span>
        </div>
        <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden">
          <div className="h-3 bg-white/70 rounded-r-full transition-all" style={{ width: `${aWidth}%` }} />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1 text-sm">
          <span className="text-white/70">Греческая</span>
          <span className="text-white/40">{tag('b')}</span>
        </div>
        <div className="w-full h-3 rounded-full bg-white/10 overflow-hidden">
          <div className="h-3 bg-white/50 rounded-r-full transition-all" style={{ width: `${bWidth}%` }} />
        </div>
      </div>
    </div>
  );
}

function PollBlock({ org, employeeID, token }: { org: string; employeeID: string; token: string }) {
  const [st, setSt] = useState<PollState>({ a: 0, b: 0, youVoted: null, loaded: false });
  const [submitting, setSubmitting] = useState(false);

  // 🔧 ключ локального "я голосовал" зависит от сотрудника
  const votedKey = `baza.poll.${POLL_ID}.voted.${employeeID || 'unknown'}`;

  useEffect(() => {
    let ignore = false;

    async function load() {
      try {
        // ❗️удалим старый общий ключ, если он остался от предыдущей версии
        localStorage.removeItem(`baza.poll.${POLL_ID}.voted`);

        const r = await fetchJSON<{ ok: boolean; a: number; b: number }>(
          `/api/poll?pollId=${encodeURIComponent(POLL_ID)}`
        );

        if (ignore) return;

        // читаем локальное "я голосовал" только когда employeeID уже известен
        const you = employeeID
          ? ((localStorage.getItem(votedKey) as 'a' | 'b' | null) || null)
          : null;

        setSt({ a: r.a ?? 0, b: r.b ?? 0, youVoted: you, loaded: true });
      } catch {
        const you = employeeID
          ? ((localStorage.getItem(votedKey) as 'a' | 'b' | null) || null)
          : null;

        setSt({
          a: 1,
          b: 1,
          youVoted: you,
          loaded: true,
          error: 'Предпросмотр без серверных данных.',
        });
      }
    }

    if (employeeID) load();        // ждём, пока придёт employeeID
    else setSt(s => ({ ...s, loaded: true, youVoted: null })); // ещё не знаем, кто — показываем кнопки

    return () => { ignore = true; };
  }, [employeeID, votedKey]);

  async function vote(choice: 'a' | 'b') {
    if (isPollClosed() || st.youVoted) return;
    setSubmitting(true);
    try {
      setSt(prev => ({ ...prev, [choice]: (prev as any)[choice] + 1, youVoted: choice }));
      if (employeeID) localStorage.setItem(votedKey, choice); // ⚠️ пишем только если знаем сотрудника
      await fetchJSON('/api/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pollId: POLL_ID, org, employeeID, token, choice }),
      }).catch(() => void 0);
    } finally {
      setSubmitting(false);
    }
  }

  const closed = isPollClosed();
  ...
}

  return (
    <Panel title="Выбор недели национальной кухни · 24–28 ноября">
      <div className="max-w-2xl mx-auto w-full">
        <div className="grid gap-4">
          <div className="w-full flex justify-center">
  <img
    src="/polls/greek-vs-scandi.jpg"
    alt="Скандинавская vs Греческая кухня"
    className="max-w-full h-auto max-h-56 sm:max-h-64 object-contain rounded-xl border border-white/10 bg-black/20 p-0"
  />
</div>

          <div className="space-y-2 text-white/80">
            <p>
              С 24–28 ноября готовим тематическую неделю национальной кухни. Помогите выбрать, что
              устроим первой: бодрящую <span className="font-semibold">Скандинавскую</span> или солнечную{' '}
              <span className="font-semibold">Греческую</span>. Ваш голос — маленький шаг к большому вкусному плану!
            </p>
            <p className="text-white/60 text-sm">
              Приём голосов — до <span className="font-medium">31 октября</span>. Мы покажем только относительное
              соотношение (полосы без цифр). Абсолютные результаты видит только команда кухни.
            </p>
          </div>

          {!closed && !st.youVoted && (
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => vote('a')}
                disabled={!st.loaded || submitting}
                className="bg-yellow-400/80 hover:bg-yellow-400 text-black border border-yellow-500/40"
                variant="ghost"
              >
                Скандинавская неделя
              </Button>
              <Button
                onClick={() => vote('b')}
                disabled={!st.loaded || submitting}
                className="bg-yellow-400/80 hover:bg-yellow-400 text-black border border-yellow-500/40"
                variant="ghost"
              >
                Греческая неделя
              </Button>
            </div>
          )}

          {(st.youVoted || closed) && (
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-sm">
              <div className="text-white/80">
                {closed ? 'Голосование завершено. Спасибо всем!' : 'Спасибо за голос! Текущее соотношение ниже.'}
              </div>
              <ResultBars a={st.a} b={st.b} />
            </div>
          )}

          {st.error && <div className="text-xs text-white/40">{st.error}</div>}
        </div>
      </div>
    </Panel>
  );
}

/* ===================== КОНЕЦ нового блока ===================== */


type SingleResp = {
  ok: boolean;
  summary: null | {
    fullName: string;
    date: string;
    mealBox: string;
    extra1: string;
    extra2: string;
    orderId: string;
  };
};

export default function OrderClient() {
  const router = useRouter();

  // креды
  const [org, setOrg] = useState('');
  const [employeeID, setEmployeeID] = useState('');
  const [token, setToken] = useState('');

  // данные
  const [dates, setDates] = useState<string[]>([]);
  const [busy, setBusy] = useState<Record<string, SingleResp>>({});
  const [busyReady, setBusyReady] = useState(false); // ← готовность статуса занятости/серости

  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null); // для модалки
  const [error, setError] = useState('');

  // 1) забираем креды из query/localStorage (один раз)
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

   // 2) опубликованные даты
  useEffect(() => {
    (async () => {
      if (!org) return;
      try {
        setLoading(true); setError('');
        const r = await fetchJSON<{ ok: boolean; dates: string[] }>(`/api/dates?org=${encodeURIComponent(org)}`);
        setDates(r.dates || []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [org]);

  // Перезагрузка «занятости» одним запросом /api/busy
  const reloadBusy = useCallback(async () => {
    if (!employeeID || !org || !token || dates.length === 0) return;
    setBusyReady(false);
    try {
      const qs = new URLSearchParams({
        employeeID, org, token,
        dates: dates.join(','),
      });
      const r = await fetchJSON<{ ok: boolean; busy: Record<string, boolean> }>(`/api/busy?${qs.toString()}`);
      const map: Record<string, SingleResp> = {};
      for (const d of dates) {
        map[d] = r.busy[d]
          ? { ok: true, summary: { orderId: '__has__', fullName: '', date: d, mealBox: '', extra1: '', extra2: '' } as any }
          : { ok: true, summary: null };
      }
      setBusy(map);
    } catch {
      const map: Record<string, SingleResp> = {};
      for (const d of dates) map[d] = { ok: false, summary: null };
      setBusy(map);
    } finally {
      setBusyReady(true);
    }
  }, [dates, employeeID, org, token]);

  // первичная загрузка busy
  useEffect(() => { reloadBusy(); }, [reloadBusy]);

  // обновлять при возвращении на вкладку (после квиза)
  useEffect(() => {
    const onFocus = () => { reloadBusy(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reloadBusy]);

  const name = useMemo(() => busy[selected || '']?.summary?.fullName || '', [busy, selected]);

  // 4) клик по дате
  async function handlePickDate(d: string) {
    // Если занятость ещё не подгрузилась — проверим точечно, чтобы не улететь в квиз по ошибке
    if (!busyReady) {
      try {
        const u = new URL('/api/hr_orders', window.location.origin);
        u.searchParams.set('mode', 'single');
        u.searchParams.set('employeeID', employeeID);
        u.searchParams.set('org', org);
        u.searchParams.set('token', token);
        u.searchParams.set('date', d);
        const r = await fetchJSON<SingleResp>(u.toString());
        if (r?.summary?.orderId) {
          setSelected(d); // есть заказ — модалка
          return;
        }
        // свободно — квиз
        const q = new URL('/order/quiz', window.location.origin);
        q.searchParams.set('date', d);
        q.searchParams.set('step', '1');
        q.searchParams.set('org', org);
        q.searchParams.set('employeeID', employeeID);
        q.searchParams.set('token', token);
        router.push(q.toString());
        return;
      } catch {
        // на ошибке — пускаем в квиз, чтобы не стопорить пользователя
        const q = new URL('/order/quiz', window.location.origin);
        q.searchParams.set('date', d);
        q.searchParams.set('step', '1');
        q.searchParams.set('org', org);
        q.searchParams.set('employeeID', employeeID);
        q.searchParams.set('token', token);
        router.push(q.toString());
        return;
      }
    }

    // Когда занятость известна — решаем локально
    const isBusy = Boolean(busy[d]?.summary);
    if (!isBusy) {
      const q = new URL('/order/quiz', window.location.origin);
      q.searchParams.set('date', d);
      q.searchParams.set('step', '1');
      q.searchParams.set('org', org);
      q.searchParams.set('employeeID', employeeID);
      q.searchParams.set('token', token);
      router.push(q.toString());
      return;
    }
    setSelected(d); // занято — модалка
  }

  return (
    <main>
      <Panel title="Добро пожаловать!">
        <p className="text-white/80">
          Здесь вы можете выбрать обед на подходящий день. Нажмите на дату ниже.
        </p>
      </Panel>

      {/* НОВОЕ: опросник про неделю национальной кухни */}
      {org && employeeID && token && <PollBlock org={org} employeeID={employeeID} token={token} />}

      {/* креды вручную — на случай, если пришли без query */}
      {(!org || !employeeID || !token) && (
        <Panel title="Данные доступа">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Org">
              <Input value={org} onChange={e=>setOrg(e.target.value)} placeholder="org120" />
            </Field>
            <Field label="Employee ID">
              <Input value={employeeID} onChange={e=>setEmployeeID(e.target.value)} placeholder="rec..." />
            </Field>
            <Field label="Token">
              <Input value={token} onChange={e=>setToken(e.target.value)} placeholder="token" />
            </Field>
          </div>
          <div className="text-xs text-white/50">Обычно эти поля подставляются автоматически из персональной ссылки.</div>
        </Panel>
      )}

      <Panel title="Выберите дату">
        {loading && <div className="text-white/60 text-sm">Загрузка дат…</div>}
        {error && <div className="text-red-400 text-sm">Ошибка: {error}</div>}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {dates.map(d => {
            const has = Boolean(busy[d]?.summary); // СЕРОЕ если заказ уже есть
            const label = fmtDayLabel(d);
            return (
              <Button
                key={d}
                onClick={() => handlePickDate(d)}
                className="w-full"
                variant={has ? 'ghost' : 'primary'}
                disabled={!busyReady} // ← до загрузки «серости» клики блокируем
              >
                {label}
              </Button>
            );
          })}
        </div>

        <HintDates />
        
        {/* Легенда */}
        
      </Panel>

      {/* Модалка со составом — показываем только когда выбран день */}
      {selected && (
        <DateModal
          iso={selected}
          employeeID={employeeID}
          org={org}
          token={token}
          info={busy[selected]}
          onClose={() => setSelected(null)}
          onChanged={reloadBusy}
        />
      )}
    </main>
  );
}

/* ——— Модалка: состав + действия — всегда остаётся открытой; показывает лоадер, пока тянем детали ——— */
function DateModal({
  iso, employeeID, org, token, info, onClose, onChanged,
}: {
  iso: string;
  employeeID: string; org: string; token: string;
  info?: SingleResp; onClose: ()=>void; onChanged: ()=>void;
}) {
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState('');
  const [sum, setSum] = useState<SingleResp['summary'] | null>(info?.summary || null);
  const [loading, setLoading] = useState(false);

  // дозагружаем детали, если у нас только «заглушка» (orderId='__has__') или ничего нет
  useEffect(() => {
    let ignore = false;
    (async () => {
      const needFetch = !info?.summary || info.summary.orderId === '__has__';
      if (!needFetch) { setSum(info!.summary); return; }
      try {
        setLoading(true); setErr('');
        const u = new URL('/api/hr_orders', window.location.origin);
        u.searchParams.set('mode','single');
        u.searchParams.set('employeeID', employeeID);
        u.searchParams.set('org', org);
        u.searchParams.set('token', token);
        u.searchParams.set('date', iso);
        const r = await fetchJSON<SingleResp>(u.toString());
        if (!ignore) setSum(r?.summary || null);
      } catch (e) {
        if (!ignore) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => { ignore = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso, employeeID, org, token]);

  async function cancelOrder() {
    if (!sum?.orderId) return;
    try {
      setWorking(true); setErr('');
      await fetchJSON('/api/order_cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeID, org, token, orderId: sum.orderId, reason: 'user_cancel' })
      });
      onClose();
      onChanged(); // обновим «серость»
          } catch(e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally { setWorking(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-2 sm:p-6">
      <div className="w-full sm:max-w-lg bg-panel border border-white/10 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-lg font-bold">{fmtDayLabel(iso)}</div>
          <button onClick={onClose} className="text-white/60 hover:text-white text-sm">Закрыть</button>
        </div>

        <div className="space-y-2 text-sm">
          {loading && <div className="text-white/60">Загрузка данных заказа…</div>}

          {!loading && sum?.orderId && (
            <>
              <div className="text-white/80">Заказ уже оформлен на эту дату.</div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                <div><span className="text-white/60">Сотрудник:</span> {sum?.fullName || '—'}</div>
                <div><span className="text-white/60">Meal Box:</span> {sum?.mealBox || '—'}</div>
                <div><span className="text-white/60">Экстра 1:</span> {sum?.extra1 || '—'}</div>
                <div><span className="text-white/60">Экстра 2:</span> {sum?.extra2 || '—'}</div>
              </div>
            </>
          )}

          {!loading && !sum?.orderId && (
            <div className="text-white/70">
              Не удалось получить состав заказа. Вы можете перейти к изменению.
            </div>
          )}

          {err && <div className="text-red-400">{err}</div>}

          <div className="flex gap-3 pt-2">
            <Button onClick={onClose}>ОК</Button>

<Button
  variant="ghost"
  onClick={() => {
    const u = new URL('/order/quiz', window.location.origin);
    u.searchParams.set('date', iso);
    u.searchParams.set('step', '1');
    u.searchParams.set('org', org);
    u.searchParams.set('employeeID', employeeID);
    u.searchParams.set('token', token);
    if (sum?.orderId) u.searchParams.set('orderId', sum.orderId); // правка существующего
    window.location.href = u.toString();
  }}
>
  Изменить
</Button>

<Button
  variant="danger"
  onClick={cancelOrder}
  disabled={working || !sum?.orderId}
>
  {working ? 'Отмена…' : 'Отменить'}
</Button>

          </div>
        </div>
      </div>
    </div>
  );
}
