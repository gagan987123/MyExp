import type { Expense } from "./service";

export type DateRange = { from: Date; to: Date };

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function inRange(dateISO: string, range: DateRange): boolean {
  const t = new Date(dateISO).getTime();
  const from = new Date(range.from);
  from.setHours(0, 0, 0, 0);
  const to = new Date(range.to);
  to.setHours(23, 59, 59, 999);
  return t >= from.getTime() && t <= to.getTime();
}

export function filterByRange(
  expenses: Expense[],
  range: DateRange
): Expense[] {
  return expenses
    .filter((e) => inRange(e.date, range))
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));
}

export function rangeLabel(range: DateRange): string {
  const opts = { day: "numeric", month: "short", year: "numeric" } as const;
  return `${range.from.toLocaleDateString("en-IN", opts)} – ${range.to.toLocaleDateString("en-IN", opts)}`;
}
