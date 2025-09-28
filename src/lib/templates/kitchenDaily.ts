type EmployeeRow = { fullName: string; mealBox: string; extra1?: string; extra2?: string };
type Counters = {
  salads: [string, number][];
  soups: [string, number][];
  zap: [string, number][];
  mealboxes: [string, number][];
  pastry: [string, number][];
  fruitdrink: [string, number][];
};

export function kitchenDailyHTML(opts: {
  orgName: string;
  dateLabel: string; // ДД.ММ.ГГГГ
  rows: EmployeeRow[];
  counters: Counters;
}) {
  const { orgName, dateLabel, rows, counters } = opts;
  const sec = (title: string, items: [string, number][]) =>
    !items.length ? '' : `
      <div class="block">
        <div class="block-title">${title}</div>
        <ul class="agg">
          ${items.map(([name, qty]) => `<li><span class="i">${escapeHtml(name)}</span><span class="q">${qty} шт</span></li>`).join('')}
        </ul>
      </div>`;

  return `<!DOCTYPE html>
<html lang="ru"><head>
<meta charset="utf-8"/>
<link href="https://fonts.googleapis.com/css2?family=PT+Sans+Narrow:wght@700&family=Open+Sans:wght@400;600&display=swap" rel="stylesheet">
<title>Отчёт кухни — ${escapeHtml(orgName)} — ${dateLabel}</title>
<style>
:root { --fg:#111; --muted:#666; --line:#E7E7EA; }
* { box-sizing: border-box; }
body { font-family:"Open Sans", system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; color:var(--fg); font-size:12.2px; }
h1 { font-family:"PT Sans Narrow", Arial, sans-serif; font-size:28px; margin:0 0 6px; letter-spacing:.2px; }
.sub { color:var(--muted); margin:0 0 16px; }
.grid { display:grid; grid-template-columns: 1fr; gap:18px; }
.tbl { width:100%; border-collapse: collapse; }
.tbl th, .tbl td { padding:8px 10px; border-bottom:1px solid var(--line); vertical-align: top; }
.tbl th { text-align:left; font-weight:600; font-size:12px; color:#222; background:#fafafa; border-top:1px solid var(--line); }
.tbl tr:nth-child(even) td { background:#fcfcfd; }
.w-name{width:36%}.w-mb{width:32%}.w-x{width:16%}
.cols { display:grid; grid-template-columns: 1fr 1fr; gap:20px; }
.block { margin:0 0 14px; }
.block-title { font-weight:700; text-transform:uppercase; font-size:13px; margin:0 0 8px; }
.agg { list-style:none; margin:0; padding:0; }
.agg li { display:flex; gap:10px; padding:6px 0; border-bottom:1px dashed var(--line); }
.agg .i { flex:1 1 auto; } .agg .q { min-width:60px; text-align:right; font-variant-numeric: tabular-nums; }
@page { size: A4; margin: 18mm 14mm 16mm; }
</style></head>
<body>
<header>
  <h1>${escapeHtml(orgName)} — ${dateLabel}</h1>
  <p class="sub">Таблица 1 — сотрудники и их заказы · Таблица 2 — агрегаты по блюдам</p>
</header>

<div class="grid">
  <table class="tbl">
    <thead><tr>
      <th class="w-name">Полное имя</th>
      <th class="w-mb">Meal box</th>
      <th class="w-x">Extra 1</th>
      <th class="w-x">Extra 2</th>
    </tr></thead>
    <tbody>
      ${rows.map(r => `
      <tr>
        <td>${escapeHtml(r.fullName)}</td>
        <td>${escapeHtml(r.mealBox || '')}</td>
        <td>${escapeHtml(r.extra1 || '')}</td>
        <td>${escapeHtml(r.extra2 || '')}</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <div class="cols">
    <div>
      ${sec("САЛАТЫ", counters.salads)}
      ${sec("СУПЫ", counters.soups)}
      ${sec("БЛИНЫ И ЗАПЕКАНКИ", counters.zap)}
    </div>
    <div>
      ${sec("ОСНОВНОЕ БЛЮДО И ГАРНИР", counters.mealboxes)}
      ${sec("ВЫПЕЧКА", counters.pastry)}
      ${sec("ФРУКТЫ И НАПИТКИ", counters.fruitdrink)}
    </div>
  </div>
</div>
</body></html>`;
}

function escapeHtml(s?: string) {
  return (s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]!));
}
