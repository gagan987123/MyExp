import type { SQLiteDatabase } from "expo-sqlite";
import { toISODate } from "../core/dates";
import { NotFoundError, ValidationError } from "../core/errors";
import { generateId } from "../core/ids";
import {
  deleteLoan,
  deleteLoanPayment,
  getLoanById,
  getLoanPayments,
  getLoans,
  insertLoan,
  insertLoanPayment,
} from "../repositories/loans";
import type { AddLoanInput, Loan, LoanPayment } from "../types";

// --- Personal loans ----------------------------------------------------------
// kind 'lent' = they owe me, 'borrowed' = I owe them. Outstanding always
// excludes fully-repaid loans (balance <= half-paisa dust).

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
