/** Paise per split position: base each, leftover paise to the first ones. */
export function splitSharesPaise(totalPaise: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(totalPaise / n);
  const rem = totalPaise - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/**
 * Paise per member id. Custom wins only when it covers exactly the
 * split set with a matching sum — anything else falls back to equal,
 * so corrupt/legacy rows can never unbalance the books.
 */
export function customSharesPaise(
  totalPaise: number,
  splitBetween: string[],
  splitCustom: Record<string, number> | null
): number[] | null {
  if (!splitCustom) return null;
  const keys = Object.keys(splitCustom);
  if (keys.length !== splitBetween.length) return null;
  if (!splitBetween.every((id) => Number.isInteger(splitCustom[id]) && splitCustom[id] >= 0)) return null;
  const sum = splitBetween.reduce((s, id) => s + splitCustom[id], 0);
  if (sum !== totalPaise) return null;
  return splitBetween.map((id) => splitCustom[id]);
}

/** Single source of truth for every share readout (balances + auto-post). */
export function expenseSharesPaise(
  totalPaise: number,
  splitBetween: string[],
  splitCustom: Record<string, number> | null
): number[] {
  return (
    customSharesPaise(totalPaise, splitBetween, splitCustom) ??
    splitSharesPaise(totalPaise, splitBetween.length)
  );
}

/**
 * Percentages → exact paise (largest remainder). Always sums to
 * totalPaise, whatever the inputs.
 */
export function splitPercentToPaise(
  totalPaise: number,
  entries: { id: string; pct: number }[]
): { id: string; paise: number }[] {
  const floors = entries.map((e) => ({
    id: e.id,
    floor: Math.floor((totalPaise * e.pct) / 100),
    frac: (totalPaise * e.pct) / 100 - Math.floor((totalPaise * e.pct) / 100),
  }));
  let rem = totalPaise - floors.reduce((s, f) => s + f.floor, 0);
  const order = [...floors].sort((a, b) => b.frac - a.frac);
  const bonus = new Map<string, number>();
  for (const f of order) {
    if (rem <= 0) break;
    if (f.frac > 0) {
      bonus.set(f.id, 1);
      rem -= 1;
    }
  }
  // Pathological all-zero fractions (shouldn't happen with sane pct):
  // remainder lands on the first entries in order.
  for (const f of order) {
    if (rem <= 0) break;
    bonus.set(f.id, (bonus.get(f.id) ?? 0) + 1);
    rem -= 1;
  }
  return floors.map((f) => ({ id: f.id, paise: f.floor + (bonus.get(f.id) ?? 0) }));
}
