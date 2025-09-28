import Airtable from 'airtable';

// ...envs как у тебя

export const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID!);

// ✅ Главное исправление — ограничить generic через FieldSet
export type ATRecord<T extends Airtable.FieldSet = Airtable.FieldSet> = Airtable.Record<T>;

export const TBL = {
  ORDERS: AIRTABLE_TBL_ORDERS || 'Orders',
  ORDER_LINES: AIRTABLE_TBL_ORDER_LINES || 'Order Lines',
  MEAL_BOXES: AIRTABLE_TBL_MEAL_BOXES || 'Meal Boxes',
  DISHES: AIRTABLE_TBL_DISHES || 'Dishes',
  EMPLOYEES: AIRTABLE_TBL_EMPLOYEES || 'Employees',
  ORGS: AIRTABLE_TBL_ORGS || 'Organizations',
  REPORT_TYPES: AIRTABLE_TBL_REPORT_TYPES || 'ReportTypes',
  REPORT_RECIPIENTS: AIRTABLE_TBL_REPORT_RECIPIENTS || 'ReportRecipients',
  REPORTS: AIRTABLE_TBL_REPORTS || 'Reports',
};

// Универсальный селект
export async function selectAll<T extends Airtable.FieldSet = Airtable.FieldSet>(
  table: string,
  params: Airtable.SelectOptions<T>
) {
  const records: Airtable.Record<T>[] = [];
  await base(table)
    .select(params as any)
    // типы sdk не идеальны — приводим к any
    .eachPage((page: any[], fetchNextPage: () => void) => {
      records.push(...(page as unknown as Airtable.Record<T>[]));
      fetchNextPage();
    });
  return records;
}

export async function selectAll(table: string, params: any) {
  return typeof rec === 'string' ? rec : rec.getId();
}
