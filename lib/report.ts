import type { Expense } from "./service";
import { filterByRange, rangeLabel, type DateRange } from "./csv";

const INK = "#0B0E17";
const ACCENT = "#ea7a53";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";
const CARD = "#f8f6ef";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inr(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function prettyDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function buildReportHtml(
  expenses: Expense[],
  range: DateRange,
  logoDataUri: string | null,
  categoryNames: (id: string) => string
): string {
  const rows = filterByRange(expenses, range);
  const spent = rows
    .filter((e) => e.kind !== "income")
    .reduce((s, e) => s + e.amount, 0);
  const earned = rows
    .filter((e) => e.kind === "income")
    .reduce((s, e) => s + e.amount, 0);

  const byCat = new Map<string, number>();
  for (const e of rows) {
    if (e.kind === "income") continue;
    byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
  }
  const cats = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0]?.[1] ?? 1;

  const logo = logoDataUri
    ? `<img src="${logoDataUri}" width="56" height="56" style="border-radius:14px;" />`
    : `<div style="width:56px;height:56px;border-radius:14px;background:${ACCENT};color:#fff;font-size:30px;font-weight:800;display:flex;align-items:center;justify-content:center;">M</div>`;

  return `<!doctype html><html><head><meta charset="utf-8" />
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: ${INK}; margin: 0; padding: 32px; }
  .hero { background: ${ACCENT}; border-radius: 20px; padding: 24px; color: #fff; }
  .hero h1 { margin: 0; font-size: 34px; }
  .hero p { margin: 4px 0 0; opacity: .85; font-size: 14px; }
  .stats { display: flex; gap: 12px; margin: 16px 0; }
  .stat { flex: 1; background: ${CARD}; border-radius: 14px; padding: 14px; }
  .stat .k { font-size: 12px; color: ${MUTED}; text-transform: uppercase; letter-spacing: 1px; }
  .stat .v { font-size: 22px; font-weight: 800; margin-top: 4px; }
  h2 { font-size: 18px; margin: 20px 0 10px; }
  .bar-row { display: flex; align-items: center; gap: 10px; margin: 8px 0; font-size: 13px; }
  .bar-row .name { width: 110px; }
  .bar-track { flex: 1; background: ${LINE}; border-radius: 6px; height: 10px; }
  .bar-fill { background: ${ACCENT}; border-radius: 6px; height: 10px; }
  .bar-row .amt { width: 80px; text-align: right; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 6px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: ${MUTED}; padding: 8px; border-bottom: 2px solid ${INK}; }
  td { padding: 8px; border-bottom: 1px solid ${LINE}; }
  tr:nth-child(even) td { background: #faf9f5; }
  td.num, th.num { text-align: right; }
  .in { color: #16a34a; font-weight: 700; }
  .out { color: ${INK}; }
  .foot { margin-top: 18px; font-size: 12px; color: ${MUTED}; text-align: center; }
</style></head><body>
  <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;">
    ${logo}
    <div>
      <div style="font-size:24px;font-weight:800;">MyExp</div>
      <div style="font-size:13px;color:${MUTED};">Expense report · ${esc(rangeLabel(range))}</div>
    </div>
  </div>
  <div class="hero">
    <p>SPENT IN RANGE</p>
    <h1>${inr(spent)}</h1>
    <p>Earned ${inr(earned)} · Balance ${inr(earned - spent)} · ${rows.length} entries</p>
  </div>
  <h2>Spending by category</h2>
  ${
    cats.length === 0
      ? `<p style="color:${MUTED};">No spending in this range.</p>`
      : cats
          .map(
            ([id, amt]) => `
    <div class="bar-row">
      <span class="name">${esc(categoryNames(id))}</span>
      <span class="bar-track"><span class="bar-fill" style="display:block;width:${Math.max(Math.round((amt / maxCat) * 100), 4)}%;"></span></span>
      <span class="amt">${inr(amt)}</span>
    </div>`
          )
          .join("")
  }
  <h2>All entries</h2>
  <table>
    <tr><th>Date</th><th>Type</th><th>Category</th><th>Note</th><th class="num">Amount</th></tr>
    ${rows
      .map(
        (e) => `
    <tr>
      <td>${isoDay(new Date(e.date))} <span style="color:${MUTED};">${esc(prettyDay(e.date))}</span></td>
      <td class="${e.kind === "income" ? "in" : "out"}">${e.kind === "income" ? "Income" : "Expense"}</td>
      <td>${esc(categoryNames(e.category))}</td>
      <td>${esc(e.note ?? "—")}</td>
      <td class="num">${inr(e.amount)}</td>
    </tr>`
      )
      .join("")}
  </table>
  <div class="foot">Generated by MyExp · on-device data · ${esc(new Date().toLocaleString("en-IN"))}</div>
</body></html>`;
}
