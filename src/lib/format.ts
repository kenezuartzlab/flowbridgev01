// Centralized USD formatting so every token price/quote renders consistently
// (thousands separators + adaptive decimals) across Swap, Bridge, and Limit UI.

/**
 * Format a USD amount with locale thousands separators and adaptive decimals.
 * - < $0.0001 → 6 sig figs (avoids "$0.00" for micro-values)
 * - < $1      → 4 decimals
 * - < $1,000  → 2 decimals
 * - ≥ $1,000  → 2 decimals with grouping
 */
export function formatUsd(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  const n = Number(v);
  if (n === 0) return "$0.00";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";

  if (abs < 0.0001) {
    // Use significant digits for very small amounts
    return `${sign}$${abs.toPrecision(4)}`;
  }
  let min = 2;
  let max = 2;
  if (abs < 1) { min = 4; max = 4; }
  else if (abs < 100) { min = 2; max = 4; }

  return `${sign}${abs.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  })}`;
}
