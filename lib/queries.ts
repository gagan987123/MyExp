import type { SQLiteDatabase } from "expo-sqlite";

export type CategoryId =
  | "food"
  | "transport"
  | "petrol"
  | "shopping"
  | "bills"
  | "entertainment"
  | "health"
  | "travel"
  | "salary"
  | "other";

export type EntryKind = "expense" | "income";

export type Expense = {
  id: string;
  amount: number;
  /** Built-in CategoryId or a custom category id. */
  category: string;
  note: string | null;
  /** ISO date string for the entry day */
  date: string;
  /** ISO timestamp of creation */
  createdAt: string;
  /** Money direction. Defaults to expense for pre-v2 rows. */
  kind: EntryKind;
};

type ExpenseRow = {
  id: string;
  amount: number;
  category: string;
  note: string | null;
  date: string;
  created_at: string;
  kind?: string | null;
};

function mapRow(row: ExpenseRow): Expense {
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

export async function insertExpense(
  db: SQLiteDatabase,
  expense: Expense
): Promise<void> {
  await db.runAsync(
    "INSERT INTO expenses (id, amount, category, note, date, created_at, kind) VALUES (?, ?, ?, ?, ?, ?, ?)",
    expense.id,
    expense.amount,
    expense.category,
    expense.note,
    expense.date,
    expense.createdAt,
    expense.kind
  );
}

export async function getAllExpenses(db: SQLiteDatabase): Promise<Expense[]> {
  const rows = await db.getAllAsync<ExpenseRow>(
    "SELECT id, amount, category, note, date, created_at, kind FROM expenses ORDER BY date DESC, created_at DESC"
  );
  return rows.map(mapRow);
}

export async function getExpenseById(
  db: SQLiteDatabase,
  id: string
): Promise<Expense | null> {
  const row = await db.getFirstAsync<ExpenseRow>(
    "SELECT id, amount, category, note, date, created_at, kind FROM expenses WHERE id = ?",
    id
  );
  return row ? mapRow(row) : null;
}

export async function updateExpense(
  db: SQLiteDatabase,
  id: string,
  patch: { amount: number; category: string; note: string | null; date: string; kind: EntryKind }
): Promise<void> {
  await db.runAsync(
    "UPDATE expenses SET amount = ?, category = ?, note = ?, date = ?, kind = ? WHERE id = ?",
    patch.amount,
    patch.category,
    patch.note,
    patch.date,
    patch.kind,
    id
  );
}

export async function deleteExpense(
  db: SQLiteDatabase,
  id: string
): Promise<void> {
  await db.runAsync("DELETE FROM expenses WHERE id = ?", id);
}

export async function deleteAllExpenses(db: SQLiteDatabase): Promise<void> {
  await db.runAsync("DELETE FROM expenses");
}

export type RecurringTemplate = {
  id: string;
  kind: EntryKind;
  amount: number;
  category: string;
  note: string | null;
  /** Day of month, 1–28. */
  dayOfMonth: number;
  startYear: number;
  /** 1–12 */
  startMonth: number;
  /** Total installments, or null for indefinite. */
  totalInstallments: number | null;
  postedCount: number;
  active: boolean;
  createdAt: string;
};

type RecurringTemplateRow = {
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

function mapTemplateRow(row: RecurringTemplateRow): RecurringTemplate {
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

export async function insertRecurringTemplate(
  db: SQLiteDatabase,
  t: RecurringTemplate
): Promise<void> {
  await db.runAsync(
    "INSERT INTO recurring_templates (id, kind, amount, category, note, day_of_month, start_year, start_month, total_installments, posted_count, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    t.id,
    t.kind,
    t.amount,
    t.category,
    t.note,
    t.dayOfMonth,
    t.startYear,
    t.startMonth,
    t.totalInstallments,
    t.postedCount,
    t.active ? 1 : 0,
    t.createdAt
  );
}

export async function getRecurringTemplates(
  db: SQLiteDatabase
): Promise<RecurringTemplate[]> {
  const rows = await db.getAllAsync<RecurringTemplateRow>(
    "SELECT * FROM recurring_templates ORDER BY created_at DESC"
  );
  return rows.map(mapTemplateRow);
}

export async function updateRecurringPostedCount(
  db: SQLiteDatabase,
  id: string,
  postedCount: number
): Promise<void> {
  await db.runAsync(
    "UPDATE recurring_templates SET posted_count = ? WHERE id = ?",
    postedCount,
    id
  );
}

export async function setRecurringActive(
  db: SQLiteDatabase,
  id: string,
  active: boolean
): Promise<void> {
  await db.runAsync("UPDATE recurring_templates SET active = ? WHERE id = ?", active ? 1 : 0, id);
}

export async function deleteRecurringTemplate(
  db: SQLiteDatabase,
  id: string
): Promise<void> {
  await db.runAsync("DELETE FROM recurring_templates WHERE id = ?", id);
}

export type CustomCategory = {
  id: string;
  name: string;
  icon: string;
  kind: EntryKind;
  createdAt: string;
};

type CustomCategoryRow = {
  id: string;
  name: string;
  icon: string;
  kind: string;
  created_at: string;
};

function mapCustomCategoryRow(row: CustomCategoryRow): CustomCategory {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    kind: row.kind === "income" ? "income" : "expense",
    createdAt: row.created_at,
  };
}

export async function insertCustomCategory(
  db: SQLiteDatabase,
  c: CustomCategory
): Promise<void> {
  await db.runAsync(
    "INSERT INTO categories (id, name, icon, kind, created_at) VALUES (?, ?, ?, ?, ?)",
    c.id,
    c.name,
    c.icon,
    c.kind,
    c.createdAt
  );
}

export async function getCustomCategories(
  db: SQLiteDatabase
): Promise<CustomCategory[]> {
  try {
    const rows = await db.getAllAsync<CustomCategoryRow>(
      "SELECT id, name, icon, kind, created_at FROM categories ORDER BY created_at"
    );
    return rows.map(mapCustomCategoryRow);
  } catch {
    // Pre-v4 database (or Siri hitting an old file): no customs.
    return [];
  }
}

export async function deleteCustomCategory(
  db: SQLiteDatabase,
  id: string
): Promise<void> {
  await db.runAsync("DELETE FROM categories WHERE id = ?", id);
}

export async function getKv(
  db: SQLiteDatabase,
  key: string
): Promise<string | null> {
  try {
    const row = await db.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_kv WHERE key = ?",
      key
    );
    return row?.value ?? null;
  } catch {
    return null;
  }
}

export async function setKv(
  db: SQLiteDatabase,
  key: string,
  value: string
): Promise<void> {
  await db.runAsync(
    "INSERT INTO app_kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    value
  );
}

export async function deleteKv(db: SQLiteDatabase, key: string): Promise<void> {
  try {
    await db.runAsync("DELETE FROM app_kv WHERE key = ?", key);
  } catch {}
}

// --- Personal loans (lent/borrowed outside trips) ---------------------------
// Balance = amount − repayments, always derived. kind is 'lent' (they owe
// me) or 'borrowed' (I owe them).

export type LoanKind = "lent" | "borrowed";

export type Loan = {
  id: string;
  person: string;
  contact: string | null;
  kind: LoanKind;
  amount: number;
  note: string | null;
  date: string;
  createdAt: string;
};

export type LoanPayment = {
  id: string;
  loanId: string;
  amount: number;
  date: string;
  createdAt: string;
};

type LoanRow = {
  id: string;
  person: string;
  contact: string | null;
  kind: string;
  amount: number;
  note: string | null;
  date: string;
  created_at: string;
};

type LoanPaymentRow = {
  id: string;
  loan_id: string;
  amount: number;
  date: string;
  created_at: string;
};

function mapLoanRow(r: LoanRow): Loan {
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

export async function insertLoan(db: SQLiteDatabase, loan: Loan): Promise<void> {
  await db.runAsync(
    "INSERT INTO loans (id, person, contact, kind, amount, note, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    loan.id, loan.person, loan.contact, loan.kind, loan.amount, loan.note, loan.date, loan.createdAt
  );
}

export async function getLoans(db: SQLiteDatabase): Promise<Loan[]> {
  try {
    const rows = await db.getAllAsync<LoanRow>(
      "SELECT id, person, contact, kind, amount, note, date, created_at FROM loans ORDER BY date DESC, created_at DESC"
    );
    return rows.map(mapLoanRow);
  } catch {
    return [];
  }
}

export async function getLoanById(db: SQLiteDatabase, id: string): Promise<Loan | null> {
  try {
    const row = await db.getFirstAsync<LoanRow>(
      "SELECT id, person, contact, kind, amount, note, date, created_at FROM loans WHERE id = ?",
      id
    );
    return row ? mapLoanRow(row) : null;
  } catch {
    return null;
  }
}

export async function deleteLoan(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync("DELETE FROM loan_payments WHERE loan_id = ?", id);
  await db.runAsync("DELETE FROM loans WHERE id = ?", id);
}

export async function insertLoanPayment(db: SQLiteDatabase, p: LoanPayment): Promise<void> {
  await db.runAsync(
    "INSERT INTO loan_payments (id, loan_id, amount, date, created_at) VALUES (?, ?, ?, ?, ?)",
    p.id, p.loanId, p.amount, p.date, p.createdAt
  );
}

export async function getLoanPayments(db: SQLiteDatabase, loanId: string): Promise<LoanPayment[]> {
  try {
    const rows = await db.getAllAsync<LoanPaymentRow>(
      "SELECT id, loan_id, amount, date, created_at FROM loan_payments WHERE loan_id = ? ORDER BY date DESC, created_at DESC",
      loanId
    );
    return rows.map((r) => ({
      id: r.id, loanId: r.loan_id, amount: r.amount, date: r.date, createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

export async function deleteLoanPayment(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync("DELETE FROM loan_payments WHERE id = ?", id);
}

// --- Group trips (Splitwise core) -------------------------------------------
// Members are per-trip plain names. splitBetween is a JSON member-id
// array snapshotted at creation. Balances are always DERIVED (see
// service.ts), never stored — so nothing here can go stale.

export type Trip = {
  id: string;
  name: string;
  createdAt: string;
  archived: boolean;
};

export type TripMember = {
  id: string;
  tripId: string;
  name: string;
  createdAt: string;
};

export type TripExpense = {
  id: string;
  tripId: string;
  amount: number;
  category: string;
  note: string | null;
  paidBy: string;
  splitBetween: string[];
  /** Member-id → paise. NULL/empty = equal split. */
  splitCustom: Record<string, number> | null;
  date: string;
  createdAt: string;
  personalExpenseId: string | null;
};

export type TripSettlement = {
  id: string;
  tripId: string;
  fromMember: string;
  toMember: string;
  amount: number;
  date: string;
  createdAt: string;
};

type TripRow = { id: string; name: string; created_at: string; archived?: number | null };
type TripMemberRow = { id: string; trip_id: string; name: string; created_at: string };
type TripExpenseRow = {
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
type TripSettlementRow = {
  id: string;
  trip_id: string;
  from_member: string;
  to_member: string;
  amount: number;
  date: string;
  created_at: string;
};

function parseSplitBetween(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function insertTrip(db: SQLiteDatabase, trip: Trip): Promise<void> {
  await db.runAsync("INSERT INTO trips (id, name, created_at) VALUES (?, ?, ?)", trip.id, trip.name, trip.createdAt);
}

export async function getTrips(db: SQLiteDatabase, includeArchived = false): Promise<Trip[]> {
  try {
    const rows = await db.getAllAsync<TripRow>(
      includeArchived
        ? "SELECT id, name, created_at, archived FROM trips ORDER BY created_at DESC"
        : "SELECT id, name, created_at, archived FROM trips WHERE COALESCE(archived, 0) = 0 ORDER BY created_at DESC"
    );
    return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at, archived: (r.archived ?? 0) === 1 }));
  } catch {
    return [];
  }
}

export async function getTripById(db: SQLiteDatabase, id: string): Promise<Trip | null> {
  try {
    const row = await db.getFirstAsync<TripRow>("SELECT id, name, created_at, archived FROM trips WHERE id = ?", id);
    return row ? { id: row.id, name: row.name, createdAt: row.created_at, archived: (row.archived ?? 0) === 1 } : null;
  } catch {
    return null;
  }
}

export async function setTripArchived(db: SQLiteDatabase, id: string, archived: boolean): Promise<void> {
  await db.runAsync("UPDATE trips SET archived = ? WHERE id = ?", archived ? 1 : 0, id);
}

/** Deletes the trip and everything in it. Personal ledger entries stay (real past spending). */
export async function deleteTripData(db: SQLiteDatabase, tripId: string): Promise<void> {
  await db.runAsync("DELETE FROM trip_settlements WHERE trip_id = ?", tripId);
  await db.runAsync("DELETE FROM trip_expenses WHERE trip_id = ?", tripId);
  await db.runAsync("DELETE FROM trip_members WHERE trip_id = ?", tripId);
  await db.runAsync("DELETE FROM trips WHERE id = ?", tripId);
}

export async function insertTripMember(db: SQLiteDatabase, m: TripMember): Promise<void> {
  await db.runAsync(
    "INSERT INTO trip_members (id, trip_id, name, created_at) VALUES (?, ?, ?, ?)",
    m.id, m.tripId, m.name, m.createdAt
  );
}

export async function getTripMembers(db: SQLiteDatabase, tripId: string): Promise<TripMember[]> {
  try {
    const rows = await db.getAllAsync<TripMemberRow>(
      "SELECT id, trip_id, name, created_at FROM trip_members WHERE trip_id = ? ORDER BY created_at",
      tripId
    );
    return rows.map((r) => ({ id: r.id, tripId: r.trip_id, name: r.name, createdAt: r.created_at }));
  } catch {
    return [];
  }
}

export async function deleteTripMember(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync("DELETE FROM trip_members WHERE id = ?", id);
}

export async function insertTripExpense(db: SQLiteDatabase, e: TripExpense): Promise<void> {
  await db.runAsync(
    "INSERT INTO trip_expenses (id, trip_id, amount, category, note, paid_by, split_between, split_custom, date, created_at, personal_expense_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    e.id, e.tripId, e.amount, e.category, e.note, e.paidBy,
    JSON.stringify(e.splitBetween), e.splitCustom ? JSON.stringify(e.splitCustom) : null,
    e.date, e.createdAt, e.personalExpenseId
  );
}

function mapTripExpenseRow(r: TripExpenseRow): TripExpense {
  return {
    id: r.id, tripId: r.trip_id, amount: r.amount, category: r.category,
    note: r.note, paidBy: r.paid_by, splitBetween: parseSplitBetween(r.split_between),
    splitCustom: parseSplitCustom(r.split_custom),
    date: r.date, createdAt: r.created_at, personalExpenseId: r.personal_expense_id,
  };
}

/** NULL/malformed → equal split. Only non-negative integer paise survive. */
function parseSplitCustom(raw: string | null): Record<string, number> | null {
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

export async function getTripExpenses(db: SQLiteDatabase, tripId: string): Promise<TripExpense[]> {
  try {
    const rows = await db.getAllAsync<TripExpenseRow>(
      "SELECT * FROM trip_expenses WHERE trip_id = ? ORDER BY date DESC, created_at DESC",
      tripId
    );
    return rows.map(mapTripExpenseRow);
  } catch {
    return [];
  }
}

export async function getTripExpenseById(db: SQLiteDatabase, id: string): Promise<TripExpense | null> {
  try {
    const row = await db.getFirstAsync<TripExpenseRow>("SELECT * FROM trip_expenses WHERE id = ?", id);
    return row ? mapTripExpenseRow(row) : null;
  } catch {
    return null;
  }
}

export async function deleteTripExpense(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync("DELETE FROM trip_expenses WHERE id = ?", id);
}

export async function insertTripSettlement(db: SQLiteDatabase, s: TripSettlement): Promise<void> {
  await db.runAsync(
    "INSERT INTO trip_settlements (id, trip_id, from_member, to_member, amount, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    s.id, s.tripId, s.fromMember, s.toMember, s.amount, s.date, s.createdAt
  );
}

export async function getTripSettlements(db: SQLiteDatabase, tripId: string): Promise<TripSettlement[]> {
  try {
    const rows = await db.getAllAsync<TripSettlementRow>(
      "SELECT * FROM trip_settlements WHERE trip_id = ? ORDER BY date DESC, created_at DESC",
      tripId
    );
    return rows.map((r) => ({
      id: r.id, tripId: r.trip_id, fromMember: r.from_member, toMember: r.to_member,
      amount: r.amount, date: r.date, createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

export async function deleteTripSettlement(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync("DELETE FROM trip_settlements WHERE id = ?", id);
}
