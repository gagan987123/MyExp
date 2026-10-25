import type { SQLiteDatabase } from "expo-sqlite";
import { database } from "../../config";

const DATABASE_VERSION = database.version;

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  // The WidgetKit extension reads this same file with a plain
  // SQLITE_OPEN_READONLY sqlite3 connection from another process.
  // WAL mode + a readonly cross-process reader = stale widget (writer
  // holds frames in -wal, reader sees the last checkpoint, or hits
  // SQLITE_BUSY/CANTOPEN when recovery is needed). This DB is tiny,
  // so DELETE mode costs nothing and keeps app + widget + Siri intent
  // on the same journaling. Runs on every launch — before the
  // version early-return — so existing WAL databases get converted.
  try {
    await db.execAsync(`PRAGMA wal_checkpoint(TRUNCATE);`);
  } catch {
    // Fresh/empty DB: nothing to checkpoint yet.
  }
  try {
    await db.execAsync(`PRAGMA journal_mode = DELETE;`);
  } catch {
    // Non-fatal: widget may lag until the next checkpoint.
  }
  // Self-healing columns (always runs, even past the version gate):
  // observed a v9-stamped database missing its ALTERs in the wild, and
  // a version guard can never refire for it. One statement per exec.
  await ensureColumn(db, "trip_expenses", "split_custom", "split_custom TEXT");
  await ensureColumn(
    db,
    "trips",
    "archived",
    "archived INTEGER NOT NULL DEFAULT 0",
  );
  const row = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  let currentVersion = row?.user_version ?? 0;
  if (currentVersion >= DATABASE_VERSION) return;

  if (currentVersion === 0) {
    await db.execAsync(`
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

  // v2 → v3: recurring salary/EMI templates. App-managed only; Siri never
  // touches this table (it writes finished rows straight to expenses).
  if (currentVersion === 2) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS recurring_templates (
        id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        note TEXT,
        day_of_month INTEGER NOT NULL,
        start_year INTEGER NOT NULL,
        start_month INTEGER NOT NULL,
        total_installments INTEGER,
        posted_count INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      );
    `);
    currentVersion = 3;
  }

  // v3 → v4: user-created categories. Built-ins stay in code as defaults;
  // only customs live here. Siri reads this table to learn them too.
  if (currentVersion === 3) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'expense',
        created_at TEXT NOT NULL
      );
    `);
    currentVersion = 4;
  }

  // v4 → v5: tiny key-value shelf inside the shared DB, replacing the
  // ai-enabled.txt / ai-key.txt files (expo-file-system writes proved
  // unreliable there). Both targets already do SQLite flawlessly.
  if (currentVersion === 4) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS app_kv (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
    currentVersion = 5;
  }

  // v5 → v6: Scan & Pay payment attempts. One row per UPI app-switch,
  // keyed by our own tr (UNIQUE) so retries/kills/double-taps can
  // never produce two expenses. Siri never touches this table.
  if (currentVersion === 5) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS payment_attempts (
        id TEXT PRIMARY KEY NOT NULL,
        tr TEXT NOT NULL UNIQUE,
        pa TEXT NOT NULL,
        pn TEXT,
        amount REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        note TEXT,
        app TEXT NOT NULL DEFAULT 'generic',
        status TEXT NOT NULL DEFAULT 'pending_result',
        expense_id TEXT,
        created_at TEXT NOT NULL,
        resolved_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_attempts_status ON payment_attempts(status, created_at);
    `);
    currentVersion = 6;
  }

  // v6 → v7: UPI payment flow removed (share-from-UPI-app is the only
  // intake now). Drop its audit table; expenses it created stay.
  if (currentVersion === 6) {
    await db.execAsync(`
      DROP TABLE IF EXISTS payment_attempts;
    `);
    currentVersion = 7;
  }

  // v7 → v8: group trips (Splitwise core). Members are per-trip names —
  // no accounts, no backend. split_between is a JSON member-id array
  // snapshotted at creation; personal_expense_id links the auto-posted
  // personal share (deleted together). Siri never touches these.
  if (currentVersion === 7) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS trips (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS trip_members (
        id TEXT PRIMARY KEY NOT NULL,
        trip_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_trip_members_trip ON trip_members(trip_id);
      CREATE TABLE IF NOT EXISTS trip_expenses (
        id TEXT PRIMARY KEY NOT NULL,
        trip_id TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        note TEXT,
        paid_by TEXT NOT NULL,
        split_between TEXT NOT NULL,
        date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        personal_expense_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_trip_expenses_trip ON trip_expenses(trip_id);
      CREATE TABLE IF NOT EXISTS trip_settlements (
        id TEXT PRIMARY KEY NOT NULL,
        trip_id TEXT NOT NULL,
        from_member TEXT NOT NULL,
        to_member TEXT NOT NULL,
        amount REAL NOT NULL,
        date TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_trip_settlements_trip ON trip_settlements(trip_id);
    `);
    currentVersion = 8;
  }

  // v8 → v9: trip custom splits (member-id → paise JSON, NULL = equal)
  // plus trip archiving. No data rewrite: old rows read as equal splits.
  // One statement per exec: a multi-statement exec once left a database
  // stamped v9 without these columns, which no version guard can heal.
  if (currentVersion === 8) {
    await db.execAsync(
      `ALTER TABLE trip_expenses ADD COLUMN split_custom TEXT;`,
    );
    await db.execAsync(
      `ALTER TABLE trips ADD COLUMN archived INTEGER NOT NULL DEFAULT 0;`,
    );
    currentVersion = 9;
  }

  // v9 → v10: personal loans ledger (lent/borrowed outside trips) with
  // partial repayments. Balance is always derived, never stored.
  if (currentVersion === 9) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS loans (
        id TEXT PRIMARY KEY NOT NULL,
        person TEXT NOT NULL,
        contact TEXT,
        kind TEXT NOT NULL,
        amount REAL NOT NULL,
        note TEXT,
        date TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS loan_payments (
        id TEXT PRIMARY KEY NOT NULL,
        loan_id TEXT NOT NULL,
        amount REAL NOT NULL,
        date TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);
    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_loan_payments_loan ON loan_payments(loan_id);
    `);
    currentVersion = 10;
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

/** Adds a missing column; no-op when present or when the table is absent. */
async function ensureColumn(
  db: SQLiteDatabase,
  table: string,
  column: string,
  ddl: string,
): Promise<void> {
  try {
    const info = await db.getAllAsync<{ name: string }>(
      `PRAGMA table_info(${table})`,
    );
    if (!info.some((c) => c.name === column)) {
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    }
  } catch {
    // Table absent (created later in this run) or transient lock.
  }
}
