import type { SQLiteDatabase } from "expo-sqlite";
import type { CustomCategory } from "../types";
import { mapCustomCategoryRow, type CustomCategoryRow } from "./rows";

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
