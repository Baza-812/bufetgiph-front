'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Panel from '@/components/ui/Panel';
import Button from '@/components/ui/Button';
import Input, { Field } from '@/components/ui/Input';
import { fetchJSON, mapMenuItem, MenuItem } from '@/lib/api';
import { loadDraft, saveDraft } from '@/lib/draft';

type MenuResponse = { ok: boolean; items: any[] } | any;

/** Порядок и набор категорий на витрине меню */
const SHOWCASE_CATEGORIES = ['Zapekanka', 'Salad', 'Soup', 'Main', 'Side'];
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
};

// у MenuItem нет поля garnirnoe в типах — берём аккуратно из данных
const isGarnirnoe = (it: MenuItem) => Boolean((it as any)?.garnirnoe);

export default function QuizPage() {
  const sp = useSearchParams();
  const qOrg  = sp.get('org') || '';
  const qEmp  = sp.get('employeeID') || '';
  const qTok  = sp.get('token') || '';
  const router = useRouter();
  const qFor = sp.get('forEmployeeID') || '';

  const date = sp.get('date') || '';
  const step = sp.get('step') || '1';
  // <<< НОВОЕ:
const existingOrderId = sp.get('orderId') || '';
const forEmployeeID = sp.get('forEmployeeID') || '';
const returnTo = sp.get('returnTo') || '';

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

  // если дата в URL поменялась (маловероятно на этой странице) — синхронизируем черновик
  useEffect(() => {
    setDraft(d => ({ date, ...(loadDraft(date) as Partial<Draft>), }));
  }, [date]);

  // Подтянуть креды из localStorage, если не пришли в query
  useEffect(() => {
    if (!org)  setOrg(localStorage.getItem('baza.org') || '');
    if (!employeeID) setEmployeeID(localStorage.getItem('baza.employeeID') || '');
    if (!token) setToken(localStorage.getItem('baza.token') || '');
  }, []);

  // Сохранить креды
  useEffect(() => {
    if (org)  localStorage.setItem('baza.org', org);
    if (employeeID) localStorage.setItem('baza.employeeID', employeeID);
    if (token) localStorage.setItem('baza.token', token);
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
        const r = await fetchJSON<MenuResponse>(u.toString());
        const arr = (r.items || r.records || r.menu || []).map(mapMenuItem);
        setMenu(arr);
      } catch (e:any) {
        setErr(e.message || String(e));
      } finally { setLoading(false); }
    })();
  }, [date, org]);

  // Нормализация категорий из Airtable -> наши канонические
  const byCat = useMemo(() => {
    const NORM: Record<string, string> = {
      // множественное → единственное
      Casseroles: 'Zapekanka',
      Bakery:     'Zapekanka',
      Pancakes:   'Zapekanka',
      Salads:     'Salad',
      Soups:      'Soup',
      // как есть
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
  function pickSalad(it: MenuItem, isSwap=false) {
    const d: Draft = { ...draft, date, saladId: it.id, saladName: it.name, saladIsSwap: isSwap };
    setDraft(d); saveDraft(d);
    go('3'); // дальше «Суп»
  }

  function pickSoup(it: MenuItem, isSwap=false) {
    const d: Draft = { ...draft, date, soupId: it.id, soupName: it.name, soupIsSwap: isSwap };
    setDraft(d); saveDraft(d);
    go('4'); // «Основное»
  }

  function pickMain(it: MenuItem) {
    const garn = isGarnirnoe(it);
    const d: Draft = {
      ...draft, date,
      mainId: it.id, mainName: it.name, mainGarnirnoe: garn
    };
    setDraft(d); saveDraft(d);
    if (garn) {
      // гарнирное блюдо — сразу подтверждение
      go('6');
    } else {
      // без гарнира — выбрать гарнир
      go('5');
    }
  }

  function pickSide(it: MenuItem | null) {
    const d: Draft = { ...draft, date, sideId: it?.id, sideName: it?.name || null };
    setDraft(d); saveDraft(d);
    go('6'); // подтверждение
  }

async function submitOrder() {
  try {
    setLoading(true); setErr('');

    // extras: максимум 2 — салат и суп
    const extras: string[] = [];
    if (draft.saladId) extras.push(draft.saladId);
    if (draft.soupId)  extras.push(draft.soupId);

    // общее тело
    const base = {
      employeeID, org, token, date,
      // если HR действует "за сотрудника" — пробросим его id
      ...(forEmployeeID ? { forEmployeeID } : {}),
      included: {
        mainId: draft.mainId || undefined,
        sideId: draft.sideId || undefined,
        extras: extras.slice(0, 2),
      },
      clientToken: crypto.randomUUID(),
    };

    // если есть orderId — это РЕДАКТИРОВАНИЕ
    const url = existingOrderId ? '/api/order_update' : '/api/order';
    const body = existingOrderId ? { ...base, orderId: existingOrderId } : base;

    const r = await fetchJSON(url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });

    if (!r?.ok && !r?.orderId) throw new Error(r?.error || 'Не удалось сохранить заказ');

    // очистим черновик
    saveDraft({ date } as Draft);

    // если есть returnTo — вернёмся в консоль HR
    if (returnTo) {
      router.push(returnTo);
      return;
    }

    // иначе — обычный сценарий: на выбор даты
    const u = new URL('/order', window.location.origin);
    u.searchParams.set('employeeID', employeeID);
    u.searchParams.set('org', org);
    u.searchParams.set('token', token);
    router.push(u.toString());
  } catch (e:any) {
    setErr(e.message || String(e));
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

        <div className="flex items-center gap-2 text-xs text-white/60">
          <span className={cxStep(step,'1')}>1. Меню</span>
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

      {loading && <Panel title="Загрузка"><div className="text-white/70">Загрузка…</div></Panel>}
      {err && <Panel title="Ошибка"><div className="text-red-400 text-sm">{err}</div></Panel>}

      {/* Шаг 1 — Витрина */}
      {!loading && !err && step === '1' && (
        <>
          <Showcase byCat={byCat} />
          <div className="flex gap-3">
            <Button onClick={()=>go('2')}>Далее</Button>
            <Button variant="ghost" onClick={()=>history.back()}>Отмена</Button>
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
          onSwapSalad={()=>go('3s')}
          onSwapOther={()=>go('3a')}
          draft={draft}
          onBack={()=>go('2')}
        />
      )}

      {/* Шаг 3s — Замена супа на салат (без «заменить салат на …») */}
      {!loading && !err && step === '3s' && (
        <SaladStep
          byCat={byCat}
          onPick={(it)=>pickSoup(it,true)}
          onSwap={undefined}
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
          onBack={()=>go('3')}
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
          onBack={()=>go('4')}
          extraFooter={
            <Button variant="ghost" onClick={()=>pickSide(null)}>Без гарнира</Button>
          }
        />
      )}

      {/* Шаг 6 — Подтверждение */}
      {!loading && !err && step === '6' && (
        <ConfirmStep draft={draft} onSubmit={submitOrder} onBack={()=>go(draft.mainGarnirnoe ? '4' : '5')} />
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
function SaladStep({ byCat, onPick, onSwap, draft, onBack }:{
  byCat: Record<string, MenuItem[]>;
  onPick: (it: MenuItem)=>void;
  onSwap?: ()=>void;             // ← было обязательно, стало опционально
  draft: Draft;
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

      {onSwap && (
        <div className="mt-4">
          <Button onClick={onSwap}>Хочу заменить салат на …</Button>
        </div>
      )}
      <div className="mt-4">
        <Button variant="ghost" onClick={onBack}>Назад</Button>
      </div>
    </Panel>
  );
}


/* Универсальная «замена на …» (для салата и супа) */
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
  draft: Draft;
  onBack: ()=>void;             // ← добавили в тип
}) {                            // ← и в параметры функции
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


/* Универсальный листинг (для Основного и Гарнира) */
function ListStep({
  title, byCat, cats, onPick, emptyText, extraFooter, onBack,
}:{
  title: string;
  byCat: Record<string, MenuItem[]>;
  cats: string[];
  onPick: (it: MenuItem)=>void;
  emptyText: string;
  extraFooter?: React.ReactNode;
  onBack?: ()=>void;               // ← добавили
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

      {/* нижний блок: слева — доп.кнопки, справа — Назад */}
      {(extraFooter || onBack) && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <div>{extraFooter}</div>
          {onBack && <Button variant="ghost" onClick={onBack}>Назад</Button>}
        </div>
      )}
    </Panel>
  );
}


/* Подтверждение */
function ConfirmStep({ draft, onSubmit, onBack }:{
  draft: Draft;
  onSubmit: ()=>void;
  onBack: ()=>void;
}) {
  return (
    <Panel title="Подтверждение заказа">
      <div className="space-y-2 text-sm">
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
