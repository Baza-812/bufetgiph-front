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

interface OrgMeta {
  ok: boolean;
  vidDogovora?: string;
  minTeamSize?: number | null;
  freeDeliveryMinOrders?: number | null;
  priceFull?: number | null;
  priceLight?: number | null;
  bank?: {
    name: string;
    legalName: string;
    bankName: string;
    inn: string;
    kpp: string;
    account: string;
    bic: string;
    contactPhone?: string;
    contactEmail?: string;
    footerText?: string;
    acquiringProvider?: string;
  } | null;
}

interface EmployeeMeta {
  ok: boolean;
  employeeID: string;
  role: string;
  fullName: string;
  organization: string;
}

/** Для салатов */
const SALAD_CATS = ['Salad'];
/** Для «замена салата/супа на …» */
const SWAP_CATS = ['Zapekanka', 'Pastry', 'Fruit', 'Drink'];
/** Для супов */
const SOUP_CATS = ['Soup'];
/** Для основных и гарниров */
const MAIN_CATS = ['Main'];
const SIDE_CATS = ['Side'];

/** Черновик, который хранится в localStorage (у вас дата обязательна) */
type Draft = {
  date: string;
  saladId?: string; saladName?: string; saladIsSwap?: boolean;
  soupId?: string;  soupName?: string;  soupIsSwap?: boolean;
  mainId?: string;  mainName?: string;  mainGarnirnoe?: boolean;
  sideId?: string;  sideName?: string | null;
  tariffCode?: 'Full' | 'Light';
  paymentMethod?: 'Online' | 'Cash';
};

// у MenuItem нет поля garnirnoe в типах — берём аккуратно из данных
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
  const step = sp.get('step') || '1';

  const [org, setOrg] = useState(qOrg || '');
  const [employeeID, setEmployeeID] = useState(qEmp || '');
  const [token, setToken] = useState(qTok || '');

  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [orgMeta, setOrgMeta] = useState<OrgMeta | null>(null);
  const [employeeMeta, setEmployeeMeta] = useState<EmployeeMeta | null>(null);

  const [draft, setDraft] = useState<Draft>(() => {
    const saved = loadDraft(date) || {};
    return { date, tariffCode: 'Full', paymentMethod: 'Online', ...(saved as Partial<Draft>) };
  });

  // если дата в URL поменялась — синхронизируем черновик
  useEffect(() => {
    setDraft(() => ({ date, tariffCode: 'Full', paymentMethod: 'Online', ...(loadDraft(date) as Partial<Draft>) }));
  }, [date]);

  // Подтянуть креды из localStorage, если не пришли в query
  useEffect(() => {
    if (!org)  setOrg(localStorage.getItem('baza.org') || '');
    if (!employeeID) setEmployeeID(localStorage.getItem('baza.employeeID') || '');
    if (!token) setToken(localStorage.getItem('baza.token') || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Сохранить креды
  useEffect(() => {
    if (org)  localStorage.setItem('baza.org', org);
    if (employeeID) localStorage.setItem('baza.employeeID', employeeID);
    if (token) localStorage.setItem('baza.token', token);
  }, [org, employeeID, token]);

  // Загрузка метаданных организации
  useEffect(() => {
    (async () => {
      if (!org) return;
      try {
        const r = await fetchJSON<OrgMeta>(`/api/org_meta?org=${encodeURIComponent(org)}`);
        if (r.ok) setOrgMeta(r);
      } catch (e) {
        console.error('Failed to load org meta:', e);
      }
    })();
  }, [org]);

  // Загрузка метаданных сотрудника
  useEffect(() => {
    (async () => {
      if (!employeeID || !org || !token) return;
      try {
        const r = await fetchJSON<EmployeeMeta>(
          `/api/employee_meta?employeeID=${encodeURIComponent(employeeID)}&org=${encodeURIComponent(org)}&token=${encodeURIComponent(token)}`
        );
        if (r.ok) setEmployeeMeta(r);
      } catch (e) {
        console.error('Failed to load employee meta:', e);
      }
    })();
  }, [employeeID, org, token]);

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

  // Нормализация категорий
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

  // ===== Actions
  function pickSalad(it: MenuItem | null, isSwap=false) {
    const d: Draft = { 
      ...draft, 
      date, 
      saladId: it?.id, 
      saladName: it?.name, 
      saladIsSwap: isSwap 
    };
    setDraft(d); saveDraft(d);
    go('3');
  }

  function pickSoup(it: MenuItem | null, isSwap=false) {
    const d: Draft = { 
      ...draft, 
      date, 
      soupId: it?.id, 
      soupName: it?.name, 
      soupIsSwap: isSwap 
    };
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
    go('6');
  }

  function updateTariff(tariff: 'Full' | 'Light') {
    const d: Draft = { ...draft, tariffCode: tariff };
    setDraft(d); saveDraft(d);
    // После выбора тарифа переходим к выбору блюд
    if (tariff === 'Light') {
      // Лёгкий обед: пропускаем салат, идём сразу к супу
      go('3');
    } else {
      // Полный обед: начинаем с салата
      go('2');
    }
  }

  function updatePaymentMethod(method: 'Online' | 'Cash') {
    const d: Draft = { ...draft, paymentMethod: method };
    setDraft(d); saveDraft(d);
  }

  async function submitOrder() {
    try {
      setLoading(true); setErr('');

      // extras: максимум 2 — используем салат и суп
      const extras: string[] = [];
      if (draft.saladId) extras.push(draft.saladId);
      if (draft.soupId)  extras.push(draft.soupId);

      // общее тело
      const included = {
        mainId: draft.mainId || undefined,
        sideId: draft.sideId || undefined,
        extras: extras.slice(0, 2),
      };

      const isStarshiy = orgMeta?.vidDogovora === 'Starshiy';
      const role = employeeMeta?.role || 'Employee';

      let employeePayableAmount: number | undefined;
      if (isStarshiy && role === 'Komanda') {
        employeePayableAmount = draft.tariffCode === 'Full' ? (orgMeta?.priceFull || 0) : (orgMeta?.priceLight || 0);
      }

      // если в URL есть orderId — делаем UPDATE
      if (qOrderId) {
        const bodyUpd: Record<string, unknown> = {
          employeeID, org, token,
          orderId: qOrderId,
          included,
        };

        if (isStarshiy) {
          bodyUpd.tariffCode = draft.tariffCode;
          bodyUpd.programType = 'Starshiy';
          if (employeePayableAmount !== undefined) {
            bodyUpd.employeePayableAmount = employeePayableAmount;
          }
        }

        // если HR редактирует за сотрудника — прокидываем цель
        if (qFor) bodyUpd.forEmployeeID = qFor;

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
        // иначе — CREATE
        const bodyCreate: Record<string, unknown> = {
          employeeID, org, token, date,
          included,
          clientToken: crypto.randomUUID(),
        };

        if (isStarshiy) {
          bodyCreate.tariffCode = draft.tariffCode;
          bodyCreate.programType = 'Starshiy';
          if (employeePayableAmount !== undefined) {
            bodyCreate.employeePayableAmount = employeePayableAmount;
          }
        }

        if (qFor) bodyCreate.forEmployeeID = qFor;

        const r = await fetchJSON<{ ok: boolean; orderId?: string; error?: string }>(
          '/api/order',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyCreate),
          }
        );

        if (!r?.ok && !r?.orderId) throw new Error(r?.error || 'Не удалось создать заказ');

        const finalOrderId = r.orderId || qOrderId;
        const needsPayment = isStarshiy && role === 'Komanda' && employeePayableAmount && employeePayableAmount > 0;

        if (needsPayment && draft.paymentMethod === 'Online') {
          const payRes = await fetchJSON<{
            ok: boolean;
            paymentLink?: string;
            error?: string;
          }>('/api/payment_create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employeeID, org, token,
              orderIds: [finalOrderId],
              amount: employeePayableAmount,
              paymentMethod: 'Online',
            }),
          });

          if (payRes.ok && payRes.paymentLink) {
            window.location.href = payRes.paymentLink;
            return;
          }
        }
      }

      // очистить черновик этой даты
      saveDraft({ date } as Draft);

      // редирект обратно в консоль, если пришли из неё
      const backTo = sp.get('back') || '';
      if (backTo) {
        const u = new URL(backTo, window.location.origin);
        u.searchParams.set('org', org);
        u.searchParams.set('employeeID', employeeID);
        u.searchParams.set('token', token);
        return router.push(u.toString());
      }

      // иначе — на страницу выбора дат
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
  const isStarshiy = orgMeta?.vidDogovora === 'Starshiy';
  const role = employeeMeta?.role || 'Employee';

  const employeePayableAmount = useMemo(() => {
    if (!isStarshiy || role !== 'Komanda') return undefined;
    return draft.tariffCode === 'Full' ? (orgMeta?.priceFull || 0) : (orgMeta?.priceLight || 0);
  }, [isStarshiy, role, draft.tariffCode, orgMeta]);

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

        <div className="flex items-center gap-2 text-xs text-white/60">
          <span className={cxStep(step,'1')}>1. Тариф</span>
          <span>→</span>
          <span className={cxStep(step,'2')}>2. Салат</span>
          <span>→</span>
          <span className={cxStep(step,'3')}>3. Суп</span>
          <span>→</span>
          <span className={cxStep(step,'4')}>4. Основное</span>
          <span>→</span>
          <span className={cxStep(step,'5')}>5. Гарнир</span>
          <span>→</span>
          <span className={cxStep(step,'6')}>6. Подтверждение</span>
        </div>
      </Panel>

      {/* Информация о сотруднике */}
      {employeeMeta && (
        <Panel title="Информация о сотруднике">
          <div className="space-y-1 text-sm text-white/80">
            <p><strong>Сотрудник:</strong> {employeeMeta.fullName}</p>
            <p><strong>Роль:</strong> {role}</p>
          </div>
        </Panel>
      )}

      {loading && <Panel title="Загрузка"><div className="text-white/70">Загрузка…</div></Panel>}
      {err && <Panel title="Ошибка"><div className="text-red-400 text-sm">{err}</div></Panel>}

      {/* Шаг 1 — Выбор тарифа (для Старшего) или витрина меню */}
      {!loading && !err && step === '1' && (
        <>
          {isStarshiy && role === 'Komanda' && orgMeta ? (
            <Panel title="Выберите тариф">
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => updateTariff('Full')}
                    className="p-4 rounded-xl border-2 border-white/10 bg-white/5 hover:border-blue-500 hover:bg-blue-500/10 transition-all text-left"
                  >
                    <div className="font-bold text-lg">Полный обед</div>
                    <div className="text-2xl font-bold text-blue-400 mt-1">{orgMeta.priceFull} ₽</div>
                    <div className="text-xs text-white/60 mt-2 leading-relaxed">
                      Салат + суп + основное блюдо + гарнир<br/>
                      <span className="text-white/40">(салат и суп можно заменить на выпечку, запеканку или блины)</span>
                    </div>
                  </button>

                  <button
                    onClick={() => updateTariff('Light')}
                    className="p-4 rounded-xl border-2 border-white/10 bg-white/5 hover:border-green-500 hover:bg-green-500/10 transition-all text-left"
                  >
                    <div className="font-bold text-lg">Лёгкий обед</div>
                    <div className="text-2xl font-bold text-green-400 mt-1">{orgMeta.priceLight} ₽</div>
                    <div className="text-xs text-white/60 mt-2 leading-relaxed">
                      Салат или суп + основное блюдо + гарнир<br/>
                      <span className="text-white/40">(салат или суп можно заменить на выпечку, запеканку или блины)</span>
                    </div>
                  </button>
                </div>
              </div>
              <div className="mt-4">
                <Button variant="ghost" onClick={()=>history.back()}>Отмена</Button>
              </div>
            </Panel>
          ) : (
            <>
              <Showcase byCat={byCat} />
              <div className="flex gap-3">
                <Button onClick={()=>go('2')}>Далее</Button>
                <Button variant="ghost" onClick={()=>history.back()}>Отмена</Button>
              </div>
            </>
          )}
        </>
      )}

      {/* Шаг 2 — Салат */}
      {!loading && !err && step === '2' && (
        <SaladStep
          byCat={byCat}
          onPick={(it)=>pickSalad(it,false)}
          onSkip={()=>pickSalad(null,false)}
          onSwap={()=>go('2a')}
          draft={draft}
          onBack={()=>go('1')}
        />
      )}

      {/* Шаг 2a — Замена салата на … */}
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
          onSkip={()=>pickSoup(null,false)}
          onSwapSalad={()=>go('3s')}
          onSwapOther={()=>go('3a')}
          draft={draft}
          onBack={()=>go(draft.tariffCode === 'Light' ? '1' : '2')}
        />
      )}

      {/* Шаг 3s — Замена супа на салат (без «заменить салат на …») */}
      {!loading && !err && step === '3s' && (
        <SaladStep
          byCat={byCat}
          onPick={(it)=>pickSoup(it,true)}
          onSkip={()=>pickSoup(null,true)}
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

      {/* Шаг 4 — Основное блюдо */}
      {!loading && !err && step === '4' && (
        <ListStep
          title="Выберите основное блюдо"
          byCat={byCat}
          cats={MAIN_CATS}
          onPick={pickMain}
          emptyText="На сегодня нет основных блюд."
          extraFooter={<Button variant="ghost" onClick={()=>go('3')}>Назад</Button>}
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

      {/* Шаг 6 — Подтверждение */}
      {!loading && !err && step === '6' && (
        <>
          {/* Выбор способа оплаты */}
          {isStarshiy && role === 'Komanda' && employeePayableAmount && employeePayableAmount > 0 && (
            <Panel title="Способ оплаты">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => updatePaymentMethod('Online')}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    draft.paymentMethod === 'Online'
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="font-bold">Онлайн-оплата</div>
                  <div className="text-xs text-white/60 mt-1">Банковская карта</div>
                </button>

                <button
                  onClick={() => updatePaymentMethod('Cash')}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    draft.paymentMethod === 'Cash'
                      ? 'border-yellow-500 bg-yellow-500/10'
                      : 'border-white/10 bg-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="font-bold">Наличные</div>
                  <div className="text-xs text-white/60 mt-1">Оплата при получении</div>
                </button>
              </div>
            </Panel>
          )}

          <ConfirmStep 
            draft={draft} 
            onSubmit={submitOrder} 
            onBack={()=>go(draft.mainGarnirnoe ? '4' : '5')}
            isStarshiy={isStarshiy}
            role={role}
            employeePayableAmount={employeePayableAmount}
          />
        </>
      )}
    </main>
  );
}

function cxStep(current:string, me:string) {
  const active = current === me;
  return `inline-flex items-center px-2.5 py-1 rounded-xl ${
    active ? 'bg-yellow-400 text-black' : 'bg-white/10 text-white/70'
  }`;
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
function SaladStep({ byCat, onPick, onSkip, onSwap, draft, onBack }:{
  byCat: Record<string, MenuItem[]>;
  onPick: (it: MenuItem)=>void;
  onSkip?: ()=>void;
  onSwap?: ()=>void;
  draft: { saladId?: string; saladName?: string; saladIsSwap?: boolean };
  onBack: ()=>void;
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

      <div className="mt-4 flex flex-wrap gap-3">
        {onSkip && <Button onClick={onSkip}>Отказаться от салата</Button>}
        {onSwap && <Button onClick={onSwap}>Хочу заменить салат на …</Button>}
        <Button variant="ghost" onClick={onBack}>Назад</Button>
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
function SoupStep({ byCat, onPick, onSkip, onSwapSalad, onSwapOther, draft, onBack }:{
  byCat: Record<string, MenuItem[]>;
  onPick: (it: MenuItem)=>void;
  onSkip?: ()=>void;
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
        {onSkip && <Button onClick={onSkip}>Отказаться от супа</Button>}
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

/* Подтверждение */
function ConfirmStep({ draft, onSubmit, onBack, isStarshiy, role, employeePayableAmount }:{
  draft: Draft;
  onSubmit: ()=>void;
  onBack: ()=>void;
  isStarshiy: boolean;
  role: string;
  employeePayableAmount?: number;
}) {
  return (
    <Panel title="Подтверждение заказа">
      <div className="space-y-2 text-sm">
        {isStarshiy && (
          <div className="mb-2 pb-2 border-b border-white/10">
            <span className="text-white/60">Тариф:</span>{' '}
            <span className="font-semibold">
              {draft.tariffCode === 'Full' ? 'Полный обед' : 'Лёгкий обед'}
            </span>
          </div>
        )}

        {draft.saladName && <div>Салат: <span className="font-semibold">{draft.saladName}{draft.saladIsSwap ? ' (замена)' : ''}</span></div>}
        {draft.soupName &&  <div>Суп: <span className="font-semibold">{draft.soupName}{draft.soupIsSwap ? ' (замена)' : ''}</span></div>}
        {draft.mainName &&  <div>Основное: <span className="font-semibold">{draft.mainName}</span></div>}
        <div>Гарнир: <span className="font-semibold">{draft.sideName ?? '—'}</span></div>

        {isStarshiy && employeePayableAmount !== undefined && (
          <>
            <div className="mt-2 pt-2 border-t border-white/10">
              <span className="text-white/60">Сумма к оплате:</span>{' '}
              <span className="font-bold text-lg">{employeePayableAmount} ₽</span>
            </div>
            {employeePayableAmount > 0 && (
              <div>
                <span className="text-white/60">Способ оплаты:</span>{' '}
                <span className="font-semibold">
                  {draft.paymentMethod === 'Online' ? 'Онлайн-оплата' : 'Наличные'}
                </span>
              </div>
            )}
          </>
        )}
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
