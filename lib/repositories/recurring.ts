import type { SQLiteDatabase } from "expo-sqlite";
import type { RecurringTemplate } from "../types";
import { mapTemplateRow, type RecurringTemplateRow } from "./rows";

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
