// простая обёртка Airtable SDK + хелперы
import Airtable from 'airtable';

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
} = process.env as Record<string,string>;

export const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID!);

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

export type ATRecord<T=any> = Airtable.Record<T>;

export async function selectAll(table: string, params: Airtable.SelectOptions<any>) {
  const records: ATRecord[] = [];
  await base(table).select(params).eachPage((page, fetchNext) => {
    records.push(...page);
    fetchNext();
  });
  return records;
}

export function rid(rec: ATRecord | string) {
  return typeof rec === 'string' ? rec : rec.getId();
}

