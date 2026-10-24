import type { SQLiteDatabase } from "expo-sqlite";
import { isSameDay, isThisMonth } from "../core/dates";
import type { MonthlyPoint } from "../types";
import { listExpenses } from "./expenses";

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
): Promise<Record<string, number>> {
  const expenses = await listExpenses(db);
  const totals: Record<string, number> = {};
  for (const e of expenses) {
    totals[e.category] = (totals[e.category] ?? 0) + e.amount;
  }
  return totals;
}

export async function getMonthCategoryTotals(
  db: SQLiteDatabase
): Promise<{ total: number; byCategory: { id: string; amount: number }[] }> {
  const expenses = await listExpenses(db);
  const now = new Date();
  const monthExpenses = expenses.filter(
    (e) => e.kind === "expense" && isThisMonth(e.date, now)
  );
  const sums = new Map<string, number>();
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

/** Last `months` months including the current one, oldest first. */
export async function getMonthlyHistory(
  db: SQLiteDatabase,
  months: number = 6
): Promise<MonthlyPoint[]> {
  const expenses = await listExpenses(db);
  const now = new Date();
  const points: MonthlyPoint[] = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const ref = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = ref.getFullYear();
    const m = ref.getMonth();
    let spent = 0;
    let income = 0;
    for (const e of expenses) {
      const d = new Date(e.date);
      if (d.getFullYear() === y && d.getMonth() === m) {
        if (e.kind === "income") income += e.amount;
        else spent += e.amount;
      }
    }
    points.push({
      year: y,
      month: m + 1,
      label: ref.toLocaleString("en-IN", { month: "short" }),
      spent: Math.round(spent),
      income: Math.round(income),
    });
  }
  return points;
}
