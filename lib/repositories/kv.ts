import type { SQLiteDatabase } from "expo-sqlite";

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
