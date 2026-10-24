import type { SQLiteDatabase } from "expo-sqlite";
import { toUserMessage } from "../core/errors";
import { generateId } from "../core/ids";
import { validateRecurringInput } from "../core/validation";
import { pokeWidget } from "../core/widget";
import { insertExpense } from "../repositories/expenses";
import {
  deleteRecurringTemplate,
  getRecurringTemplates,
  insertRecurringTemplate,
  setRecurringActive,
  updateRecurringPostedCount,
} from "../repositories/recurring";
import type { AddRecurringInput, Expense, RecurringTemplate } from "../types";
import { allowedCategoryIds } from "./categories";

export async function addRecurringTemplate(
  db: SQLiteDatabase,
  input: AddRecurringInput
): Promise<RecurringTemplate> {
  const valid = validateRecurringInput(input, await allowedCategoryIds(db));
  const template: RecurringTemplate = {
    id: generateId(),
    ...valid,
    postedCount: 0,
    active: true,
    createdAt: new Date().toISOString(),
  };
  try {
    await insertRecurringTemplate(db, template);
    return template;
  } catch (error) {
    toUserMessage(error);
  }
}

export async function listRecurringTemplates(
  db: SQLiteDatabase
): Promise<RecurringTemplate[]> {
  try {
    return await getRecurringTemplates(db);
  } catch (error) {
    toUserMessage(error);
  }
}

export async function setRecurringTemplateActive(
  db: SQLiteDatabase,
  id: string,
  active: boolean
): Promise<void> {
  try {
    await setRecurringActive(db, id, active);
  } catch (error) {
    toUserMessage(error);
  }
}

export async function removeRecurringTemplate(
  db: SQLiteDatabase,
  id: string
): Promise<void> {
  try {
    await deleteRecurringTemplate(db, id);
  } catch (error) {
    toUserMessage(error);
  }
}

function monthsDue(
  t: Pick<
    RecurringTemplate,
    "dayOfMonth" | "startYear" | "startMonth" | "totalInstallments" | "postedCount"
  >,
  today: Date
): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  let y = t.startYear;
  let m = t.startMonth;
  let index = 0;
  while (true) {
    if (t.totalInstallments != null && index >= t.totalInstallments) break;
    if (y > today.getFullYear() || (y === today.getFullYear() && m > today.getMonth() + 1)) break;
    const isCurrentMonth =
      y === today.getFullYear() && m === today.getMonth() + 1;
    if (!isCurrentMonth || t.dayOfMonth <= today.getDate()) {
      if (index >= t.postedCount) out.push({ year: y, month: m });
    }
    index += 1;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (index > 1200) break; // safety: 100 years
  }
  return out;
}

/** Posts every due installment. Returns the created entries. */
export async function postDueRecurring(
  db: SQLiteDatabase,
  today: Date = new Date()
): Promise<Expense[]> {
  const templates = await listRecurringTemplates(db);
  const posted: Expense[] = [];
  const nowISO = new Date().toISOString();
  for (const t of templates) {
    if (!t.active) continue;
    const due = monthsDue(t, today);
    if (due.length === 0) continue;
    // Day 1–28 is valid in every month, no clamping needed.
    for (const { year, month } of due) {
      const day = String(t.dayOfMonth).padStart(2, "0");
      const mm = String(month).padStart(2, "0");
      const expense: Expense = {
        id: generateId(),
        amount: t.amount,
        category: t.category,
        note: t.note,
        date: new Date(`${year}-${mm}-${day}T00:00:00`).toISOString(),
        createdAt: nowISO,
        kind: t.kind,
      };
      try {
        await insertExpense(db, expense);
        posted.push(expense);
      } catch (error) {
        toUserMessage(error);
      }
    }
    try {
      await updateRecurringPostedCount(db, t.id, t.postedCount + due.length);
    } catch (error) {
      toUserMessage(error);
    }
  }
  if (posted.length > 0) pokeWidget(db);
  return posted;
}
