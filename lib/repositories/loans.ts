import type { SQLiteDatabase } from "expo-sqlite";
import type { Loan, LoanPayment } from "../types";
import { mapLoanRow, type LoanPaymentRow, type LoanRow } from "./rows";

export async function insertLoan(db: SQLiteDatabase, loan: Loan): Promise<void> {
  await db.runAsync(
    "INSERT INTO loans (id, person, contact, kind, amount, note, date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    loan.id, loan.person, loan.contact, loan.kind, loan.amount, loan.note, loan.date, loan.createdAt
  );
}

export async function getLoans(db: SQLiteDatabase): Promise<Loan[]> {
  try {
    const rows = await db.getAllAsync<LoanRow>(
      "SELECT id, person, contact, kind, amount, note, date, created_at FROM loans ORDER BY date DESC, created_at DESC"
    );
    return rows.map(mapLoanRow);
  } catch {
    return [];
  }
}

export async function getLoanById(db: SQLiteDatabase, id: string): Promise<Loan | null> {
  try {
    const row = await db.getFirstAsync<LoanRow>(
      "SELECT id, person, contact, kind, amount, note, date, created_at FROM loans WHERE id = ?",
      id
    );
    return row ? mapLoanRow(row) : null;
  } catch {
    return null;
  }
}

export async function deleteLoan(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync("DELETE FROM loan_payments WHERE loan_id = ?", id);
  await db.runAsync("DELETE FROM loans WHERE id = ?", id);
}

export async function insertLoanPayment(db: SQLiteDatabase, p: LoanPayment): Promise<void> {
  await db.runAsync(
    "INSERT INTO loan_payments (id, loan_id, amount, date, created_at) VALUES (?, ?, ?, ?, ?)",
    p.id, p.loanId, p.amount, p.date, p.createdAt
  );
}

export async function getLoanPayments(db: SQLiteDatabase, loanId: string): Promise<LoanPayment[]> {
  try {
    const rows = await db.getAllAsync<LoanPaymentRow>(
      "SELECT id, loan_id, amount, date, created_at FROM loan_payments WHERE loan_id = ? ORDER BY date DESC, created_at DESC",
      loanId
    );
    return rows.map((r) => ({
      id: r.id, loanId: r.loan_id, amount: r.amount, date: r.date, createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

export async function deleteLoanPayment(db: SQLiteDatabase, id: string): Promise<void> {
  await db.runAsync("DELETE FROM loan_payments WHERE id = ?", id);
}
