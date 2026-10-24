import type {
  CustomCategory,
  Expense,
  Loan,
  RecurringTemplate,
  TripExpense,
} from "../types";

export type ExpenseRow = {
  id: string;
  amount: number;
  category: string;
  note: string | null;
  date: string;
  created_at: string;
  kind?: string | null;
};

export function mapExpenseRow(row: ExpenseRow): Expense {
  return {
    id: row.id,
    amount: row.amount,
    category: row.category,
    note: row.note,
    date: row.date,
    createdAt: row.created_at,
    kind: row.kind === "income" ? "income" : "expense",
  };
}

export type RecurringTemplateRow = {
  id: string;
  kind: string;
  amount: number;
  category: string;
  note: string | null;
  day_of_month: number;
  start_year: number;
  start_month: number;
  total_installments: number | null;
  posted_count: number;
  active: number;
  created_at: string;
};

export function mapTemplateRow(row: RecurringTemplateRow): RecurringTemplate {
  return {
    id: row.id,
    kind: row.kind === "income" ? "income" : "expense",
    amount: row.amount,
    category: row.category,
    note: row.note,
    dayOfMonth: row.day_of_month,
    startYear: row.start_year,
    startMonth: row.start_month,
    totalInstallments: row.total_installments,
    postedCount: row.posted_count,
    active: row.active === 1,
    createdAt: row.created_at,
  };
}

export type CustomCategoryRow = {
  id: string;
  name: string;
  icon: string;
  kind: string;
  created_at: string;
};

export function mapCustomCategoryRow(row: CustomCategoryRow): CustomCategory {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    kind: row.kind === "income" ? "income" : "expense",
    createdAt: row.created_at,
  };
}

export type LoanRow = {
  id: string;
  person: string;
  contact: string | null;
  kind: string;
  amount: number;
  note: string | null;
  date: string;
  created_at: string;
};

export type LoanPaymentRow = {
  id: string;
  loan_id: string;
  amount: number;
  date: string;
  created_at: string;
};

export function mapLoanRow(r: LoanRow): Loan {
  return {
    id: r.id,
    person: r.person,
    contact: r.contact,
    kind: r.kind === "borrowed" ? "borrowed" : "lent",
    amount: r.amount,
    note: r.note,
    date: r.date,
    createdAt: r.created_at,
  };
}

export type TripRow = { id: string; name: string; created_at: string; archived?: number | null };
export type TripMemberRow = { id: string; trip_id: string; name: string; created_at: string };
export type TripExpenseRow = {
  id: string;
  trip_id: string;
  amount: number;
  category: string;
  note: string | null;
  paid_by: string;
  split_between: string;
  split_custom: string | null;
  date: string;
  created_at: string;
  personal_expense_id: string | null;
};
export type TripSettlementRow = {
  id: string;
  trip_id: string;
  from_member: string;
  to_member: string;
  amount: number;
  date: string;
  created_at: string;
};

export function parseSplitBetween(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** NULL/malformed → equal split. Only non-negative integer paise survive. */
export function parseSplitCustom(raw: string | null): Record<string, number> | null {
  if (raw == null) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
    const out: Record<string, number> = {};
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
      if (typeof n === "number" && Number.isInteger(n) && n >= 0) out[k] = n;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

export function mapTripExpenseRow(r: TripExpenseRow): TripExpense {
  return {
    id: r.id, tripId: r.trip_id, amount: r.amount, category: r.category,
    note: r.note, paidBy: r.paid_by, splitBetween: parseSplitBetween(r.split_between),
    splitCustom: parseSplitCustom(r.split_custom),
    date: r.date, createdAt: r.created_at, personalExpenseId: r.personal_expense_id,
  };
}
