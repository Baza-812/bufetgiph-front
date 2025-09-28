// src/lib/airtable.ts
import Airtable, { FieldSet, Record as ATRec, SelectOptions } from "airtable";

const {
  AIRTABLE_API_KEY,
  AIRTABLE_BASE_ID,
  AIRTABLE_TBL_ORDERS,
  AIRTABLE_TBL_ORDER_LINES,
  AIRTABLE_TBL_MEAL_BOXES,
  AIRTABLE_TBL_DISHES,
  AIRTABLE_TBL_EMPLOYEES,
  AIRTABLE_TBL_ORGS,
  AIRTABLE_TBL_REPORT_TYPES,
  AIRTABLE_TBL_REPORT_RECIPIENTS,
  AIRTABLE_TBL_REPORTS,
} = process.env as Record<string, string | undefined>;

// Жёстко падаем при сборке, если секреты не заданы
if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  throw new Error(
    "Missing env vars: AIRTABLE_API_KEY and/or AIRTABLE_BASE_ID. " +
      "Add them in Vercel → Project → Settings → Environment Variables (and .env.local для локалки)."
  );
}

// Инициализация клиента Airtable
export const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);

// Тип записи Airtable с корректным generic-ограничением
export type ATRecord<T extends FieldSet = FieldSet> = ATRec<T>;

// Имена таблиц (с дефолтами, если переменные не заданы)
export const TBL = {
  ORDERS: AIRTABLE_TBL_ORDERS || "Orders",
  ORDER_LINES: AIRTABLE_TBL_ORDER_LINES || "Order Lines",
  MEAL_BOXES: AIRTABLE_TBL_MEAL_BOXES || "Meal Boxes",
  DISHES: AIRTABLE_TBL_DISHES || "Dishes",
  EMPLOYEES: AIRTABLE_TBL_EMPLOYEES || "Employees",
  ORGS: AIRTABLE_TBL_ORGS || "Organizations",
  REPORT_TYPES: AIRTABLE_TBL_REPORT_TYPES || "ReportTypes",
  REPORT_RECIPIENTS: AIRTABLE_TBL_REPORT_RECIPIENTS || "ReportRecipients",
  REPORTS: AIRTABLE_TBL_REPORTS || "Reports",
} as const;

// Хелпер для выборки всех записей (обходит пагинацию)
export async function selectAll<T extends FieldSet = FieldSet>(
  table: string,
  params: Partial<SelectOptions<T>> = {}
): Promise<ATRecord<T>[]> {
  const out: ATRecord<T>[] = [];
  await new Promise<void>((resolve, reject) => {
    base(table)
      .select(params as any)
      .eachPage(
        (records: Airtable.Records<T>, fetchNextPage: (err?: any) => void) => {
          records.forEach((r) => out.push(r as unknown as ATRecord<T>));
          fetchNextPage();
        },
        (err?: any) => {
          if (err) reject(err);
          else resolve();
        }
      );
  });
  return out;
}


// Удобный геттер id
export function rid(rec: ATRecord | string) {
  return typeof rec === "string" ? rec : rec.getId();
}
