// Centralized money formatting so every token price/quote renders consistently
// (thousands separators + adaptive decimals) across Swap, Bridge and Wallet UI.
//
// Values are always computed in USD; the user's display currency + locale
// preference (see src/lib/prefs.ts) is applied at render time via an
// approximate FX rate.

let displayCurrency = "USD";
let displayRate = 1;
let displayLocale = "en-US";

/** Set the display currency and its USD→currency rate (called by prefs). */
export function setDisplayCurrency(code: string, rate: number) {
  displayCurrency = code || "USD";
  displayRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
}

/** Set the locale used for number/date grouping (called by prefs). */
export function setDisplayLocale(locale: string) {
  displayLocale = locale || "en-US";
}

export function getDisplayCurrency() {
  return { code: displayCurrency, rate: displayRate, locale: displayLocale };
}


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

/**
 * Truncate (never round) a decimal amount string/number to 4 decimal places.
 * e.g. "0.04717811" -> "0.0471", "12.9" -> "12.9000"
 * Operates on the string form so large/small values keep full precision.
 */
export function formatBalance4(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "0.0000";
  let s = typeof value === "number" ? (Number.isFinite(value) ? value.toFixed(18) : "0") : String(value).trim();
  if (!/^-?\d*\.?\d*$/.test(s) || s === "" || s === "." || s === "-") return "0.0000";
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  const [intRaw, fracRaw = ""] = s.split(".");
  const int = intRaw === "" ? "0" : intRaw;
  const frac = (fracRaw + "0000").slice(0, 4);
  return `${neg ? "-" : ""}${int}.${frac}`;
}
