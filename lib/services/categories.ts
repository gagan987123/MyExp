import type { SQLiteDatabase } from "expo-sqlite";
import {
  deleteCustomCategory,
  getCustomCategories,
  insertCustomCategory,
} from "../repositories/categories";
import { getAllExpenses } from "../repositories/expenses";
import { toUserMessage, ValidationError } from "../core/errors";
import type {
  AddCustomCategoryInput,
  CategoryEntry,
  CategoryId,
  CustomCategory,
  EntryKind,
} from "../types";

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
