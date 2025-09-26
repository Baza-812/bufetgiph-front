// src/lib/draft.ts
type Draft = {
  date: string;
  saladId?: string;        // либо салат, либо замена
  saladName?: string;
  saladIsSwap?: boolean;   // true если это замена (запеканка/блины/выпечка)
};

const key = (date:string)=> `baza.draft.${date}`;

export function loadDraft(date: string): Draft {
  try {
    const s = localStorage.getItem(key(date));
    return s ? JSON.parse(s) : { date };
  } catch { return { date }; }
}

export function saveDraft(d: Draft) {
  localStorage.setItem(key(d.date), JSON.stringify(d));
}
