import type { Expense } from "./service";

export type DateRange = { from: Date; to: Date };

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

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

export function fileNameForRange(range: DateRange): string {
  return `MyExp-${isoDay(range.from)}-to-${isoDay(range.to)}.csv`;
}

/**
 * Pretty CSV: BOM (Excel UTF-8), sortable ISO dates, quoted notes,
 * numeric amounts + currency column, summary footer.
 */
export function buildCsv(expenses: Expense[], range: DateRange): string {
  const rows = filterByRange(expenses, range);
  const lines = [
    "Date,Type,Category,Note,Amount,Currency",
    ...rows.map((e) =>
      [
        csvCell(isoDay(new Date(e.date))),
        csvCell(e.kind === "income" ? "Income" : "Expense"),
        csvCell(e.category),
        csvCell(e.note ?? ""),
        csvCell(e.amount),
        csvCell("INR"),
      ].join(",")
    ),
  ];
  const spent = rows
    .filter((e) => e.kind !== "income")
    .reduce((s, e) => s + e.amount, 0);
  const earned = rows
    .filter((e) => e.kind === "income")
    .reduce((s, e) => s + e.amount, 0);
  lines.push("");
  lines.push(`Report range,${csvCell(rangeLabel(range))},,,,`);
  lines.push(`Total spent,,${spent},INR,,`);
  lines.push(`Total earned,,${earned},INR,,`);
  lines.push(`Balance,,${earned - spent},INR,,`);
  return "\uFEFF" + lines.join("\n") + "\n";
}
