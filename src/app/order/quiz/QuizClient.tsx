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

/** Для салатов */
const SALAD_CATS = ['Salad'];
/** Для «замена салата/супа на …» */
const SWAP_CATS = ['Zapekanka', 'Pastry', 'Fruit', 'Drink'];
/** Для супов */
const SOUP_CATS = ['Soup'];
/** Для основных и гарниров */
const MAIN_CATS = ['Main'];
const SIDE_CATS = ['Side'];

/** Путь к баннеру в /public (если нужно использовать баннер недели кухни) */
const QUIZ_BANNER_SRC = '/china_banner.jpg';

/** Черновик, который хранится в localStorage (у вас дата обязательна) */
type Draft = {
  date: string;
  saladId?: string; saladName?: string; saladIsSwap?: boolean;
  soupId?: string;  soupName?: string;  soupIsSwap?: boolean;
  mainId?: string;  mainName?: string;  mainGarnirnoe?: boolean;
  sideId?: string;  sideName?: string | null;

  /** Для программы Старший — true, если пользователь осознанно отказался от салата (лёгкий обед) */
  lightMode?: boolean;
};

type OrgMeta = {
  vidDogovora: string;           // 'Contract' | 'Starshiy' | ...
  priceFull?: number | null;     // стоимость полного обеда
  priceLight?: number | null;    // стоимость лёгкого обеда
};

type EmployeeMeta = {
  role?: string;                 // 'Komanda' | 'Ambassador' | HR | ...
};

// у MenuItem нет поля garnirnoe в типах — берём аккуратно из данных
const isGarnirnoe = (it: MenuItem) =>
  Boolean((it as unknown as { garnirnoe?: boolean }).garnirnoe);

export default function QuizClient() {
  const sp = useSearchParams();
  const qFor     = sp.get('forEmployeeID') || '';
  const qOrderId = sp.get('orderId')       || '';
  const qOrg     = sp.get('org')          || '';
  const qEmp     = sp.get('employeeID')   || '';
  const qTok     = sp.get('token')        || '';
  const router   = useRouter();

  const date = sp.get('date') || '';
  const step = sp.get('step') || '1';

  const [org, setOrg] = useState(qOrg || '');
  const [employeeID, setEmployeeID] = useState(qEmp || '');
  const [token, setToken] = useState(qTok || '');

  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [draft, setDraft] = useState<Draft>(() => {
    const saved = loadDraft(date) || {};
    return { date, ...(saved as Partial<Draft>) };
  });

  const [orgMeta, setOrgMeta] = useState<OrgMeta | null>(null);
  const [employeeMeta, setEmployeeMeta] = useState<EmployeeMeta | null>(null);

  // если дата в URL поменялась — синхронизируем черновик
  useEffect(() => {
    setDraft(() => ({ date, ...(loadDraft(date) as Partial<Draft>) }));
  }, [date]);

  // Подтянуть креды из localStorage, если не пришли в query
  useEffect(() => {
    if (!org)        setOrg(localStorage.getItem('baza.org') || '');
    if (!employeeID) setEmployeeID(localStorage.getItem('baza.employeeID') || '');
    if (!token)      setToken(localStorage.getItem('baza.token') || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Сохранить креды в localStorage
  useEffect(() => {
    if (org)        localStorage.setItem('baza.org', org);
    if (employeeID) localStorage.setItem('baza.employeeID', employeeID);
    if (token)      localStorage.setItem('baza.token', token);
  }, [org, employeeID, token]);

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

  // Грузим OrgMeta (вид договора + цены Full/Light)
  useEffect(() => {
    if (!org) return;
    let ignore = false;
    (async () => {
      try {
        const u = new URL('/api/org_meta', window.location.origin);
        u.searchParams.set('org', org);
        const r = await fetchJSON<{ ok: boolean; vidDogovora: string; priceFull?: number | null; priceLight?: number | null }>(u.toString());
        if (!r?.ok || ignore) return;
        setOrgMeta({
          vidDogovora: r.vidDogovora,
          priceFull: r.priceFull ?? null,
          priceLight: r.priceLight ?? null,
        });
      } catch {
        // тихо игнорим — просто не будет спец-логики для Starshiy
      }
    })();
    return () => { ignore = true; };
  }, [org]);

  // Грузим EmployeeMeta (роль сотрудника)
  useEffect(() => {
    const targetEmployee = qFor || employeeID;
    if (!org || !targetEmployee || !token) return;
    let ignore = false;
    (async () => {
      try {
        const u = new URL('/api/employee_meta', window.location.origin);
        u.searchParams.set('org', org);
        u.searchParams.set('employeeID', targetEmployee);
        u.searchParams.set('token', token);
        const r = await fetchJSON<{ ok: boolean; role?: string }>(u.toString());
        if (!r?.ok || ignore) return;
        setEmployeeMeta({ role: r.role });
      } catch {
        // тоже молча игнорим — просто не будет особого поведения по ролям
      }
    })();
    return () => { ignore = true; };
  }, [org, employeeID, token, qFor]);

  // Нормализация категорий
  const byCat = useMemo(() => {
    const NORM: Record<string, string> = {
      Casseroles: 'Zapekanka',
      Bakery:     'Zapekanka',
      Pancakes:   'Zapekanka',
      Salads:     'Salad',
      Soups:      'Soup',
      Mains:      'Main',
      Sides:      'Side',
      Pastry:     'Pastry',
      Fruit:      'Fruit',
      Drinks:     'Drink',
    };
    const m: Record<string, MenuItem[]> = {};
    for (const x of menu) {
      const raw = (x.category || '') as string;
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

  // выбрать салат
  function pickSalad(it: MenuItem, isSwap = false) {
    const d: Draft = {
      ...draft,
      date,
      saladId: it.id,
      saladName: it.name,
      saladIsSwap: isSwap,
      lightMode: false, // если выбрали салат — это уже не лёгкий обед
    };
    setDraft(d);
    saveDraft(d);
    go('3');
  }

  // отказаться от салата → лёгкий обед
  function skipSalad() {
    const d: Draft = {
      ...draft,
      date,
      saladId: undefined,
      saladName: undefined,
      saladIsSwap: false,
      lightMode: true,
    };
    setDraft(d);
    saveDraft(d);
    go('3');
  }

  // выбрать суп
  function pickSoup(it: MenuItem, isSwap = false) {
    const d: Draft = {
      ...draft,
      date,
      soupId: it.id,
      soupName: it.name,
      soupIsSwap: isSwap,
    };
    setDraft(d);
    saveDraft(d);
    go('4');
  }

  // выбрать основное
  function pickMain(it: MenuItem) {
    const garn = isGarnirnoe(it);
    const d: Draft = {
      ...draft,
      date,
      mainId: it.id,
      mainName: it.name,
      mainGarnirnoe: garn,
    };
    // если основное «гарнирное» — сбрасываем гарнир (его не будет)
    if (garn) {
      d.sideId = undefined;
      d.sideName = undefined;
    }
    setDraft(d);
    saveDraft(d);
    go(d.mainGarnirnoe ? '6' : '5'); // если гарнирное, сразу на подтверждение
  }

  // выбрать гарнир (или без гарнира, если null)
  function pickSide(it: MenuItem | null) {
    const d: Draft = {
      ...draft,
      date,
      sideId: it?.id,
      sideName: it?.name ?? null,
    };
    setDraft(d);
    saveDraft(d);
    go('6');
  }

  // Сабмит заказа с учётом режима оплаты
  async function submitOrder(mode: 'online' | 'cash' | 'later') {
    try {
      setLoading(true);
      setErr('');

      // extras: максимум 2 — салат и суп
      const extras: string[] = [];
      if (draft.saladId) extras.push(draft.saladId);
      if (draft.soupId)  extras.push(draft.soupId);

      const included = {
        mainId: draft.mainId || undefined,
        sideId: draft.sideId || undefined,
        extras: extras.slice(0, 2),
      };

      const isStarshiy = orgMeta?.vidDogovora === 'Starshiy';
      const isKomanda = (employeeMeta?.role || '').toLowerCase() === 'komanda';

      // Определяем тариф (Full/Light)
      let tariffCode: 'Full' | 'Light' | undefined;
      if (isStarshiy) {
        const isLight = draft.lightMode === true || (!draft.saladId && !!draft.soupId);
        tariffCode = isLight ? 'Light' : 'Full';
      }

      // Программа в целом
      const program: 'Starshiy' | 'Standard' = isStarshiy ? 'Starshiy' : 'Standard';

      // Метод + намерение оплаты
      let paymentMethod: 'None' | 'Online' | 'CashViaAmbassador' = 'None';
      let paymentIntent: 'pay_now' | 'later' | undefined = undefined;

      if (program === 'Starshiy' && isKomanda) {
        if (mode === 'cash') {
          paymentMethod = 'CashViaAmbassador';
          paymentIntent = 'later';
        } else {
          paymentMethod = 'Online';
          paymentIntent = mode === 'online' ? 'pay_now' : 'later';
        }
      } else {
        // классическая договорная схема — сотрудник не платит
        paymentMethod = 'None';
        paymentIntent = undefined;
      }

      // если в URL есть orderId — делаем UPDATE
      if (qOrderId) {
        const bodyUpd: Record<string, unknown> = {
          employeeID,
          org,
          token,
          orderId: qOrderId,
          included,
          program,
          tariffCode,
          paymentMethod,
          paymentIntent,
        };
        if (qFor) bodyUpd.forEmployeeID = qFor;

        const r = await fetchJSON<{ ok: boolean; error?: string; paymentLink?: string }>(
          '/api/order_update',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyUpd),
          }
        );

        if (!r?.ok) throw new Error(r?.error || 'Не удалось обновить заказ');

        if (paymentMethod === 'Online' && paymentIntent === 'pay_now' && r.paymentLink) {
          window.location.href = r.paymentLink;
          return;
        }
      } else {
        // иначе — CREATE
        const bodyCreate: Record<string, unknown> = {
          employeeID,
          org,
          token,
          date,
          included,
          clientToken: crypto.randomUUID(),
          program,
          tariffCode,
          paymentMethod,
          paymentIntent,
        };
        if (qFor) bodyCreate.forEmployeeID = qFor;

        const r = await fetchJSON<{ ok: boolean; orderId?: string; error?: string; paymentLink?: string }>(
          '/api/order',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyCreate),
          }
        );

        if (!r?.ok && !r?.orderId) throw new Error(r?.error || 'Не удалось создать заказ');

        if (paymentMethod === 'Online' && paymentIntent === 'pay_now' && r.paymentLink) {
          window.location.href = r.paymentLink;
          return;
        }
      }

      // очистить черновик этой даты
      saveDraft({ date } as Draft);

      // Возвращаем пользователя на выбор даты
      const u = new URL('/order', window.location.origin);
      u.searchParams.set('employeeID', qEmp || employeeID);
      u.searchParams.set('org', qOrg || org);
      u.searchParams.set('token', qTok || token);
      router.push(u.toString());
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // подсветка текущего шага
  function cxStep(current: string, me: string) {
    const base = 'px-2 py-1 rounded text-xs';
    if (current === me) return base + ' bg-white text-black font-semibold';
    return base + ' text-white/60';
  }

  // ————————————————— РЕНДЕР —————————————————

  const role = employeeMeta?.role || '';
  const isStarshiy = orgMeta?.vidDogovora === 'Starshiy';
  const isKomanda = role.toLowerCase() === 'komanda';

  return (
    <main className="space-y-4">
      {/* Навигация по шагам */}
      <Panel title="Шаги">
        <div className="flex flex-wrap gap-2 text-xs">
          <span className={cxStep(step, '1')}>1. Меню</span>
          <span>→</span>
          <span className={cxStep(step, '2')}>2. Салат</span>
          <span>→</span>
          <span className={cxStep(step, '3')}>3. Суп</span>
          <span>→</span>
          <span className={cxStep(step, '4')}>4. Основное</span>
          <span>→</span>
          <span className={cxStep(step, '5')}>5. Гарнир</span>
          <span>→</span>
          <span className={cxStep(step, '6')}>6. Подтверждение</span>
        </div>
      </Panel>

      {loading && (
        <Panel title="Загрузка">
          <div className="text-white/70">Загрузка…</div>
        </Panel>
      )}

      {err && (
        <Panel title="Ошибка">
          <div className="text-red-400 text-sm whitespace-pre-wrap">{err}</div>
        </Panel>
      )}

      {/* Шаг 1 — Витрина */}
      {!loading && !err && step === '1' && (
        <>
          {/* Если нужен баннер недели кухни, можно раскомментировать: */}
          {/* <div className="mb-4 flex justify-center">
            <img
              src={QUIZ_BANNER_SRC}
              alt="Неделя кухни"
              className="max-h-56 w-auto rounded-2xl border border-white/10 object-cover"
            />
          </div> */}
          <Showcase byCat={byCat} />
          <div className="flex gap-3 mt-4">
            <Button onClick={() => go('2')}>Далее</Button>
            <Button variant="ghost" onClick={() => history.back()}>Отмена</Button>
          </div>
        </>
      )}

      {/* Шаг 2 — Салат */}
      {!loading && !err && step === '2' && (
        <SaladStep
          byCat={byCat}
          onPick={(it) => pickSalad(it, false)}
          onSwap={() => go('2a')}
          onSkip={isStarshiy && isKomanda ? skipSalad : undefined}
          draft={draft}
          onBack={() => go('1')}
        />
      )}

      {/* Шаг 2a — Замена салата на … */}
      {!loading && !err && step === '2a' && (
        <SwapStep
          title="Хочу заменить салат на …"
          byCat={byCat}
          cats={SWAP_CATS}
          onPick={(it) => pickSalad(it, true)}
          onBack={() => go('2')}
        />
      )}

      {/* Шаг 3 — Суп */}
      {!loading && !err && step === '3' && (
        <SoupStep
          byCat={byCat}
          onPick={(it) => pickSoup(it, false)}
          onSwapSalad={() => go('3s')}
          onSwapOther={() => go('3a')}
          draft={draft}
          onBack={() => go('2')}
        />
      )}

      {/* Шаг 3s — Замена супа на салат */}
      {!loading && !err && step === '3s' && (
        <SaladStep
          byCat={byCat}
          onPick={(it) => pickSoup(it, true)}
          draft={draft}
          onBack={() => go('3')}
        />
      )}

      {/* Шаг 3a — Замена супа на … */}
      {!loading && !err && step === '3a' && (
        <SwapStep
          title="Хочу заменить суп на …"
          byCat={byCat}
          cats={SWAP_CATS}
          onPick={(it) => pickSoup(it, true)}
          onBack={() => go('3')}
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
          extraFooter={
            <Button variant="ghost" onClick={() => go('3')}>
              Назад
            </Button>
          }
        />
      )}

      {/* Шаг 5 — Гарнир */}
      {!loading && !err && step === '5' && (
        <ListStep
          title="Выберите гарнир"
          byCat={byCat}
          cats={SIDE_CATS}
          onPick={(it) => pickSide(it)}
          emptyText="На сегодня нет гарниров."
          extraFooter={
            <div className="flex gap-3">
              <Button variant="ghost" onClick={() => go('4')}>
                Назад
              </Button>
              <Button variant="ghost" onClick={() => pickSide(null)}>
                Без гарнира
              </Button>
            </div>
          }
        />
      )}

      {/* Шаг 6 — Подтверждение */}
      {!loading && !err && step === '6' && (
        <ConfirmStep
          draft={draft}
          orgMeta={orgMeta}
          employeeRole={employeeMeta?.role || ''}
          onSubmit={submitOrder}
          onBack={() => go(draft.mainGarnirnoe ? '4' : '5')}
        />
      )}
    </main>
  );
}

/* Шаг 1. Витрина меню */
function Showcase({ byCat }: { byCat: Record<string, MenuItem[]> }) {
  const ORDER = ['Zapekanka', 'Salad', 'Soup', 'Main', 'Side'];
  const ordered = ORDER.filter((c) => byCat[c]?.length);

  return (
    <Panel title="Меню на день">
      {!ordered.length && <div className="text-white/70 text-sm">Меню пусто.</div>}
      <div className="space-y-6">
        {ordered.map((cat) => (
          <section key={cat}>
            <h3 className="text-base font-bold mb-2 text-white">
              {ruCat(cat)}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(byCat[cat] || []).map((it) => (
                <div
                  key={it.id}
                  className="rounded-xl bg-white/5 border border-white/10 p-3 text-sm space-y-1"
                >
                  <div className="font-semibold text-white">{it.name}</div>
                  {it.description && (
                    <div className="text-white/70 text-xs">{it.description}</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Panel>
  );
}

/* Общий листинг по категориям */
function ListStep({
  title,
  byCat,
  cats,
  onPick,
  emptyText,
  extraFooter,
}: {
  title: string;
  byCat: Record<string, MenuItem[]>;
  cats: string[];
  onPick: (it: MenuItem) => void;
  emptyText: string;
  extraFooter?: React.ReactNode;
}) {
  const items = cats.flatMap((c) => byCat[c] || []);
  return (
    <Panel title={title}>
      {!items.length && (
        <div className="text-white/70 text-sm">{emptyText}</div>
      )}

      <div className="space-y-3">
        {items.map((it) => (
          <div
            key={it.id}
            className="rounded-xl bg-white/5 border border-white/10 p-3"
          >
            <div className="font-semibold text-white">{it.name}</div>
            {it.description && (
              <div className="text-white/70 text-xs mb-2">{it.description}</div>
            )}
            <Button onClick={() => onPick(it)}>Выбрать</Button>
          </div>
        ))}
      </div>

      {extraFooter && <div className="mt-4">{extraFooter}</div>}
    </Panel>
  );
}

/* Салаты (с возможностью замены и отказа от салата) */
function SaladStep({
  byCat,
  onPick,
  onSwap,
  onSkip,
  draft,
  onBack,
}: {
  byCat: Record<string, MenuItem[]>;
  onPick: (it: MenuItem) => void;
  onSwap?: () => void;
  onSkip?: () => void; // новый коллбек «Без салата (лёгкий обед)»
  draft: {
    saladId?: string;
    saladName?: string;
    saladIsSwap?: boolean;
    lightMode?: boolean;
  };
  onBack: () => void;
}) {
  const salads = SALAD_CATS.flatMap((c) => byCat[c] || []);
  return (
    <Panel title="Выберите салат">
      {draft.saladId && (
        <div className="mb-3 text-sm">
          <span className="text-white/60">Сейчас выбрано:</span>{' '}
          <span className="font-semibold">{draft.saladName}</span>
          {draft.saladIsSwap ? (
            <span className="ml-2 text-xs bg-white/10 px-2 py-0.5 rounded">
              замена
            </span>
          ) : null}
        </div>
      )}

      {!draft.saladId && draft.lightMode && (
        <div className="mb-3 text-sm text-white/70">
          Вы выбрали вариант без салата (лёгкий обед).
        </div>
      )}

      {!salads.length && (
        <div className="text-white/70 text-sm">
          В категории «Салаты» на сегодня нет блюд.
        </div>
      )}

      <div className="space-y-3">
        {salads.map((it) => (
          <div
            key={it.id}
            className="rounded-xl bg-white/5 border border-white/10 p-3"
          >
            <div className="font-semibold text-white">{it.name}</div>
            {it.description && (
              <div className="text-white/70 text-xs mb-2">{it.description}</div>
            )}
            <Button onClick={() => onPick(it)}>Выбрать этот салат</Button>
          </div>
        ))}
      </div>

      {onSwap && (
        <div className="mt-4">
          <Button onClick={onSwap}>Хочу заменить салат на …</Button>
        </div>
      )}

      {onSkip && (
  <div className="mt-3">
    <Button variant="ghost" onClick={onSkip}>
      Без салата (лёгкий обед)
    </Button>
  </div>
)}


      <div className="mt-4">
        <Button variant="ghost" onClick={onBack}>
          Назад
        </Button>
      </div>
    </Panel>
  );
}

/* Супы */
function SoupStep({
  byCat,
  onPick,
  onSwapSalad,
  onSwapOther,
  draft,
  onBack,
}: {
  byCat: Record<string, MenuItem[]>;
  onPick: (it: MenuItem) => void;
  onSwapSalad: () => void;
  onSwapOther: () => void;
  draft: {
    soupId?: string;
    soupName?: string;
    soupIsSwap?: boolean;
  };
  onBack: () => void;
}) {
  const soups = SOUP_CATS.flatMap((c) => byCat[c] || []);
  return (
    <Panel title="Выберите суп">
      {draft.soupId && (
        <div className="mb-3 text-sm">
          <span className="text-white/60">Сейчас выбрано:</span>{' '}
          <span className="font-semibold">{draft.soupName}</span>
          {draft.soupIsSwap ? (
            <span className="ml-2 text-xs bg-white/10 px-2 py-0.5 rounded">
              замена
            </span>
          ) : null}
        </div>
      )}

      {!soups.length && (
        <div className="text-white/70 text-sm">
          В категории «Супы» на сегодня нет блюд.
        </div>
      )}

      <div className="space-y-3">
        {soups.map((it) => (
          <div
            key={it.id}
            className="rounded-xl bg-white/5 border border-white/10 p-3"
          >
            <div className="font-semibold text-white">{it.name}</div>
            {it.description && (
              <div className="text-white/70 text-xs mb-2">{it.description}</div>
            )}
            <Button onClick={() => onPick(it)}>Выбрать этот суп</Button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Button variant="ghost" onClick={onSwapSalad}>
          Хочу заменить суп на салат
        </Button>
        <Button variant="ghost" onClick={onSwapOther}>
          Хочу заменить суп на другое блюдо
        </Button>
      </div>

      <div className="mt-4">
        <Button variant="ghost" onClick={onBack}>
          Назад
        </Button>
      </div>
    </Panel>
  );
}

/* Замена на другие категории */
function SwapStep({
  title,
  byCat,
  cats,
  onPick,
  onBack,
}: {
  title: string;
  byCat: Record<string, MenuItem[]>;
  cats: string[];
  onPick: (it: MenuItem) => void;
  onBack: () => void;
}) {
  const items = cats.flatMap((c) => byCat[c] || []);
  return (
    <Panel title={title}>
      {!items.length && (
        <div className="text-white/70 text-sm">
          На сегодня в выбранных категориях нет блюд.
        </div>
      )}

      <div className="space-y-3">
        {items.map((it) => (
          <div
            key={it.id}
            className="rounded-xl bg-white/5 border border-white/10 p-3"
          >
            <div className="font-semibold text-white">{it.name}</div>
            {it.description && (
              <div className="text-white/70 text-xs mb-2">{it.description}</div>
            )}
            <Button onClick={() => onPick(it)}>Выбрать</Button>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <Button variant="ghost" onClick={onBack}>
          Назад
        </Button>
      </div>
    </Panel>
  );
}

/* Подтверждение заказа + три кнопки оплаты */
function ConfirmStep({
  draft,
  orgMeta,
  employeeRole,
  onSubmit,
  onBack,
}: {
  draft: Draft;
  orgMeta: OrgMeta | null;
  employeeRole: string;
  onSubmit: (mode: 'online' | 'cash' | 'later') => void;
  onBack: () => void;
}) {
  const isStarshiy = orgMeta?.vidDogovora === 'Starshiy';
  const isKomanda = employeeRole.toLowerCase() === 'komanda';

  let tariffCode: 'Full' | 'Light' | null = null;
  if (isStarshiy) {
    const isLight = draft.lightMode === true || (!draft.saladId && !!draft.soupId);
    tariffCode = isLight ? 'Light' : 'Full';
  }

  let price: number | null = null;
  if (isStarshiy && isKomanda && tariffCode) {
    price =
      tariffCode === 'Light'
        ? orgMeta?.priceLight ?? null
        : orgMeta?.priceFull ?? null;
  }

  return (
    <Panel title="Подтверждение заказа">
      <div className="space-y-2 text-sm">
        <div>
          Салат:{' '}
          <span className="font-semibold">
            {draft.saladName ?? (draft.lightMode ? '— (лёгкий обед)' : '—')}
            {draft.saladIsSwap ? ' (замена)' : ''}
          </span>
        </div>
        <div>
          Суп:{' '}
          <span className="font-semibold">
            {draft.soupName ?? '—'}
            {draft.soupIsSwap ? ' (замена)' : ''}
          </span>
        </div>
        {draft.mainName && (
          <div>
            Основное: <span className="font-semibold">{draft.mainName}</span>
          </div>
        )}
        <div>
          Гарнир:{' '}
          <span className="font-semibold">{draft.sideName ?? '—'}</span>
        </div>
      </div>

      {price !== null && (
        <div className="mt-4 text-sm">
          Стоимость заказа:{' '}
          <span className="font-semibold">
            {price} ₽{' '}
            {tariffCode === 'Light' ? '(лёгкий обед)' : '(полный обед)'}
          </span>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
       {isStarshiy && isKomanda ? (
  <>
    <Button onClick={() => onSubmit('online')}>Оплатить онлайн</Button>
    <Button
      variant="ghost"
      onClick={() => onSubmit('cash')}
    >
      Оплатить наличными Старшему
    </Button>
    <Button
      variant="ghost"
      onClick={() => onSubmit('later')}
    >
      Заказать ещё один день
    </Button>
  </>
) : (
  <Button onClick={() => onSubmit('later')}>
    Подтвердить заказ
  </Button>
)}

        <Button variant="ghost" onClick={onBack}>
          Назад
        </Button>
      </div>
    </Panel>
  );
}

function ruCat(cat: string) {
  const map: Record<string, string> = {
    Zapekanka: 'Запеканки и блины',
    Salad:     'Салаты',
    Soup:      'Супы',
    Main:      'Основные',
    Side:      'Гарниры',
    Pastry:    'Выпечка',
    Fruit:     'Фрукты',
    Drink:     'Напитки',
    Other:     'Другое',
  };
  const s = map[cat] || cat;
  return s.replace(/^[а-яё]/, ch => ch.toUpperCase());
}
