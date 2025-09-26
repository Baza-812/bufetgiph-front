// src/lib/api.ts
const sleep = (ms:number)=> new Promise(r=>setTimeout(r,ms));

export async function fetchJSON<T=any>(url:string, opts: RequestInit = {}, retries=3): Promise<T> {
  for (let i=0;i<retries;i++){
    const r = await fetch(url, {
      ...opts,
      headers: { 'Content-Type':'application/json', ...(opts.headers||{}) }
    });
    if (r.ok) return r.json();
    if (r.status === 429 || r.status >= 500) {
      const ra = Number(r.headers.get('retry-after'));
      const delay = !isNaN(ra) ? ra*1000 : 300 * Math.pow(2, i);
      await sleep(delay); continue;
    }
    throw new Error(`${r.status} ${await r.text()}`);
  }
  throw new Error('Network error after retries');
}

export function fmtDayLabel(iso:string) {
  const d = new Date(iso+'T00:00:00');
  const days = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  return `${days[d.getDay()]} • ${dd}.${mm}`;
}

// Тип меню: предполагаем поля id, name, description, category.
// Если у вашего /api/menu поля называются иначе — подправим в mapMenuItem ниже.
export type MenuItem = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  garnirnoe?: boolean;
};

// Универсальный маппер ответа /api/menu к MenuItem[]
// src/lib/api.ts
export function mapMenuItem(raw: any): MenuItem {
  // Если бэкенд уже прислал нормализованный объект — просто вернём его
  if (raw && typeof raw === 'object' && raw.id && raw.name) {
    // гарантируем наличие category (иначе поставим 'Other')
    return {
      id: raw.id,
      name: raw.name,
      description: raw.description || '',
      category: raw.category || 'Other',
      garnirnoe: Boolean(raw.garnirnoe)
    };
  }
  // Фолбэк для "сырых" записей Airtable
  const id = raw?.id || raw?.recordId || '';
  const f  = raw?.fields || raw || {};
  const name = f.Name || f.title || f.Item || f['Dish Name (from Dish)'] || '';
  const description = f.Description || f.desc || f.Details || f['Description (from Dish)'] || '';
  const category = f.Category || f.Type || f.group || 'Other';
  return { id, name, description, category };
}

