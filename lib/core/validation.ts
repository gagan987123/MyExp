import type { AddExpenseInput, AddRecurringInput, EntryKind } from "../types";
import { toISODate } from "./dates";
import { ValidationError } from "./errors";

export function validateInput(
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

export function validateRecurringInput(
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
