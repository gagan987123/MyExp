import type { SQLiteDatabase } from "expo-sqlite";
import { toISODate } from "../core/dates";
import { NotFoundError, ValidationError } from "../core/errors";
import { generateId } from "../core/ids";
import { deleteExpense } from "../repositories/expenses";
import { deleteKv, getKv, setKv } from "../repositories/kv";
import {
  deleteTripData,
  deleteTripExpense,
  deleteTripMember,
  deleteTripSettlement,
  getTripById,
  getTripExpenseById,
  getTripExpenses,
  getTripMembers,
  getTrips,
  getTripSettlements,
  insertTrip,
  insertTripExpense,
  insertTripMember,
  insertTripSettlement,
  setTripArchived as setTripArchivedRow,
  setTripExpensePersonalId,
} from "../repositories/trips";
import type {
  AddTripExpenseInput,
  DebtTransfer,
  MemberBalance,
  Trip,
  TripBalances,
  TripExpense,
  TripMember,
  TripSettlement,
} from "../types";
import { allowedCategoryIds } from "./categories";
import { addExpense } from "./expenses";
import { expenseSharesPaise } from "./splits";

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
      await setTripExpensePersonalId(db, personal.id, expense.id);
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
