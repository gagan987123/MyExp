import type { SQLiteDatabase } from "expo-sqlite";
import { getLoanPayments, getLoans } from "../repositories/loans";
import { getTrips } from "../repositories/trips";
import type { Receivable } from "../types";
import { getTripBalances, getTripMe } from "./trips";

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
