import type { SQLiteDatabase } from "expo-sqlite";
import type { EntryKind, Expense } from "../types";
import { mapExpenseRow, type ExpenseRow } from "./rows";

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
  return rows.map(mapExpenseRow);
}

export async function getExpenseById(
  db: SQLiteDatabase,
  id: string
): Promise<Expense | null> {
  const row = await db.getFirstAsync<ExpenseRow>(
    "SELECT id, amount, category, note, date, created_at, kind FROM expenses WHERE id = ?",
    id
  );
  return row ? mapExpenseRow(row) : null;
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
