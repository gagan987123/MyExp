import type { SQLiteDatabase } from "expo-sqlite";
import {
  deleteAllExpenses,
  deleteExpense,
  getAllExpenses,
  getExpenseById,
  insertExpense,
  updateExpense,
  type CategoryId,
  type EntryKind,
  type Expense,
} from "./queries";

export type { CategoryId, EntryKind, Expense };

export const CATEGORIES: { id: CategoryId; name: string; icon: string }[] = [
  { id: "food", name: "Food", icon: "food" },
  { id: "transport", name: "Transport", icon: "bus" },
  { id: "petrol", name: "Petrol", icon: "gas-station" },
  { id: "shopping", name: "Shopping", icon: "shopping" },
  { id: "bills", name: "Bills", icon: "receipt-text" },
  { id: "entertainment", name: "Entertainment", icon: "movie-open" },
  { id: "health", name: "Health", icon: "heart-pulse" },
  { id: "travel", name: "Travel", icon: "airplane" },
  { id: "salary", name: "Salary", icon: "briefcase" },
  { id: "other", name: "Other", icon: "dots-horizontal" },
];

const CATEGORY_IDS = new Set<string>(CATEGORIES.map((c) => c.id));

const CATEGORY_ALIASES: Record<string, CategoryId> = {
  gas: "petrol",
  fuel: "petrol",
  diesel: "petrol",
  cab: "transport",
  taxi: "transport",
  auto: "transport",
  bus: "transport",
  metro: "transport",
  train: "transport",
  flight: "travel",
  hotel: "travel",
  movie: "entertainment",
  movies: "entertainment",
  medicine: "health",
  medical: "health",
  doctor: "health",
  hospital: "health",
  groceries: "food",
  grocery: "food",
  restaurant: "food",
  electricity: "bills",
  water: "bills",
  rent: "bills",
  internet: "bills",
  recharge: "bills",
  clothes: "shopping",
  clothing: "shopping",
  salary: "salary",
  pay: "salary",
  paycheck: "salary",
  income: "salary",
  wages: "salary",
};

/**
 * Fuzzy category match for voice/deep-link input.
 * Accepts ids ("food"), names ("Food"), and common aliases ("cab" → transport).
 * Returns null when nothing matches (caller falls back to "other" or asks).
 */
export function matchCategory(raw: string | null | undefined): CategoryId | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (CATEGORY_IDS.has(key)) return key as CategoryId;
  for (const c of CATEGORIES) {
    if (c.name.toLowerCase() === key) return c.id;
  }
  return CATEGORY_ALIASES[key] ?? null;
}

export class ValidationError extends Error {}
export class NotFoundError extends Error {}
export class DatabaseError extends Error {}

export type AddExpenseInput = {
  amount: number;
  category: string;
  note?: string | null;
  date?: Date | string;
  kind?: EntryKind;
};

export type UpdateExpenseInput = AddExpenseInput & { id: string };

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toISODate(input?: Date | string): string {
  if (!input) return new Date().toISOString();
  if (input instanceof Date) {
    if (isNaN(input.getTime())) throw new ValidationError("Invalid date.");
    return input.toISOString();
  }
  const d = new Date(input);
  if (isNaN(d.getTime())) throw new ValidationError("Invalid date.");
  return d.toISOString();
}

function validateInput(input: AddExpenseInput): {
  amount: number;
  category: CategoryId;
  note: string | null;
  date: string;
  kind: EntryKind;
} {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new ValidationError("Amount must be greater than 0.");
  }
  if (!input.category || !CATEGORY_IDS.has(input.category)) {
    throw new ValidationError("Please choose a valid category.");
  }
  const kind: EntryKind = input.kind === "income" ? "income" : "expense";
  const note =
    input.note == null || input.note.trim() === "" ? null : input.note.trim();
  return {
    amount: input.amount,
    category: input.category as CategoryId,
    note,
    date: toISODate(input.date),
    kind,
  };
}

function toUserMessage(error: unknown): never {
  if (error instanceof ValidationError || error instanceof NotFoundError) {
    throw error;
  }
  throw new DatabaseError("Something went wrong saving your expense.");
}

// NOTE: every function takes `db` as the first arg and imports nothing
// from React. A future Siri / Assistant bridge can call these directly.

export async function addExpense(
  db: SQLiteDatabase,
  input: AddExpenseInput
): Promise<Expense> {
  const valid = validateInput(input);
  const now = new Date().toISOString();
  const expense: Expense = { id: generateId(), ...valid, createdAt: now };
  try {
    await insertExpense(db, expense);
    return expense;
  } catch (error) {
    toUserMessage(error);
  }
}

export async function listExpenses(db: SQLiteDatabase): Promise<Expense[]> {
  try {
    return await getAllExpenses(db);
  } catch (error) {
    toUserMessage(error);
  }
}

export async function fetchExpenseById(
  db: SQLiteDatabase,
  id: string
): Promise<Expense> {
  try {
    const expense = await getExpenseById(db, id);
    if (!expense) throw new NotFoundError("Expense not found.");
    return expense;
  } catch (error) {
    toUserMessage(error);
  }
}

export async function editExpense(
  db: SQLiteDatabase,
  input: UpdateExpenseInput
): Promise<Expense> {
  const valid = validateInput(input);
  try {
    const existing = await getExpenseById(db, input.id);
    if (!existing) throw new NotFoundError("Expense not found.");
    await updateExpense(db, input.id, valid);
    return { ...existing, ...valid };
  } catch (error) {
    toUserMessage(error);
  }
}

export async function removeExpense(
  db: SQLiteDatabase,
  id: string
): Promise<void> {
  try {
    const existing = await getExpenseById(db, id);
    if (!existing) throw new NotFoundError("Expense not found.");
    await deleteExpense(db, id);
  } catch (error) {
    toUserMessage(error);
  }
}

export async function clearAllExpenses(db: SQLiteDatabase): Promise<void> {
  try {
    await deleteAllExpenses(db);
  } catch (error) {
    toUserMessage(error);
  }
}

// --- Basic stats (computed in JS, no chart lib needed for v1) ---

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isThisMonth(dateISO: string, now: Date): boolean {
  const d = new Date(dateISO);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export async function getTodayTotal(db: SQLiteDatabase): Promise<number> {
  const expenses = await listExpenses(db);
  const now = new Date();
  return expenses
    .filter((e) => e.kind === "expense" && isSameDay(new Date(e.date), now))
    .reduce((sum, e) => sum + e.amount, 0);
}

export async function getMonthTotal(db: SQLiteDatabase): Promise<number> {
  const expenses = await listExpenses(db);
  const now = new Date();
  return expenses
    .filter((e) => e.kind === "expense" && isThisMonth(e.date, now))
    .reduce((sum, e) => sum + e.amount, 0);
}

export async function getMonthIncome(db: SQLiteDatabase): Promise<number> {
  const expenses = await listExpenses(db);
  const now = new Date();
  return expenses
    .filter((e) => e.kind === "income" && isThisMonth(e.date, now))
    .reduce((sum, e) => sum + e.amount, 0);
}

export async function getMonthBalance(db: SQLiteDatabase): Promise<number> {
  const [income, spent] = await Promise.all([
    getMonthIncome(db),
    getMonthTotal(db),
  ]);
  return income - spent;
}

export async function getCategoryTotals(
  db: SQLiteDatabase
): Promise<Record<CategoryId, number>> {
  const expenses = await listExpenses(db);
  const totals = Object.fromEntries(
    CATEGORIES.map((c) => [c.id, 0])
  ) as Record<CategoryId, number>;
  for (const e of expenses) {
    totals[e.category] = (totals[e.category] ?? 0) + e.amount;
  }
  return totals;
}

export async function getMonthCategoryTotals(
  db: SQLiteDatabase
): Promise<{ total: number; byCategory: { id: CategoryId; amount: number }[] }> {
  const expenses = await listExpenses(db);
  const now = new Date();
  const monthExpenses = expenses.filter(
    (e) => e.kind === "expense" && isThisMonth(e.date, now)
  );
  const sums = new Map<CategoryId, number>();
  let total = 0;
  for (const e of monthExpenses) {
    total += e.amount;
    sums.set(e.category, (sums.get(e.category) ?? 0) + e.amount);
  }
  const byCategory = [...sums.entries()]
    .map(([id, amount]) => ({ id, amount }))
    .sort((a, b) => b.amount - a.amount);
  return { total, byCategory };
}
