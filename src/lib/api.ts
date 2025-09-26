// src/lib/api.ts
export const API_BASE =
  (process.env.NEXT_PUBLIC_API_BASE || '').replace(/\/$/, ''); // без финального слеша

export function apiUrl(path: string) {
  // path можно передавать как "/hr_orders?..." или "hr_orders?..."
  const p = path.startsWith('/') ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}

// Универсальный fetch JSON c no-store
export async function fetchJSON<T = unknown>(
  input: string,
  init?: RequestInit
): Promise<T> {
  const url = input.includes('://')
    ? input
    : apiUrl(input); // <-- главное: заворачиваем через apiUrl

  const req: RequestInit = {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    cache: 'no-store',
    next: { revalidate: 0 },
  };

  const r = await fetch(url, req);
  if (!r.ok) {
    // попробуем показать текст, если это не JSON
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const j = await r.json().catch(() => ({}));
      throw new Error((j as any)?.error || `${r.status} ${r.statusText}`);
    } else {
      const t = await r.text().catch(() => '');
      throw new Error(`HTTP ${r.status}: ${t?.slice(0, 200)}`);
    }
  }
  return r.json();
}


export type MenuItem = {
  id: string;
  name: string;
  description: string;
  category: string;
  price?: number;
  garnirnoe?: boolean;
};

// Универсальный fetch JSON без any
export async function fetchJSON<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

// Аккуратный mapper без any
export function mapMenuItem(raw: unknown): MenuItem {
  // Пытаемся прочитать несколько возможных форматов ответа
  // (Airtable record / наш собственный объект)
  const rec = raw as {
    id?: string;
    fields?: Record<string, unknown>;
    name?: unknown;
    description?: unknown;
    category?: unknown;
    price?: unknown;
    garnirnoe?: unknown;
  };

  // 1) Если это уже «наш» формат
  if (typeof rec?.name === 'string' && typeof rec?.category === 'string') {
    return {
      id: String(rec.id ?? ''),
      name: rec.name,
      description: typeof rec.description === 'string' ? rec.description : '',
      category: rec.category,
      price: typeof rec.price === 'number' ? rec.price : undefined,
      garnirnoe: typeof rec.garnirnoe === 'boolean' ? rec.garnirnoe : undefined,
    };
  }

  // 2) Airtable-подобный
  const id = String(rec?.id ?? '');
  const f = (rec?.fields ?? {}) as Record<string, unknown>;

  // Поля из Airtable handlers/menu.js
  const name =
    (Array.isArray(f['Dish Name (from Dish)']) ? f['Dish Name (from Dish)'][0] : f['Dish Name (from Dish)']) ??
    f['Name'];
  const description =
    (Array.isArray(f['Description (from Dish)']) ? f['Description (from Dish)'][0] : f['Description (from Dish)']) ??
    f['Description'];
  const category = f['Category'];
  const price = f['Price'];
  const garnirnoe =
    // новое булево поле
    f['Garnirnoe Bool'] ??
    // либо lookup
    (Array.isArray(f['Garnirnoe (from Dish)']) ? f['Garnirnoe (from Dish)'][0] : f['Garnirnoe (from Dish)']);

  return {
    id,
    name: typeof name === 'string' ? name : '',
    description: typeof description === 'string' ? description : '',
    category: typeof category === 'string' ? category : String(category ?? 'Other'),
    price: typeof price === 'number' ? price : undefined,
    garnirnoe: typeof garnirnoe === 'boolean' ? garnirnoe : Boolean(garnirnoe),
  };
}

// Утилита форматирования «ДД.ММ, пн»
export function fmtDayLabel(d: string) {
  if (!d) return '';
  const dt = new Date(`${d}T00:00:00`);
  const s = dt.toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: '2-digit' });
  return s.replace(/^[а-яё]/, (ch) => ch.toUpperCase());
}
