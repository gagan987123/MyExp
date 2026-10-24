import type { SQLiteDatabase } from "expo-sqlite";
import { requireNativeModule } from "expo-modules-core";
import { reloadWidgetTimelines } from "widget-reload";
import {
  deleteAllExpenses,
  deleteCustomCategory,
  deleteExpense,
  deleteKv,
  deleteLoan,
  deleteLoanPayment,
  deleteRecurringTemplate,
  deleteTripData,
  deleteTripExpense,
  deleteTripMember,
  deleteTripSettlement,
  getAllExpenses,
  getCustomCategories,
  getExpenseById,
  getKv,
  getLoanById,
  getLoanPayments,
  getLoans,
  getRecurringTemplates,
  getTripById,
  getTripExpenseById,
  getTripExpenses,
  getTripMembers,
  getTrips,
  getTripSettlements,
  insertCustomCategory,
  insertExpense,
  insertLoan,
  insertLoanPayment,
  insertRecurringTemplate,
  insertTrip,
  insertTripExpense,
  insertTripMember,
  insertTripSettlement,
  setKv,
  setRecurringActive,
  setTripArchived as setTripArchivedRow,
  updateExpense,
  updateRecurringPostedCount,
  type CategoryId,
  type CustomCategory,
  type EntryKind,
  type Expense,
  type Loan,
  type LoanKind,
  type LoanPayment,
  type RecurringTemplate,
  type Trip,
  type TripExpense,
  type TripMember,
  type TripSettlement,
} from "./queries";

export type { CategoryId, CustomCategory, EntryKind, Expense, RecurringTemplate };
export type { Loan, LoanKind, LoanPayment, Trip, TripExpense, TripMember, TripSettlement };
// Read-only trip helpers live in queries (no service wrapping needed).
export { getTripExpenses, getTripSettlements } from "./queries";

export type CategoryEntry = {
  id: string;
  name: string;
  icon: string;
  kind: EntryKind;
  builtin: boolean;
};

export const DEFAULT_CATEGORIES: CategoryEntry[] = [
  { id: "food", name: "Food", icon: "food", kind: "expense", builtin: true },
  { id: "transport", name: "Transport", icon: "bus", kind: "expense", builtin: true },
  { id: "petrol", name: "Petrol", icon: "gas-station", kind: "expense", builtin: true },
  { id: "shopping", name: "Shopping", icon: "shopping", kind: "expense", builtin: true },
  { id: "bills", name: "Bills", icon: "receipt-text", kind: "expense", builtin: true },
  { id: "entertainment", name: "Entertainment", icon: "movie-open", kind: "expense", builtin: true },
  { id: "health", name: "Health", icon: "heart-pulse", kind: "expense", builtin: true },
  { id: "travel", name: "Travel", icon: "airplane", kind: "expense", builtin: true },
  { id: "salary", name: "Salary", icon: "briefcase", kind: "income", builtin: true },
  { id: "other", name: "Other", icon: "dots-horizontal", kind: "expense", builtin: true },
];

/** Defaults + user customs, for pickers and lookups. */
export async function getCategories(db: SQLiteDatabase): Promise<CategoryEntry[]> {
  try {
    const customs = await getCustomCategories(db);
    return [
      ...DEFAULT_CATEGORIES,
      ...customs.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon,
        kind: c.kind,
        builtin: false,
      })),
    ];
  } catch (error) {
    toUserMessage(error);
  }
}

/** @deprecated Use DEFAULT_CATEGORIES or getCategories(db). */
export const CATEGORIES = DEFAULT_CATEGORIES;

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
export function matchCategory(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (CATEGORY_IDS.has(key)) return key;
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

function validateInput(
  input: AddExpenseInput,
  allowedIds: Set<string>
): {
  amount: number;
  category: string;
  note: string | null;
  date: string;
  kind: EntryKind;
} {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new ValidationError("Amount must be greater than 0.");
  }
  if (!input.category || !allowedIds.has(input.category)) {
    throw new ValidationError("Please choose a valid category.");
  }
  const kind: EntryKind = input.kind === "income" ? "income" : "expense";
  const note =
    input.note == null || input.note.trim() === "" ? null : input.note.trim();
  return {
    amount: input.amount,
    category: input.category,
    note,
    date: toISODate(input.date),
    kind,
  };
}

/** Built-in ids plus user customs — the valid set for saving entries. */
export async function allowedCategoryIds(
  db: SQLiteDatabase
): Promise<Set<string>> {
  const ids = new Set<string>(CATEGORY_IDS);
  try {
    const customs = await getCustomCategories(db);
    for (const c of customs) ids.add(c.id);
  } catch {
    // Pre-v4: defaults only.
  }
  return ids;
}

function toUserMessage(error: unknown): never {
  if (error instanceof ValidationError || error instanceof NotFoundError) {
    throw error;
  }
  throw new DatabaseError("Something went wrong saving your expense.");
}

/** Flush the shared DB so the readonly widget reader sees this write,
 * then nudge WidgetKit. Fire-and-forget; warns in dev instead of
 * swallowing failures silently. */
function pokeWidget(db: SQLiteDatabase): void {
  (async () => {
    try {
      await db.execAsync("PRAGMA wal_checkpoint(TRUNCATE);");
    } catch {
      // DELETE-mode DBs have nothing to checkpoint — proceed to reload.
    }
    try {
      await reloadWidgetTimelines();
    } catch (e) {
      if (typeof __DEV__ !== "undefined" && __DEV__) {
        console.warn("[widget] reloadTimelines failed", e);
      }
    }
  })();
}

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

// --- Recurring (salary / EMI autopilot) ---
// Runs on app start: posts anything due since the last run. Idempotent —
// posted_count guarantees no double-posts, and missed months catch up.

export type AddRecurringInput = {
  kind: EntryKind;
  amount: number;
  category: string;
  note?: string | null;
  dayOfMonth: number;
  startYear: number;
  startMonth: number;
  totalInstallments?: number | null;
};

function validateRecurringInput(
  input: AddRecurringInput,
  allowedIds: Set<string>
) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new ValidationError("Amount must be greater than 0.");
  }
  if (!input.category || !allowedIds.has(input.category)) {
    throw new ValidationError("Please choose a valid category.");
  }
  if (!Number.isInteger(input.dayOfMonth) || input.dayOfMonth < 1 || input.dayOfMonth > 28) {
    throw new ValidationError("Pick a day between 1 and 28.");
  }
  if (
    !Number.isInteger(input.startYear) ||
    !Number.isInteger(input.startMonth) ||
    input.startMonth < 1 ||
    input.startMonth > 12
  ) {
    throw new ValidationError("Invalid start month.");
  }
  if (
    input.totalInstallments != null &&
    (!Number.isInteger(input.totalInstallments) || input.totalInstallments < 1)
  ) {
    throw new ValidationError("Installments must be at least 1.");
  }
  return {
    kind: input.kind === "income" ? ("income" as EntryKind) : ("expense" as EntryKind),
    amount: input.amount,
    category: input.category,
    note:
      input.note == null || input.note.trim() === ""
        ? null
        : input.note.trim(),
    dayOfMonth: input.dayOfMonth,
    startYear: input.startYear,
    startMonth: input.startMonth,
    totalInstallments: input.totalInstallments ?? null,
  };
}

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
): Promise<{ total: number; byCategory: { id: string; amount: number }[] }> {  const expenses = await listExpenses(db);
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

export type AddCustomCategoryInput = {
  name: string;
  icon: string;
  kind?: EntryKind;
};

/** Icons users may pick for custom categories. */
export const CATEGORY_ICON_CHOICES = [
  "food", "bus", "gas-station", "shopping", "receipt-text", "movie-open",
  "heart-pulse", "airplane", "briefcase", "dots-horizontal",
  "coffee", "cart", "bike", "car", "train", "home", "school",
  "hospital-box", "pill", "dumbbell", "gamepad-variant", "music",
  "gift", "dog", "baby", "book-open", "wifi", "phone", "lightbulb",
];

const ICON_ALLOWLIST = new Set(CATEGORY_ICON_CHOICES);

function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  return slug || "custom";
}

export async function addCustomCategory(
  db: SQLiteDatabase,
  input: AddCustomCategoryInput
): Promise<CustomCategory> {
  const name = input.name.trim();
  if (name.length === 0 || name.length > 24) {
    throw new ValidationError("Name must be 1–24 characters.");
  }
  if (!ICON_ALLOWLIST.has(input.icon)) {
    throw new ValidationError("Pick an icon from the list.");
  }
  const kind: EntryKind = input.kind === "income" ? "income" : "expense";
  const allowed = await allowedCategoryIds(db);
  let id = slugify(name);
  if (allowed.has(id)) {
    id = `${id}-${Math.random().toString(36).slice(2, 6)}`;
  }
  const custom: CustomCategory = {
    id,
    name,
    icon: input.icon,
    kind,
    createdAt: new Date().toISOString(),
  };
  try {
    await insertCustomCategory(db, custom);
    return custom;
  } catch (error) {
    toUserMessage(error);
  }
}

export async function removeCustomCategory(
  db: SQLiteDatabase,
  id: string
): Promise<void> {
  try {
    const [customs, expenses] = await Promise.all([
      getCustomCategories(db),
      getAllExpenses(db),
    ]);
    if (!customs.some((c) => c.id === id)) {
      throw new ValidationError("Only custom categories can be deleted.");
    }
    if (expenses.some((e) => e.category === id)) {
      throw new ValidationError(
        "This category has expenses. Delete or recategorize them first."
      );
    }
    await deleteCustomCategory(db, id);
  } catch (error) {
    toUserMessage(error);
  }
}

/** Defaults + customs. Voice/deep-link resolution with custom support. */
export async function resolveCategory(
  db: SQLiteDatabase,
  raw: string | null | undefined
): Promise<string | null> {
  const builtin = matchCategory(raw);
  if (builtin) return builtin;
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  try {
    const customs = await getCustomCategories(db);
    for (const c of customs) {
      if (c.id === key || c.name.toLowerCase() === key) return c.id;
    }
  } catch {
    // ignore, fall through
  }
  return null;
}

export type MonthlyPoint = {
  year: number;
  /** 1–12 */
  month: number;
  label: string;
  spent: number;
  income: number;
};

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

// --- Group trips (Splitwise core) -------------------------------------------
// Balances are always DERIVED from expenses minus settlements, never
// stored — edits/deletes/undos can't leave anything stale. All money
// math runs in integer paise with largest-remainder splits, so totals
// reconcile to the paisa (₹100 ÷ 3 = 33.33 × 2 + 33.34, assigned in
// split order). Settlement here is tracked, never executed: no money
// moves, the record just says it did.

function generateTripId(): string {
  return generateId();
}

/** Paise per split position: base each, leftover paise to the first ones. */
function splitSharesPaise(totalPaise: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(totalPaise / n);
  const rem = totalPaise - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/**
 * Paise per member id. Custom wins only when it covers exactly the
 * split set with a matching sum — anything else falls back to equal,
 * so corrupt/legacy rows can never unbalance the books.
 */
function customSharesPaise(
  totalPaise: number,
  splitBetween: string[],
  splitCustom: Record<string, number> | null
): number[] | null {
  if (!splitCustom) return null;
  const keys = Object.keys(splitCustom);
  if (keys.length !== splitBetween.length) return null;
  if (!splitBetween.every((id) => Number.isInteger(splitCustom[id]) && splitCustom[id] >= 0)) return null;
  const sum = splitBetween.reduce((s, id) => s + splitCustom[id], 0);
  if (sum !== totalPaise) return null;
  return splitBetween.map((id) => splitCustom[id]);
}

/** Single source of truth for every share readout (balances + auto-post). */
function expenseSharesPaise(
  totalPaise: number,
  splitBetween: string[],
  splitCustom: Record<string, number> | null
): number[] {
  return (
    customSharesPaise(totalPaise, splitBetween, splitCustom) ??
    splitSharesPaise(totalPaise, splitBetween.length)
  );
}

/**
 * Percentages → exact paise (largest remainder). Always sums to
 * totalPaise, whatever the inputs.
 */
export function splitPercentToPaise(
  totalPaise: number,
  entries: { id: string; pct: number }[]
): { id: string; paise: number }[] {
  const floors = entries.map((e) => ({
    id: e.id,
    floor: Math.floor((totalPaise * e.pct) / 100),
    frac: (totalPaise * e.pct) / 100 - Math.floor((totalPaise * e.pct) / 100),
  }));
  let rem = totalPaise - floors.reduce((s, f) => s + f.floor, 0);
  const order = [...floors].sort((a, b) => b.frac - a.frac);
  const bonus = new Map<string, number>();
  for (const f of order) {
    if (rem <= 0) break;
    if (f.frac > 0) {
      bonus.set(f.id, 1);
      rem -= 1;
    }
  }
  // Pathological all-zero fractions (shouldn't happen with sane pct):
  // remainder lands on the first entries in order.
  for (const f of order) {
    if (rem <= 0) break;
    bonus.set(f.id, (bonus.get(f.id) ?? 0) + 1);
    rem -= 1;
  }
  return floors.map((f) => ({ id: f.id, paise: f.floor + (bonus.get(f.id) ?? 0) }));
}

export async function createTrip(
  db: SQLiteDatabase,
  name: string
): Promise<Trip> {
  const clean = name.trim();
  if (clean.length === 0 || clean.length > 40) {
    throw new ValidationError("Trip name must be 1–40 characters.");
  }
  const trip: Trip = { id: generateTripId(), name: clean, createdAt: new Date().toISOString(), archived: false };
  await insertTrip(db, trip);
  return trip;
}

export async function listTrips(db: SQLiteDatabase, includeArchived = false): Promise<Trip[]> {
  return getTrips(db, includeArchived);
}

export async function setTripArchived(
  db: SQLiteDatabase,
  id: string,
  archived: boolean
): Promise<void> {
  await fetchTrip(db, id);
  await setTripArchivedRow(db, id, archived);
}

export async function fetchTrip(db: SQLiteDatabase, id: string): Promise<Trip> {
  const trip = await getTripById(db, id);
  if (!trip) throw new NotFoundError("Trip not found.");
  return trip;
}

export async function removeTrip(db: SQLiteDatabase, id: string): Promise<void> {
  // Personal ledger entries posted from this trip stay: real past spending.
  await deleteTripData(db, id);
}

export async function addTripMember(
  db: SQLiteDatabase,
  tripId: string,
  name: string
): Promise<TripMember> {
  await fetchTrip(db, tripId);
  const clean = name.trim();
  if (clean.length === 0 || clean.length > 24) {
    throw new ValidationError("Member name must be 1–24 characters.");
  }
  const existing = await getTripMembers(db, tripId);
  if (existing.some((m) => m.name.toLowerCase() === clean.toLowerCase())) {
    throw new ValidationError("That name is already in this trip.");
  }
  const member: TripMember = {
    id: generateTripId(),
    tripId,
    name: clean,
    createdAt: new Date().toISOString(),
  };
  await insertTripMember(db, member);
  return member;
}

export async function listTripMembers(db: SQLiteDatabase, tripId: string): Promise<TripMember[]> {
  return getTripMembers(db, tripId);
}

/** Refuses while the member is referenced — settle or delete first. */
export async function removeTripMember(
  db: SQLiteDatabase,
  tripId: string,
  memberId: string
): Promise<void> {
  const [expenses, settlements] = await Promise.all([
    getTripExpenses(db, tripId),
    getTripSettlements(db, tripId),
  ]);
  const used =
    expenses.some((e) => e.paidBy === memberId || e.splitBetween.includes(memberId)) ||
    settlements.some((s) => s.fromMember === memberId || s.toMember === memberId);
  if (used) {
    throw new ValidationError(
      "Settle or delete their entries first — this member has trip activity."
    );
  }
  await deleteTripMember(db, memberId);
}

/** Which member is "me" on this trip (for auto-posting my share). */
export async function getTripMe(db: SQLiteDatabase, tripId: string): Promise<string | null> {
  const id = await getKv(db, `trip-me:${tripId}`);
  if (!id) return null;
  const members = await getTripMembers(db, tripId);
  return members.some((m) => m.id === id) ? id : null;
}

export async function setTripMe(
  db: SQLiteDatabase,
  tripId: string,
  memberId: string | null
): Promise<void> {
  if (memberId == null) {
    await deleteKv(db, `trip-me:${tripId}`);
    return;
  }
  const members = await getTripMembers(db, tripId);
  if (!members.some((m) => m.id === memberId)) {
    throw new ValidationError("Pick a member of this trip.");
  }
  await setKv(db, `trip-me:${tripId}`, memberId);
}

export type AddTripExpenseInput = {
  tripId: string;
  amount: number;
  category: string;
  note?: string | null;
  paidBy: string;
  /** Defaults to all current members. */
  splitBetween?: string[];
  /** Member-id → paise. Every split member, each > 0, summing to total. NULL = equal. */
  splitCustomPaise?: Record<string, number> | null;
  date?: Date | string;
  /** When true (and myMemberId is in the split), post my share personally. */
  postPersonal?: boolean;
  myMemberId?: string | null;
};

export async function addTripExpense(
  db: SQLiteDatabase,
  input: AddTripExpenseInput
): Promise<TripExpense> {
  const trip = await fetchTrip(db, input.tripId);
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new ValidationError("Amount must be greater than 0.");
  }
  if (!input.category || !(await allowedCategoryIds(db)).has(input.category)) {
    throw new ValidationError("Please choose a valid category.");
  }
  const members = await getTripMembers(db, input.tripId);
  const ids = new Set(members.map((m) => m.id));
  if (!ids.has(input.paidBy)) {
    throw new ValidationError("Payer must be a trip member.");
  }
  const split =
    input.splitBetween && input.splitBetween.length > 0
      ? [...new Set(input.splitBetween)]
      : members.map((m) => m.id);
  if (split.length === 0 || !split.every((id) => ids.has(id))) {
    throw new ValidationError("Split must cover trip members only.");
  }
  const totalPaise = Math.round(Number(input.amount) * 100);
  let splitCustom: Record<string, number> | null = null;
  if (input.splitCustomPaise) {
    const keys = Object.keys(input.splitCustomPaise);
    const sameSet =
      keys.length === split.length && split.every((id) => id in input.splitCustomPaise!);
    const vals = split.map((id) => input.splitCustomPaise![id]);
    const okInts = vals.every((v) => Number.isInteger(v) && v > 0);
    const sum = vals.reduce((s, v) => s + v, 0);
    if (!sameSet || !okInts || sum !== totalPaise) {
      throw new ValidationError("Custom shares must cover the split and total the amount.");
    }
    splitCustom = Object.fromEntries(split.map((id) => [id, input.splitCustomPaise![id]]));
  }
  const now = new Date().toISOString();
  const expense: TripExpense = {
    id: generateTripId(),
    tripId: trip.id,
    amount: Math.round(input.amount * 100) / 100,
    category: input.category,
    note: input.note?.trim() ? input.note.trim() : null,
    paidBy: input.paidBy,
    splitBetween: split,
    splitCustom,
    date: toISODate(input.date),
    createdAt: now,
    personalExpenseId: null,
  };
  await insertTripExpense(db, expense);

  // Auto-post my share to the personal ledger (same share rule as
  // balances, so the two can never disagree by a paisa).
  if (input.postPersonal && input.myMemberId && split.includes(input.myMemberId)) {
    const shares = expenseSharesPaise(totalPaise, split, splitCustom);
    const share = shares[split.indexOf(input.myMemberId)] / 100;
    if (share > 0) {
      const personal = await addExpense(db, {
        amount: share,
        category: expense.category,
        note: expense.note
          ? `${expense.note} · ${trip.name} split`
          : `${trip.name} split`,
        date: expense.date,
        kind: "expense",
      });
      expense.personalExpenseId = personal.id;
      await db.runAsync("UPDATE trip_expenses SET personal_expense_id = ? WHERE id = ?", personal.id, expense.id);
    }
  }
  return expense;
}

export async function removeTripExpense(db: SQLiteDatabase, id: string): Promise<void> {
  const existing = await getTripExpenseById(db, id);
  if (!existing) throw new NotFoundError("Trip expense not found.");
  if (existing.personalExpenseId) {
    try {
      await deleteExpense(db, existing.personalExpenseId);
    } catch {
      // Already deleted manually: continue removing the trip row.
    }
  }
  await deleteTripExpense(db, id);
}

export type MemberBalance = {
  memberId: string;
  name: string;
  /** Paise paid across trip expenses. */
  paid: number;
  /** Paise owed as shares. */
  share: number;
  /** paid − share − settlementsOut + settlementsIn, in paise. >0 = trip owes them. */
  net: number;
};

export type DebtTransfer = {
  fromMemberId: string;
  fromName: string;
  toMemberId: string;
  toName: string;
  /** Rupees, exact 2dp. */
  amount: number;
};

export type TripBalances = {
  balances: MemberBalance[];
  /** Minimal transfer set that zeroes everyone out. */
  transfers: DebtTransfer[];
  /** Total trip spend, rupees. */
  spent: number;
};

export async function getTripBalances(db: SQLiteDatabase, tripId: string): Promise<TripBalances> {
  const [members, expenses, settlements] = await Promise.all([
    getTripMembers(db, tripId),
    getTripExpenses(db, tripId),
    getTripSettlements(db, tripId),
  ]);
  const byId = new Map(members.map((m) => [m.id, m.name]));
  const paid = new Map<string, number>();
  const share = new Map<string, number>();
  const bump = (map: Map<string, number>, id: string, v: number) =>
    map.set(id, (map.get(id) ?? 0) + v);
  let spentPaise = 0;

  for (const e of expenses) {
    const totalPaise = Math.round(e.amount * 100);
    spentPaise += totalPaise;
    if (byId.has(e.paidBy)) bump(paid, e.paidBy, totalPaise);
    const parts = e.splitBetween.filter((id) => byId.has(id));
    if (parts.length === 0) continue;
    const shares = expenseSharesPaise(totalPaise, e.splitBetween, e.splitCustom);
    e.splitBetween.forEach((id, i) => {
      if (byId.has(id)) bump(share, id, shares[i]);
    });
  }
  for (const s of settlements) {
    if (byId.has(s.fromMember) && byId.has(s.toMember)) {
      const p = Math.round(s.amount * 100);
      bump(paid, s.fromMember, p);
      bump(share, s.toMember, p);
    }
  }

  const balances: MemberBalance[] = members.map((m) => {
    const p = paid.get(m.id) ?? 0;
    const s = share.get(m.id) ?? 0;
    return { memberId: m.id, name: m.name, paid: p, share: s, net: p - s };
  });

  // Greedy min-cash-flow on integer paise: biggest debtor ↔ biggest
  // creditor until everyone is zero. Exact, no dust.
  const debtors = balances
    .filter((b) => b.net < 0)
    .map((b) => ({ ...b, owe: -b.net }))
    .sort((a, b) => b.owe - a.owe);
  const creditors = balances
    .filter((b) => b.net > 0)
    .map((b) => ({ ...b, get: b.net }))
    .sort((a, b) => b.get - a.get);
  const transfers: DebtTransfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const move = Math.min(d.owe, c.get);
    if (move > 0) {
      transfers.push({
        fromMemberId: d.memberId,
        fromName: d.name,
        toMemberId: c.memberId,
        toName: c.name,
        amount: move / 100,
      });
    }
    d.owe -= move;
    c.get -= move;
    if (d.owe === 0) i += 1;
    if (c.get === 0) j += 1;
  }

  return { balances, transfers, spent: spentPaise / 100 };
}

export async function settleTransfer(
  db: SQLiteDatabase,
  input: { tripId: string; from: string; to: string; amount: number }
): Promise<TripSettlement> {
  await fetchTrip(db, input.tripId);
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new ValidationError("Amount must be greater than 0.");
  }
  if (input.from === input.to) {
    throw new ValidationError("Pick two different members.");
  }
  const members = await getTripMembers(db, input.tripId);
  const ids = new Set(members.map((m) => m.id));
  if (!ids.has(input.from) || !ids.has(input.to)) {
    throw new ValidationError("Both sides must be trip members.");
  }
  const now = new Date().toISOString();
  const settlement: TripSettlement = {
    id: generateTripId(),
    tripId: input.tripId,
    fromMember: input.from,
    toMember: input.to,
    amount: Math.round(input.amount * 100) / 100,
    date: now,
    createdAt: now,
  };
  await insertTripSettlement(db, settlement);
  return settlement;
}

export async function undoSettlement(db: SQLiteDatabase, id: string): Promise<void> {
  await deleteTripSettlement(db, id);
}

// --- Personal loans ----------------------------------------------------------
// kind 'lent' = they owe me, 'borrowed' = I owe them. Outstanding always
// excludes fully-repaid loans (balance <= half-paisa dust).

export type AddLoanInput = {
  person: string;
  contact?: string | null;
  kind: LoanKind;
  amount: number;
  note?: string | null;
  date?: Date | string;
};

export async function addLoan(db: SQLiteDatabase, input: AddLoanInput): Promise<Loan> {
  const person = input.person.trim();
  if (person.length === 0 || person.length > 24) {
    throw new ValidationError("Person name must be 1–24 characters.");
  }
  const contact = (input.contact ?? "").trim();
  if (!isValidPhone(contact)) {
    throw new ValidationError("Add their phone number — nudges go by SMS.");
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new ValidationError("Amount must be greater than 0.");
  }
  if (input.kind !== "lent" && input.kind !== "borrowed") {
    throw new ValidationError("Pick lent or borrowed.");
  }
  const now = new Date().toISOString();
  const loan: Loan = {
    id: generateId(),
    person,
    contact,
    kind: input.kind,
    amount: Math.round(input.amount * 100) / 100,
    note: input.note?.trim() ? input.note.trim() : null,
    date: toISODate(input.date),
    createdAt: now,
  };
  await insertLoan(db, loan);
  return loan;
}

/** Digits (and an optional leading +), 7–15 long. Displayed as typed. */
export function isValidPhone(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const digits = raw.replace(/[^\d]/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

/** Dial/SMS-safe form: leading + kept, separators stripped. */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  return plus + trimmed.replace(/[^\d]/g, "");
}

export async function listLoans(db: SQLiteDatabase): Promise<Loan[]> {
  return getLoans(db);
}

/** Outstanding balance in paise (> 0 means still open). */
export async function loanBalancePaise(db: SQLiteDatabase, loanId: string): Promise<number> {
  const loan = await getLoanById(db, loanId);
  if (!loan) throw new NotFoundError("Entry not found.");
  const payments = await getLoanPayments(db, loanId);
  return Math.round(loan.amount * 100) - payments.reduce((s, p) => s + Math.round(p.amount * 100), 0);
}

export async function listLoanPayments(db: SQLiteDatabase, loanId: string): Promise<LoanPayment[]> {
  return getLoanPayments(db, loanId);
}

/** Records a partial (or full) repayment. Rejects over-payment. */
export async function repayLoan(
  db: SQLiteDatabase,
  loanId: string,
  amount: number
): Promise<LoanPayment> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ValidationError("Amount must be greater than 0.");
  }
  const due = await loanBalancePaise(db, loanId);
  const paise = Math.round(amount * 100);
  if (paise > due) {
    throw new ValidationError(
      `Only ${formatOwed(due)} is still outstanding.`
    );
  }
  const now = new Date().toISOString();
  const payment: LoanPayment = {
    id: generateId(),
    loanId,
    amount: paise / 100,
    date: now,
    createdAt: now,
  };
  await insertLoanPayment(db, payment);
  return payment;
}

function formatOwed(paise: number): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    }).format(paise / 100);
  } catch {
    return `Rs.${paise / 100}`;
  }
}

export async function removeLoan(db: SQLiteDatabase, id: string): Promise<void> {
  await deleteLoan(db, id);
}

export async function undoLoanPayment(db: SQLiteDatabase, id: string): Promise<void> {
  await deleteLoanPayment(db, id);
}

export type Receivable = {
  /** Stable key for notification identity: loan:<id> / trip:<trip>:<member>. */
  key: string;
  kind: "loan" | "trip";
  tripId?: string;
  loanId?: string;
  person: string;
  /** Phone number when known (loans require it). */
  contact?: string | null;
  /** Rupees still owed to me. */
  amount: number;
  context: string;
};

/** Every open debt pointed at me: lent loans + trip transfers to my member. */
export async function getMyReceivables(db: SQLiteDatabase): Promise<Receivable[]> {
  const out: Receivable[] = [];
  try {
    const loans = await getLoans(db);
    for (const loan of loans) {
      if (loan.kind !== "lent") continue;
      const payments = await getLoanPayments(db, loan.id);
      const due =
        Math.round(loan.amount * 100) -
        payments.reduce((s, p) => s + Math.round(p.amount * 100), 0);
      if (due > 0) {
        out.push({
          key: `loan:${loan.id}`,
          kind: "loan",
          loanId: loan.id,
          person: loan.person,
          contact: loan.contact,
          amount: due / 100,
          context: loan.note ?? "Personal loan",
        });
      }
    }
  } catch {
    // pre-v10 database
  }
  try {
    const trips = await getTrips(db);
    for (const trip of trips) {
      if (trip.archived) continue;
      const me = await getTripMe(db, trip.id);
      if (!me) continue;
      const bal = await getTripBalances(db, trip.id);
      for (const t of bal.transfers) {
        if (t.toMemberId === me) {
          out.push({
            key: `trip:${trip.id}:${t.fromMemberId}`,
            kind: "trip",
            tripId: trip.id,
            person: t.fromName,
            amount: t.amount,
            context: trip.name,
          });
        }
      }
    }
  } catch {
    // ignore
  }
  return out.sort((a, b) => b.amount - a.amount);
}
