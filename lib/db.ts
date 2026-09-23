import type { SQLiteDatabase } from "expo-sqlite";
import { File, Paths } from "expo-file-system";
import { copyAsync } from "expo-file-system/legacy";

export const DATABASE_NAME = "expenses.db";
const DATABASE_VERSION = 2;

/** Must match the App Group in app.json + the Swift intent. */
export const APP_GROUP_ID = "group.com.gagan987123.myexp";

/**
 * Returns the shared App Group directory when available (device builds
 * with the entitlement), otherwise undefined (default sandbox dir).
 * On first shared run, migrates the existing sandbox database file over,
 * so no expenses are lost in the move. One file, one truth, both targets.
 */
export async function resolveDatabaseDirectory(): Promise<string | undefined> {
  try {
    const shared = Paths.appleSharedContainers?.[APP_GROUP_ID];
    if (!shared) return undefined;
    const dest = new File(shared, DATABASE_NAME);
    if (!dest.exists) {
      const legacy = new File(Paths.document, "SQLite", DATABASE_NAME);
      if (legacy.exists) {
        await copyAsync({ from: legacy.uri, to: dest.uri });
      }
    }
    return shared.uri;
  } catch {
    return undefined;
  }
}

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version"
  );
  let currentVersion = row?.user_version ?? 0;
  if (currentVersion >= DATABASE_VERSION) return;

  if (currentVersion === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = 'wal';
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY NOT NULL,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        note TEXT,
        date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'expense'
      );
      CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
    `);
    currentVersion = 2;
  }

  // v1 → v2: every existing row is money-out; income arrives only via v2.
  if (currentVersion === 1) {
    await db.execAsync(`
      ALTER TABLE expenses ADD COLUMN kind TEXT NOT NULL DEFAULT 'expense';
    `);
    currentVersion = 2;
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
