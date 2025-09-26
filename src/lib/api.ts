// src/lib/api.ts

/** Базовый URL API; укажите в .env.local -> NEXT_PUBLIC_API_BASE=https://bufetgiph-api.vercel.app/api */
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

/** Склеивает относительный путь с базой API. */
export function apiUrl(path: string) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

/** Универсальный fetch JSON (без дублей и без any). */
export async function fetchJSON<T = unknown>(input: string, init?: RequestInit): Promise<T> {
  const url = input.includes('://') ? input : apiUrl(input);

  const req: RequestInit = {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
  };

  const res = await fetch(url, req);

  if (!res.ok) {
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const j = (await res.json().catch(() => ({}))) as unknown;
      const errMsg =
        typeof j === 'object' && j !== null && 'error' in (j as Record<string, unknown>)
          ? String((j as { error?: unknown }).error ?? `HTTP ${res.status}`)
          : `HTTP ${res.status} ${res.statusText}`;
      throw new Error(errMsg);
    } else {
      const t = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${t?.slice(0, 200)}`);
    }
  }

  return (res.json() as unknown) as T;
}


/* ====================== Меню ====================== */

export type MenuItem = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  price?: number;
  garnirnoe?: boolean;
  ingredients?: string;
};

type RawMenu = {
  id?: string;
  name?: unknown;
  description?: unknown;
  category?: unknown;
  price?: unknown;
  garnirnoe?: unknown;
  ingredients?: unknown;
  fields?: Record<string, unknown>;
};

/** Забирает первое значение из массива/lookup. */
function first(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] ?? '');
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

/** Преобразование сырой записи из Airtable/бэкенда к нашему типу MenuItem. */
export function mapMenuItem(raw: unknown): MenuItem {
  const r = (raw ?? {}) as RawMenu;
  const f = (r.fields ?? {}) as Record<string, unknown>;

  // Если уже в целевом формате — вернём как есть
  if (typeof r === 'object' && r && 'id' in r && 'name' in r && typeof (r as { name: unknown }).name === 'string') {
    return r as unknown as MenuItem;
  }

  const name =
    first(f['Dish Name (from Dish)']) ||
    first(f['Dish Name']) ||
    first(f['Name']) ||
    first(r.name);

  const description =
    first(f['Description (from Dish)']) ||
    first(f['Description']) ||
    first(r.description);

  const category =
    first(f['Category']) ||
    first(r.category);

  const priceRaw = f['Price'] ?? r.price;
  const price =
    typeof priceRaw === 'number'
      ? priceRaw
      : priceRaw == null
      ? undefined
      : Number(priceRaw) || undefined;

  // Гарнирность: либо формула "Garnirnoe Bool", либо lookup "Garnirnoe (from Dish)"
  const garnBool = f['Garnirnoe Bool'];
  const garnLookup = f['Garnirnoe (from Dish)'];

  let garnirnoe: boolean | undefined = undefined;
  if (typeof garnBool === 'number') garnirnoe = garnBool === 1;
  else if (Array.isArray(garnLookup)) garnirnoe = Boolean(garnLookup[0]);
  else if (typeof r.garnirnoe === 'boolean') garnirnoe = r.garnirnoe;

  const ingredients =
    first(f['Ingredients (from Dish)']) ||
    first(f['Ingredients']) ||
    first(r.ingredients);

  return {
    id: String(r.id || f['id'] || ''),
    name,
    description: description || undefined,
    category: category || undefined,
    price,
    garnirnoe,
    ingredients: ingredients || undefined,
  };
}

/* ====================== Форматирование дат ====================== */

export function fmtDayLabel(isoDate: string) {
  if (!isoDate) return '';
  const dt = new Date(`${isoDate}T00:00:00`);
  const s = dt.toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: '2-digit' });
  return s.replace(/^[а-яё]/, ch => ch.toUpperCase());
}

/** Короткий формат ДД.ММ (оставлен на случай, если где-то используется). */
export function fmtShortRuDate(isoDate: string) {
  if (!isoDate) return '';
  const dt = new Date(`${isoDate}T00:00:00`);
  return dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
}
