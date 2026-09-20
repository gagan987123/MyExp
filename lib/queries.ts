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
  | "other";

export type Expense = {
  id: string;
  amount: number;
  category: CategoryId;
  note: string | null;
  /** ISO date string for the expense day */
  date: string;
  /** ISO timestamp of creation */
  createdAt: string;
};

type ExpenseRow = {
  id: string;
  amount: number;
  category: string;
  note: string | null;
  date: string;
  created_at: string;
};

function mapRow(row: ExpenseRow): Expense {
  return {
    id: row.id,
    amount: row.amount,
    category: row.category as CategoryId,
    note: row.note,
    date: row.date,
    createdAt: row.created_at,
  };
}

export async function insertExpense(
  db: SQLiteDatabase,
  expense: Expense
): Promise<void> {
  await db.runAsync(
    "INSERT INTO expenses (id, amount, category, note, date, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    expense.id,
    expense.amount,
    expense.category,
    expense.note,
    expense.date,
    expense.createdAt
  );
}

export async function getAllExpenses(db: SQLiteDatabase): Promise<Expense[]> {
  const rows = await db.getAllAsync<ExpenseRow>(
    "SELECT id, amount, category, note, date, created_at FROM expenses ORDER BY date DESC, created_at DESC"
  );
  return rows.map(mapRow);
}

export async function getExpenseById(
  db: SQLiteDatabase,
  id: string
): Promise<Expense | null> {
  const row = await db.getFirstAsync<ExpenseRow>(
    "SELECT id, amount, category, note, date, created_at FROM expenses WHERE id = ?",
    id
  );
  return row ? mapRow(row) : null;
}

export async function updateExpense(
  db: SQLiteDatabase,
  id: string,
  patch: { amount: number; category: CategoryId; note: string | null; date: string }
): Promise<void> {
  await db.runAsync(
    "UPDATE expenses SET amount = ?, category = ?, note = ?, date = ? WHERE id = ?",
    patch.amount,
    patch.category,
    patch.note,
    patch.date,
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
