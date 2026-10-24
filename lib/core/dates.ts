import { ValidationError } from "./errors";

export function toISODate(input?: Date | string): string {
  if (!input) return new Date().toISOString();
  if (input instanceof Date) {
    if (isNaN(input.getTime())) throw new ValidationError("Invalid date.");
    return input.toISOString();
  }
  const d = new Date(input);
  if (isNaN(d.getTime())) throw new ValidationError("Invalid date.");
  return d.toISOString();
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isThisMonth(dateISO: string, now: Date): boolean {
  const d = new Date(dateISO);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}
