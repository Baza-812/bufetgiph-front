// src/app/order/quiz/QuizClient.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Input, { Field } from '@/components/ui/Input';
import { fetchJSON, mapMenuItem, MenuItem } from '@/lib/api';
import { loadDraft, saveDraft } from '@/lib/draft';

type RawMenu = { id: string; fields?: Record<string, unknown> };
type MenuAPIResponse = { ok?: boolean; items?: RawMenu[]; records?: RawMenu[]; menu?: RawMenu[] };

const SALAD_CATS = ['Salad'];
const SWAP_CATS = ['Zapekanka', 'Pastry', 'Fruit', 'Drink'];
const SOUP_CATS = ['Soup'];
const MAIN_CATS = ['Main'];
const SIDE_CATS = ['Side'];

type Draft = {
  date: string;
  saladId?: string; saladName?: string; saladIsSwap?: boolean;
  soupId?: string;  soupName?: string;  soupIsSwap?: boolean;
  mainId?: string;  mainName?: string;  mainGarnirnoe?: boolean;
  sideId?: string;  sideName?: string | null;
  tariffCode?: 'Full' | 'Light';
  paymentMethod?: 'Cash' | 'Online';
};

type OrgInfo = {
  ok: boolean;
  org?: {
    name: string;
    vidDogovora?: string;
    priceFull?: number;
    priceLight?: number;
  };
};

const isGarnirnoe = (it: MenuItem) => Boolean((it as unknown as { garnirnoe?: boolean }).garnirnoe);

export default function QuizClient() {
  const sp = useSearchParams();
  const qFor = sp.get('forEmployeeID') || '';
  const qOrderId = sp.get('orderId') || '';
  const qOrg  = sp.get('org') || '';
  const qEmp  = sp.get('employeeID') || '';
  const qTok  = sp.get('token') || '';
  const router = useRouter();

  const date = sp.get('date') || '';
  const step = sp.get('step') || '0';

  const [org, setOrg] = useState(qOrg || '');
  const [employeeID, setEmployeeID] = useState(qEmp || '');
  const [token, setToken] = useState(qTok || '');
  const [role, setRole] = useState('');

  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [orgInfo, setOrgInfo] = useState<OrgInfo | null>(null);

  const [draft, setDraft] = useState<Draft>(() => {
    const saved = loadDraft(date) || {};
    return { date, ...(saved as Partial<Draft>) };
  });

  useEffect(() => {
    setDraft(() => ({ date, ...(loadDraft(date) as Partial<Draft>) }));
  }, [date]);

  useEffect(() => {
    if (!org)  setOrg(localStorage.getItem('baza.org') || '');
    if (!employeeID) setEmployeeID(localStorage.getItem('baza.employeeID') || '');
    if (!token) setToken(localStorage.getItem('baza.token') || '');
    setRole(localStorage.getItem('baza.role') || '');
  }, []);

  useEffect(() => {
    if (org)  localStorage.setItem('baza.org', org);
    if (employeeID) localStorage.setItem('baza.employeeID', employeeID);
    if (token) localStorage.setItem('baza.token', token);
  }, [org, employeeID, token]);

  // Загружаем информацию об организации
  useEffect(() => {
    (async () => {
      if (!org) return;
      try {
        const r = await fetchJSON<OrgInfo>(`/api/org_info?org=${encodeURIComponent(org)}`);
        setOrgInfo(r);
      } catch (e) {
        console.error('Failed to load org info:', e);
      }
    })();
  }, [org]);

  // Грузим меню
  useEffect(() => {
    (async () => {
      if (!date || !org) return;
      try {
        setLoading(true); setErr('');
        const u = new URL('/api/menu', window.location.origin);
        u.searchParams.set('date', date);
        u.searchParams.set('org', org);
        const r = await fetchJSON<MenuAPIResponse>(u.toString());
        const rows = (r.items ?? r.records ?? r.menu ?? []) as RawMenu[];
        const arr = rows.map(mapMenuItem);
        setMenu(arr);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setErr(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, [date, org]);

  const byCat = useMemo(() => {
    const NORM: Record<string, string> = {
      Casseroles: 'Zapekanka',
      Bakery:     'Zapekanka',
      Pancakes:   'Zapekanka',
      Salads:     'Salad',
      Soups:      'Soup',
      Zapekanka:  'Zapekanka',
      Salad:      'Salad',
      Soup:       'Soup',
      Main:       'Main',
      Side:       'Side',
      Pastry:     'Pastry',
      Fruit:      'Fruit',
      Drink:      'Drink',
    };
    const m: Record<string, MenuItem[]> = {};
    for (const x of menu) {
      const raw = x.category || 'Other';
      const c = NORM[raw] || 'Other';
      (m[c] ||= []).push({ ...x, category: c });
    }
    return m;
  }, [menu]);

  function go(nextStep: string) {
    const u = new URL(window.location.href);
    u.searchParams.set('step', nextStep);
    router.push(u.pathname + '?' + u.searchParams.toString());
  }

  // Проверяем, нужна ли программа "Старший"
  const isStarshiy = orgInfo?.org?.vidDogovora === 'Starshiy';
  const isKomanda = role?.toLowerCase() === 'komanda';
  const needsStarshiy = isStarshiy && isKomanda;

  // ===== Actions
  function pickTariff(tariff: 'Full' | 'Light') {
    const d: Draft = { ...draft, date, tariffCode: tariff };
    setDraft(d); saveDraft(d);
    go('1');
  }

  function pickSalad(it: MenuItem, isSwap=false) {
    const d: Draft = { ...draft, date, saladId: it.id, saladName: it.name, saladIsSwap: isSwap };
    setDraft(d); saveDraft(d);
    go('3');
  }

  function pickSoup(it: MenuItem, isSwap=false) {
    const d: Draft = { ...draft, date, soupId: it.id, soupName: it.name, soupIsSwap: isSwap };
    setDraft(d); saveDraft(d);
    go('4');
  }

  function pickMain(it: MenuItem) {
    const garn = isGarnirnoe(it);
    const d: Draft = {
      ...draft, date,
      mainId: it.id, mainName: it.name, mainGarnirnoe: garn
    };
    setDraft(d); saveDraft(d);
    if (garn) go('6'); else go('5');
  }

  function pickSide(it: MenuItem | null) {
    const d: Draft = { ...draft, date, sideId: it?.id, sideName: it?.name || null };
    setDraft(d); saveDraft(d);
    // Если программа "Старший" — идём на выбор оплаты
    if (needsStarshiy) {
      go('6.5');
    } else {
      go('6');
    }
  }

  function pickPayment(method: 'Cash' | 'Online') {
    const d: Draft = { ...draft, date, paymentMethod: method };
    setDraft(d); saveDraft(d);
    go('6');
  }

  async function submitOrder() {
    try {
      setLoading(true); setErr('');

      const extras: string[] = [];
      if (draft.saladId) extras.push(draft.saladId);
      if (draft.soupId)  extras.push(draft.soupId);

      const included = {
        mainId: draft.mainId || undefined,
        sideId: draft.sideId || undefined,
        extras: extras.slice(0, 2),
      };

      if (qOrderId) {
        const bodyUpd: Record<string, unknown> = {
          employeeID, org, token,
          orderId: qOrderId,
          included,
        };
        if (qFor) bodyUpd.forEmployeeID = qFor;
        if (needsStarshiy) {
          bodyUpd.programType = 'Starshiy';
          bodyUpd.tariffCode = draft.tariffCode || 'Full';
          bodyUpd.paymentMethod = draft.paymentMethod || 'Cash';
        }

        const r = await fetchJSON<{ ok: boolean; error?: string }>(
          '/api/order_update',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyUpd),
          }
        );

        if (!r?.ok) throw new Error(r?.error || 'Не удалось обновить заказ');
      } else {
        const bodyCreate: Record<string, unknown> = {
          employeeID, org, token, date,
          included,
          clientToken: crypto.randomUUID(),
        };
        if (qFor) bodyCreate.forEmployeeID = qFor;
        if (needsStarshiy) {
          bodyCreate.programType = 'Starshiy';
          bodyCreate.tariffCode = draft.tariffCode || 'Full';
          bodyCreate.paymentMethod = draft.paymentMethod || 'Cash';
        }

        const r = await fetchJSON<{ ok: boolean; orderId?: string; error?: string; paymentLink?: string }>(
  '/api/order',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyCreate),
  }
);

if (!r?.ok && !r?.orderId) throw new Error(r?.error || 'Не удалось создать заказ');

// Если есть ссылка на оплату — редирект на страницу YooKassa
if (r?.paymentLink && draft.paymentMethod === 'Online') {
  saveDraft({ date } as Draft); // Очищаем черновик перед редиректом
  window.location.href = r.paymentLink;
  return;
}
      }

      saveDraft({ date } as Draft);

      const backTo = sp.get('back') || '';
      if (backTo) {
        const u = new URL(backTo, window.location.origin);
        u.searchParams.set('org', org);
        u.searchParams.set('employeeID', employeeID);
        u.searchParams.set('token', token);
        return router.push(u.toString());
      }

      const u = new URL('/order', window.location.origin);
      u.searchParams.set('employeeID', employeeID);
      u.searchParams.set('org', org);
      u.searchParams.set('token', token);
      router.push(u.toString());
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const niceDate = formatRuDate(date);

  return (
    <main>
      <Panel title={<span className="text-white">{niceDate}</span>}>
        {!org || !employeeID || !token ? (
          <div className="mb-4 text-sm text-white/70">
            Данные доступа не найдены в ссылке — заполните вручную:
          </div>
        ) : null}

        {(!org || !employeeID || !token) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Field label="Org"><Input value={org} onChange={e=>setOrg(e.target.value)} placeholder="org120" /></Field>
            <Field label="Employee ID"><Input value={employeeID} onChange={e=>setEmployeeID(e.target.value)} placeholder="rec..." /></Field>
            <Field label="Token"><Input value={token} onChange={e=>setToken(e.target.value)} placeholder="token" /></Field>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-white/60 overflow-x-auto">
          {needsStarshiy && <span className={cxStep(step,'0')}>0. Тариф</span>}
          {needsStarshiy && <span>→</span>}
          <span className={cxStep(step,'1')}>1. Меню</span>
          <span>→</span>
          <span className={cxStep(step,'2')}>2. Салат</span>
          <span>→</span>
          <span className={cxStep(step,'3')}>3. Суп</span>
          <span>→</span>
          <span className={cxStep(step,'4')}>4. Основное</span>
          <span>→</span>
          <span className={cxStep(step,'5')}>5. Гарнир</span>
          {needsStarshiy && <span>→</span>}
          {needsStarshiy && <span className={cxStep(step,'6.5')}>6. Оплата</span>}
          <span>→</span>
          <span className={cxStep(step,'6')}>7. Подтверждение</span>
        </div>
      </Panel>

      {loading && <Panel title="Загрузка"><div className="text-white/70">Загрузка…</div></Panel>}
      {err && <Panel title="Ошибка"><div className="text-red-400 text-sm">{err}</div></Panel>}

      {/* Шаг 0 — Выбор тарифа (только для Старший) */}
      {!loading && !err && step === '0' && needsStarshiy && (
        <TariffStep
          orgInfo={orgInfo}
          draft={draft}
          onPick={pickTariff}
          onBack={() => history.back()}
        />
      )}

      {/* Шаг 1 — Витрина */}
      {!loading && !err && step === '1' && (
        <>
          <Showcase byCat={byCat} />
          <div className="flex gap-3">
            <Button onClick={()=>go('2')}>Далее</Button>
            <Button variant="ghost" onClick={()=> needsStarshiy ? go('0') : history.back()}>Назад</Button>
          </div>
        </>
      )}

      {/* Шаг 2 — Салат */}
      {!loading && !err && step === '2' && (
        <SaladStep
          byCat={byCat}
          onPick={(it)=>pickSalad(it,false)}
          onSwap={()=>go('2a')}
          draft={draft}
          onBack={()=>go('1')}
          canSkip={draft.tariffCode === 'Light'}
          onSkip={() => go('4')}
        />
      )}

      {/* Шаг 2a — Замена салата */}
      {!loading && !err && step === '2a' && (
        <SwapStep
          title="Хочу заменить салат на …"
          byCat={byCat}
          cats={SWAP_CATS}
          onPick={(it)=>pickSalad(it,true)}
          onBack={()=>go('2')}
        />
      )}

      {/* Шаг 3 — Суп */}
      {!loading && !err && step === '3' && (
        <SoupStep
          byCat={byCat}
          onPick={(it)=>pickSoup(it,false)}
          onSwapSalad={()=>go('3s')}
          onSwapOther={()=>go('3a')}
          draft={draft}
          onBack={()=>go('2')}
        />
      )}

      {/* Шаг 3s — Замена супа на салат */}
      {!loading && !err && step === '3s' && (
        <SaladStep
          byCat={byCat}
          onPick={(it)=>pickSoup(it,true)}
          draft={draft}
          onBack={()=>go('3')}
        />
      )}

      {/* Шаг 3a — Замена супа на … */}
      {!loading && !err && step === '3a' && (
        <SwapStep
          title="Хочу заменить суп на …"
          byCat={byCat}
          cats={SWAP_CATS}
          onPick={(it)=>pickSoup(it,true)}
          onBack={()=>go('3')}
        />
      )}

      {/* Шаг 4 — Основное */}
      {!loading && !err && step === '4' && (
        <ListStep
          title="Выберите основное блюдо"
          byCat={byCat}
          cats={MAIN_CATS}
          onPick={pickMain}
          emptyText="На сегодня нет основных блюд."
          extraFooter={<Button variant="ghost" onClick={()=>go(draft.tariffCode === 'Light' ? '2' : '3')}>Назад</Button>}
        />
      )}

      {/* Шаг 5 — Гарнир */}
      {!loading && !err && step === '5' && (
        <ListStep
          title="Выберите гарнир"
          byCat={byCat}
          cats={SIDE_CATS}
          onPick={(it)=>pickSide(it)}
          emptyText="На сегодня нет гарниров."
          extraFooter={
            <div className="flex gap-3">
              <Button variant="ghost" onClick={()=>go('4')}>Назад</Button>
              <Button variant="ghost" onClick={()=>pickSide(null)}>Без гарнира</Button>
            </div>
          }
        />
      )}

      {/* Шаг 6.5 — Выбор способа оплаты (только для Старший) */}
      {!loading && !err && step === '6.5' && needsStarshiy && (
        <PaymentStep
          draft={draft}
          onPick={pickPayment}
          onBack={()=>go(draft.mainGarnirnoe ? '4' : '5')}
        />
      )}

      {/* Шаг 6 — Подтверждение */}
      {!loading && !err && step === '6' && (
        <ConfirmStep
          draft={draft}
          orgInfo={orgInfo}
          needsStarshiy={needsStarshiy}
          onSubmit={submitOrder}
          onBack={()=>go(needsStarshiy ? '6.5' : (draft.mainGarnirnoe ? '4' : '5'))}
        />
      )}
    </main>
  );
}

function cxStep(current:string, me:string) {
  const active = current === me;
  return `inline-flex items-center px-2.5 py-1 rounded-xl whitespace-nowrap ${
    active ? 'bg-yellow-400 text-black' : 'bg-white/10 text-white/70'
  }`;
}

/* Шаг 0. Выбор тарифа */
function TariffStep({ orgInfo, draft, onPick, onBack }: {
  orgInfo: OrgInfo | null;
  draft: Draft;
  onPick: (tariff: 'Full' | 'Light') => void;
  onBack: () => void;
}) {
  return (
    <Panel title="Выберите тариф">
      {draft.tariffCode && (
        <div className="mb-3 text-sm">
          <span className="text-white/60">Сейчас выбрано:</span>{' '}
          <span className="font-semibold">{draft.tariffCode === 'Full' ? 'Полный обед' : 'Лёгкий обед'}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div
          onClick={() => onPick('Full')}
          className="rounded-xl bg-white/5 border border-white/10 p-4 cursor-pointer hover:bg-white/10 transition-colors"
        >
          <div className="text-lg font-bold text-yellow-400 mb-2">Полный обед</div>
          <div className="text-2xl font-bold text-white mb-2">
            {orgInfo?.org?.priceFull ? `${orgInfo.org.priceFull} ₽` : '—'}
          </div>
          <div className="text-sm text-white/70 mb-3">
            Салат + Суп + Основное + Гарнир
          </div>
          <Button className="w-full">Выбрать</Button>
        </div>

        <div
          onClick={() => onPick('Light')}
          className="rounded-xl bg-white/5 border border-white/10 p-4 cursor-pointer hover:bg-white/10 transition-colors"
        >
          <div className="text-lg font-bold text-yellow-400 mb-2">Лёгкий обед</div>
          <div className="text-2xl font-bold text-white mb-2">
            {orgInfo?.org?.priceLight ? `${orgInfo.org.priceLight} ₽` : '—'}
          </div>
          <div className="text-sm text-white/70 mb-3">
            Салат + Основное + Гарнир
          </div>
          <Button className="w-full">Выбрать</Button>
        </div>
      </div>

      <div className="mt-4">
        <Button variant="ghost" onClick={onBack}>Назад</Button>
      </div>
    </Panel>
  );
}

/* Шаг 1. Витрина меню */
function Showcase({ byCat }:{ byCat: Record<string, MenuItem[]> }) {
  const ORDER = ['Zapekanka', 'Salad', 'Soup', 'Main', 'Side'];
  const ordered = ORDER.filter(c => byCat[c]?.length);

  return (
    <Panel title="Меню на день">
      {!ordered.length && <div className="text-white/70 text-sm">Меню пусто.</div>}
      <div className="space-y-6">
        {ordered.map(cat => (
          <section key={cat}>
            <h3 className="text-base font-bold mb-2 text-white">
              <span className="text-yellow-400">[</span>
              <span className="mx-1">{ruCat(cat)}</span>
              <span className="text-yellow-400">]</span>
            </h3>
            <ul className="space-y-2">
              {(byCat[cat] || []).map(it => (
                <li key={it.id} className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <div className="font-semibold text-white">{it.name}</div>
                  {it.description && <div className="text-white/70 text-xs leading-relaxed">{it.description}</div>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Panel>
  );
}

/* Шаг 2. Салат */
function SaladStep({ byCat, onPick, onSwap, draft, onBack, canSkip, onSkip }:{
  byCat: Record<string, MenuItem[]>;
  onPick: (it: MenuItem)=>void;
  onSwap?: ()=>void;
  draft: { saladId?: string; saladName?: string; saladIsSwap?: boolean };
  onBack: ()=>void;
  canSkip?: boolean;
  onSkip?: ()=>void;
}) {
  const salads = SALAD_CATS.flatMap(c => byCat[c] || []);
  return (
    <Panel title="Выберите салат">
      {draft?.saladId && (
        <div className="mb-3 text-sm">
          <span className="text-white/60">Сейчас выбрано:</span>{' '}
          <span className="font-semibold">{draft.saladName}</span>
          {draft.saladIsSwap ? <span className="ml-2 text-xs bg-white/10 px-2 py-0.5 rounded">замена</span> : null}
        </div>
      )}

      {!salads.length && (
        <div className="text-white/70 text-sm">В категории «Салаты» на сегодня нет блюд.</div>
      )}

      <div className="space-y-3">
        {salads.map(it => (
          <div key={it.id} className="rounded-xl bg-white/5 border border-white/10 p-3">
            <div className="font-semibold text-white">{it.name}</div>
            {it.description && <div className="text-white/70 text-xs mb-2">{it.description}</div>}
            <Button onClick={()=>onPick(it)}>Выбрать этот салат</Button>
          </div>
        ))}
      </div>

      {onSwap && (
        <div className="mt-4">
          <Button onClick={onSwap}>Хочу заменить салат на …</Button>
        </div>
      )}
      
      <div className="mt-4 flex gap-3">
        <Button variant="ghost" onClick={onBack}>Назад</Button>
        {canSkip && onSkip && (
          <Button variant="ghost" onClick={onSkip}>Пропустить (лёгкий обед)</Button>
        )}
      </div>
    </Panel>
  );
}

/* Универсальная «замена на …» */
function SwapStep({ title, byCat, cats, onPick, onBack }:{
  title: string;
  byCat: Record<string, MenuItem[]>;
  cats: string[];
  onPick: (it: MenuItem)=>void;
  onBack: ()=>void;
}) {
  const items = cats.flatMap(c => byCat[c] || []);
  return (
    <Panel title={title}>
      {!items.length && (
        <div className="text-white/70 text-sm">На сегодня в выбранных категориях нет блюд.</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map(it => (
          <div key={it.id} className="rounded-xl bg-white/5 border border-white/10 p-3">
            <div className="font-semibold text-white">{it.name}</div>
            {it.description && <div className="text-white/70 text-xs mb-2">{it.description}</div>}
            <Button onClick={()=>onPick(it)}>Выбрать</Button>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <Button variant="ghost" onClick={onBack}>Назад</Button>
      </div>
    </Panel>
  );
}

/* Шаг 3. Суп */
function SoupStep({ byCat, onPick, onSwapSalad, onSwapOther, draft, onBack }:{
  byCat: Record<string, MenuItem[]>;
  onPick: (it: MenuItem)=>void;
  onSwapSalad: ()=>void;
  onSwapOther: ()=>void;
  draft: { soupId?: string; soupName?: string; soupIsSwap?: boolean };
  onBack: ()=>void;
}) {
  const soups = SOUP_CATS.flatMap(c => byCat[c] || []);
  return (
    <Panel title="Выберите суп">
      {draft?.soupId && (
        <div className="mb-3 text-sm">
          <span className="text-white/60">Сейчас выбрано:</span>{' '}
          <span className="font-semibold">{draft.soupName}</span>
          {draft.soupIsSwap ? <span className="ml-2 text-xs bg-white/10 px-2 py-0.5 rounded">замена</span> : null}
        </div>
      )}

      {!soups.length && (
        <div className="text-white/70 text-sm">В категории «Супы» на сегодня нет блюд.</div>
      )}

      <div className="space-y-3">
        {soups.map(it => (
          <div key={it.id} className="rounded-xl bg-white/5 border border-white/10 p-3">
            <div className="font-semibold text-white">{it.name}</div>
            {it.description && <div className="text-white/70 text-xs mb-2">{it.description}</div>}
            <Button onClick={()=>onPick(it)}>Выбрать этот суп</Button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={onSwapSalad}>Хочу заменить суп на салат</Button>
        <Button onClick={onSwapOther}>Хочу заменить суп на …</Button>
        <Button variant="ghost" onClick={onBack}>Назад</Button>
      </div>
    </Panel>
  );
}

/* Универсальный листинг (Основное/Гарнир) */
function ListStep({ title, byCat, cats, onPick, emptyText, extraFooter }:{
  title: string;
  byCat: Record<string, MenuItem[]>;
  cats: string[];
  onPick: (it: MenuItem)=>void;
  emptyText: string;
  extraFooter?: React.ReactNode;
}) {
  const items = cats.flatMap(c => byCat[c] || []);
  return (
    <Panel title={title}>
      {!items.length && <div className="text-white/70 text-sm">{emptyText}</div>}

      <div className="space-y-3">
        {items.map(it => (
          <div key={it.id} className="rounded-xl bg-white/5 border border-white/10 p-3">
            <div className="font-semibold text-white">{it.name}</div>
            {it.description && <div className="text-white/70 text-xs mb-2">{it.description}</div>}
            <Button onClick={()=>onPick(it)}>Выбрать</Button>
          </div>
        ))}
      </div>

      {extraFooter ? <div className="mt-4">{extraFooter}</div> : null}
    </Panel>
  );
}

/* Шаг 6.5. Выбор способа оплаты */
function PaymentStep({ draft, onPick, onBack }: {
  draft: Draft;
  onPick: (method: 'Cash' | 'Online') => void;
  onBack: () => void;
}) {
  return (
    <Panel title="Выберите способ оплаты">
      {draft.paymentMethod && (
        <div className="mb-3 text-sm">
          <span className="text-white/60">Сейчас выбрано:</span>{' '}
          <span className="font-semibold">{draft.paymentMethod === 'Cash' ? 'Наличными' : 'Онлайн'}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div
          onClick={() => onPick('Cash')}
          className="rounded-xl bg-white/5 border border-white/10 p-4 cursor-pointer hover:bg-white/10 transition-colors"
        >
          <div className="text-lg font-bold text-yellow-400 mb-2">💵 Наличными</div>
          <div className="text-sm text-white/70 mb-3">
            Оплата при получении заказа
          </div>
          <Button className="w-full">Выбрать</Button>
        </div>

        <div
          onClick={() => onPick('Online')}
          className="rounded-xl bg-white/5 border border-white/10 p-4 cursor-pointer hover:bg-white/10 transition-colors"
        >
          <div className="text-lg font-bold text-yellow-400 mb-2">💳 Онлайн</div>
          <div className="text-sm text-white/70 mb-3">
            Оплата картой через интернет
          </div>
          <Button className="w-full">Выбрать</Button>
        </div>
      </div>

      <div className="mt-4">
        <Button variant="ghost" onClick={onBack}>Назад</Button>
      </div>
    </Panel>
  );
}

/* Подтверждение */
function ConfirmStep({ draft, orgInfo, needsStarshiy, onSubmit, onBack }:{
  draft: Draft;
  orgInfo: OrgInfo | null;
  needsStarshiy: boolean;
  onSubmit: ()=>void;
  onBack: ()=>void;
}) {
  const price = draft.tariffCode === 'Full' ? orgInfo?.org?.priceFull : orgInfo?.org?.priceLight;
  
  return (
    <Panel title="Подтверждение заказа">
      <div className="space-y-2 text-sm">
        {needsStarshiy && (
          <>
            <div className="pb-2 border-b border-white/10">
              <span className="text-white/60">Тариф:</span>{' '}
              <span className="font-semibold">{draft.tariffCode === 'Full' ? 'Полный обед' : 'Лёгкий обед'}</span>
              {price && <span className="ml-2 text-yellow-400">{price} ₽</span>}
            </div>
            <div className="pb-2 border-b border-white/10">
              <span className="text-white/60">Оплата:</span>{' '}
              <span className="font-semibold">{draft.paymentMethod === 'Cash' ? 'Наличными' : 'Онлайн'}</span>
            </div>
          </>
        )}
        
        {draft.saladName && <div>Салат: <span className="font-semibold">{draft.saladName}{draft.saladIsSwap ? ' (замена)' : ''}</span></div>}
        {draft.soupName &&  <div>Суп: <span className="font-semibold">{draft.soupName}{draft.soupIsSwap ? ' (замена)' : ''}</span></div>}
        {draft.mainName &&  <div>Основное: <span className="font-semibold">{draft.mainName}</span></div>}
        <div>Гарнир: <span className="font-semibold">{draft.sideName ?? '—'}</span></div>
      </div>

      <div className="mt-4 flex gap-3">
        <Button onClick={onSubmit}>Подтвердить заказ</Button>
        <Button variant="ghost" onClick={onBack}>Назад</Button>
      </div>
    </Panel>
  );
}

function ruCat(cat:string) {
  const map: Record<string,string> = {
    Zapekanka: 'Запеканки и блины',
    Salad:     'Салаты',
    Soup:      'Супы',
    Main:      'Основные',
    Side:      'Гарниры',
    Pastry:    'Выпечка',
    Fruit:     'Фрукты',
    Drink:     'Напитки',
  };
  return map[cat] || cat;
}

function formatRuDate(isoDate: string) {
  if (!isoDate) return '';
  const dt = new Date(`${isoDate}T00:00:00`);
  const s = dt.toLocaleDateString('ru-RU', {
    day: '2-digit', month: '2-digit', year: 'numeric', weekday: 'short'
  });
  return s.replace(/^[а-яё]/, ch => ch.toUpperCase());
}
