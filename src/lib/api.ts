// src/lib/api.ts

/** Базовый URL API; указываем в .env.local -> NEXT_PUBLIC_API_BASE=https://bufetgiph-api.vercel.app/api */
export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, '');

/** Склеивает относительный путь с базой API. */
export function apiUrl(path: string) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

/** Универсальный fetch JSON (без дублей), по умолчанию ходит на API_BASE. */
export async function fetchJSON<T = unknown>(input: string, init?: RequestInit): Promise<T> {
  const url = input.includes('://') ? input : apiUrl(input);

  const req: RequestInit = {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
    // @ts-ignore — поле next допустимо в Next.js среде
    next: { revalidate: 0 },
  };

  const res = await fetch(url, req);
  if (!res.ok) {
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const j = await res.json().catch(() => ({}));
      throw new Error((j as any)?.error || `${res.status} ${res.statusText}`);
    } else {
      const t = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${t?.slice(0, 200)}`);
    }
  }
  return res.json() as Promise<T>;
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

/** Забирает первое значение из массива/lookup. */
function first(v: unknown): string {
  if (Array.isArray(v)) return String(v[0] ?? '');
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

/** Преобразование сырой записи из Airtable/бэкенда к нашему типу MenuItem. */
export function mapMenuItem(raw: any): MenuItem {
  // Если уже в целевом формате — вернём как есть
  if (raw && raw.id && raw.name) return raw as MenuItem;

  const r = raw || {};
  const f = r.fields || r || {};

  // Возможные поля из разных источников
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
  const price = typeof priceRaw === 'number' ? priceRaw : Number(priceRaw || 0) || undefined;

  // Гарнирность: либо формула "Garnirnoe Bool", либо lookup "Garnirnoe (from Dish)"
  const garnBool = f['Garnirnoe Bool'];
  const garnLookup = f['Garnirnoe (from Dish)'];

  const garnirnoe =
    typeof garnBool === 'number'
      ? garnBool === 1
      : Array.isArray(garnLookup)
        ? Boolean(garnLookup[0])
        : Boolean(f['garnirnoe'] ?? r.garnirnoe);

  const ingredients =
    first(f['Ingredients (from Dish)']) ||
    first(f['Ingredients']) ||
    first(r.ingredients);

  return {
    id: r.id || String(f.id || ''),
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
