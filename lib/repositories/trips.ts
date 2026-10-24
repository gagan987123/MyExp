import type { SQLiteDatabase } from "expo-sqlite";
import type { Trip, TripExpense, TripMember, TripSettlement } from "../types";
import {
  mapTripExpenseRow,
  type TripExpenseRow,
  type TripMemberRow,
  type TripRow,
  type TripSettlementRow,
} from "./rows";

export async function insertTrip(db: SQLiteDatabase, trip: Trip): Promise<void> {
  await db.runAsync("INSERT INTO trips (id, name, created_at) VALUES (?, ?, ?)", trip.id, trip.name, trip.createdAt);
}

export async function getTrips(db: SQLiteDatabase, includeArchived = false): Promise<Trip[]> {
  try {
    const rows = await db.getAllAsync<TripRow>(
      includeArchived
        ? "SELECT id, name, created_at, archived FROM trips ORDER BY created_at DESC"
        : "SELECT id, name, created_at, archived FROM trips WHERE COALESCE(archived, 0) = 0 ORDER BY created_at DESC"
    );
    return rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.created_at, archived: (r.archived ?? 0) === 1 }));
  } catch {
    return [];
  }
}

export async function getTripById(db: SQLiteDatabase, id: string): Promise<Trip | null> {
  try {
    const row = await db.getFirstAsync<TripRow>("SELECT id, name, created_at, archived FROM trips WHERE id = ?", id);
    return row ? { id: row.id, name: row.name, createdAt: row.created_at, archived: (row.archived ?? 0) === 1 } : null;
  } catch {
    return null;
  }
}

export async function setTripArchived(db: SQLiteDatabase, id: string, archived: boolean): Promise<void> {
  await db.runAsync("UPDATE trips SET archived = ? WHERE id = ?", archived ? 1 : 0, id);
}

/** Deletes the trip and everything in it. Personal ledger entries stay (real past spending). */
export async function deleteTripData(db: SQLiteDatabase, tripId: string): Promise<void> {
  await db.runAsync("DELETE FROM trip_settlements WHERE trip_id = ?", tripId);
  await db.runAsync("DELETE FROM trip_expenses WHERE trip_id = ?", tripId);
  await db.runAsync("DELETE FROM trip_members WHERE trip_id = ?", tripId);
  await db.runAsync("DELETE FROM trips WHERE id = ?", tripId);
}

export async function insertTripMember(db: SQLiteDatabase, m: TripMember): Promise<void> {
  await db.runAsync(
    "INSERT INTO trip_members (id, trip_id, name, created_at) VALUES (?, ?, ?, ?)",
    m.id, m.tripId, m.name, m.createdAt
  );
}

export async function getTripMembers(db: SQLiteDatabase, tripId: string): Promise<TripMember[]> {
  try {
    const rows = await db.getAllAsync<TripMemberRow>(
      "SELECT id, trip_id, name, created_at FROM trip_members WHERE trip_id = ? ORDER BY created_at",
      tripId
    );
    return rows.map((r) => ({ id: r.id, tripId: r.trip_id, name: r.name, createdAt: r.created_at }));
  } catch {
    return [];
  }
}

export async function deleteTripMember(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync("DELETE FROM trip_members WHERE id = ?", id);
}

export async function insertTripExpense(db: SQLiteDatabase, e: TripExpense): Promise<void> {
  await db.runAsync(
    "INSERT INTO trip_expenses (id, trip_id, amount, category, note, paid_by, split_between, split_custom, date, created_at, personal_expense_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    e.id, e.tripId, e.amount, e.category, e.note, e.paidBy,
    JSON.stringify(e.splitBetween), e.splitCustom ? JSON.stringify(e.splitCustom) : null,
    e.date, e.createdAt, e.personalExpenseId
  );
}

export async function getTripExpenses(db: SQLiteDatabase, tripId: string): Promise<TripExpense[]> {
  try {
    const rows = await db.getAllAsync<TripExpenseRow>(
      "SELECT * FROM trip_expenses WHERE trip_id = ? ORDER BY date DESC, created_at DESC",
      tripId
    );
    return rows.map(mapTripExpenseRow);
  } catch {
    return [];
  }
}

export async function getTripExpenseById(db: SQLiteDatabase, id: string): Promise<TripExpense | null> {
  try {
    const row = await db.getFirstAsync<TripExpenseRow>("SELECT * FROM trip_expenses WHERE id = ?", id);
    return row ? mapTripExpenseRow(row) : null;
  } catch {
    return null;
  }
}

export async function setTripExpensePersonalId(
  db: SQLiteDatabase,
  id: string,
  personalExpenseId: string
): Promise<void> {
  await db.runAsync(
    "UPDATE trip_expenses SET personal_expense_id = ? WHERE id = ?",
    personalExpenseId,
    id
  );
}

export async function deleteTripExpense(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync("DELETE FROM trip_expenses WHERE id = ?", id);
}

export async function insertTripSettlement(db: SQLiteDatabase, s: TripSettlement): Promise<void> {
  await db.runAsync(
    "INSERT INTO trip_settlements (id, trip_id, from_member, to_member, amount, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    s.id, s.tripId, s.fromMember, s.toMember, s.amount, s.date, s.createdAt
  );
}

export async function getTripSettlements(db: SQLiteDatabase, tripId: string): Promise<TripSettlement[]> {
  try {
    const rows = await db.getAllAsync<TripSettlementRow>(
      "SELECT * FROM trip_settlements WHERE trip_id = ? ORDER BY date DESC, created_at DESC",
      tripId
    );
    return rows.map((r) => ({
      id: r.id, tripId: r.trip_id, fromMember: r.from_member, toMember: r.to_member,
      amount: r.amount, date: r.date, createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

export async function deleteTripSettlement(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync("DELETE FROM trip_settlements WHERE id = ?", id);
}
