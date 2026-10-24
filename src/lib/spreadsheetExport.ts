/** Shared export boundary. Never sanitize stored values or evaluate formulas. */
export type SpreadsheetCell = string | number | bigint | null | undefined;

// Inspect compatibility forms and leading invisible characters without rewriting
// the original text (full-width operators, BOM, bidi/zero-width marks included).
function dangerousText(value: string): boolean {
  const normalized = value.normalize("NFKC");
  if (/^[\s\p{Cc}\p{Cf}]*[=+\-@\u2212\uFE63]/u.test(normalized)) return true;
  return /^[\s\p{Cf}]*[\p{Cc}\u2028\u2029]/u.test(normalized);
}

function quoteCsv(value: string): string {
  return /[",;\t\r\n\u2028\u2029]/u.test(value)
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}

export function spreadsheetCell(value: SpreadsheetCell): string {
  if (value == null) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Export requires a finite numeric value");
    return String(value);
  }
  if (typeof value === "bigint") return String(value);
  // Apostrophe is literal text, not a formula wrapper such as ="...".
  return quoteCsv(dangerousText(value) ? `'${value}` : value);
}

/** Trusted decimal financial column: preserve digits/scale, never use Number. */
export function spreadsheetDecimal(value: string): string {
  return /^[+-]?\d+(?:\.\d+)?$/.test(value) ? value : spreadsheetCell(value);
}

export function spreadsheetRow(cells: readonly SpreadsheetCell[]): string {
  return cells.map(spreadsheetCell).join(",");
}