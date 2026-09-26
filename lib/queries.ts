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
