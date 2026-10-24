import type { SQLiteDatabase } from "expo-sqlite";
import {
  deleteAllExpenses,
  deleteExpense,
  getAllExpenses,
  getExpenseById,
  insertExpense,
  updateExpense,
} from "../repositories/expenses";
import { NotFoundError, toUserMessage } from "../core/errors";
import { generateId } from "../core/ids";
import { validateInput } from "../core/validation";
import { pokeWidget } from "../core/widget";
import type { AddExpenseInput, Expense, UpdateExpenseInput } from "../types";
import { allowedCategoryIds } from "./categories";

// NOTE: every function takes `db` as the first arg and imports nothing
// from React. A future Siri / Assistant bridge can call these directly.

export async function addExpense(
  db: SQLiteDatabase,
  input: AddExpenseInput
): Promise<Expense> {
  const valid = validateInput(input, await allowedCategoryIds(db));
  const now = new Date().toISOString();
  const expense: Expense = { id: generateId(), ...valid, createdAt: now };
  try {
    await insertExpense(db, expense);
    pokeWidget(db);
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
  const valid = validateInput(input, await allowedCategoryIds(db));
  try {
    const existing = await getExpenseById(db, input.id);
    if (!existing) throw new NotFoundError("Expense not found.");
    await updateExpense(db, input.id, valid);
    pokeWidget(db);
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
    pokeWidget(db);
  } catch (error) {
    toUserMessage(error);
  }
}

export async function clearAllExpenses(db: SQLiteDatabase): Promise<void> {
  try {
    await deleteAllExpenses(db);
    pokeWidget(db);
  } catch (error) {
    toUserMessage(error);
  }
}
