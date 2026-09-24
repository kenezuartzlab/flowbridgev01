/**
 * FlowBridge MultiSend V1 — paste / CSV / spreadsheet import.
 *
 * Column formats:
 *  - Distribute  (one-to-many):  recipient,amount
 *  - Consolidate (many-to-one):  source,amount   (destination is chosen in the UI)
 *  - Advanced    (many-to-many): source,recipient,amount
 *
 * Commas, semicolons and spreadsheet tabs are all accepted, a header row is
 * detected and skipped, and nothing is added to the plan until the user has
 * seen the import preview.
 */
import type { Address, MultiSendMode } from "./types";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const ZERO = "0x0000000000000000000000000000000000000000";

export interface ParsedImportRow {
  line: number;
  source: Address | null;
  recipient: Address | null;
  amountText: string;
}

export interface RejectedImportRow {
  line: number;
  raw: string;
  reason: string;
}

export interface ImportPreview {
  mode: MultiSendMode;
  valid: ParsedImportRow[];
  duplicates: ParsedImportRow[];
  invalid: RejectedImportRow[];
  unsupportedAmount: RejectedImportRow[];
  headerSkipped: boolean;
}

export function importSummaryText(p: ImportPreview): string {
  const parts = [`${p.valid.length} valid`];
  if (p.duplicates.length) parts.push(`${p.duplicates.length} duplicates`);
  if (p.invalid.length) parts.push(`${p.invalid.length} invalid`);
  if (p.unsupportedAmount.length) parts.push(`${p.unsupportedAmount.length} unsupported amount`);
  return parts.join(" · ");
}

function splitRow(line: string): string[] {
  return line
    .split(/[\t,;]/)
    .map((cell) => cell.trim().replace(/^["']|["']$/g, ""))
    .filter((cell) => cell.length > 0);
}

function looksLikeHeader(cells: string[]): boolean {
  return cells.some((c) => /^(recipient|source|address|wallet|amount|value|to|from)$/i.test(c));
}

function amountOk(text: string): boolean {
  if (!/^\d{1,30}(\.\d{1,30})?$/.test(text)) return false;
  return Number(text) > 0;
}

export function parseImport(args: {
  text: string;
  mode: MultiSendMode;
  /** Already-present keys so a re-import does not silently duplicate rows. */
  existingKeys?: string[];
}): ImportPreview {
  const { text, mode } = args;
  const preview: ImportPreview = {
    mode,
    valid: [],
    duplicates: [],
    invalid: [],
    unsupportedAmount: [],
    headerSkipped: false,
  };

  const lines = (text ?? "").split(/\r?\n/);
  const seen = new Set((args.existingKeys ?? []).map((k) => k.toLowerCase()));

  lines.forEach((rawLine, index) => {
    const line = index + 1;
    const raw = rawLine.trim();
    if (!raw) return;
    const cells = splitRow(raw);
    if (cells.length === 0) return;

    if (index === 0 && looksLikeHeader(cells)) {
      preview.headerSkipped = true;
      return;
    }

    const expected = mode === "many-to-many" ? 3 : 2;
    // Address-only rows are accepted; the amount is filled in afterwards.
    const addressOnly = cells.length === expected - 1 && cells.every((c) => ADDRESS_RE.test(c));
    if (cells.length < expected && !addressOnly) {
      preview.invalid.push({ line, raw, reason: `Expected ${expected} columns` });
      return;
    }

    let source: Address | null = null;
    let recipient: Address | null = null;
    let amountText = "";

    if (mode === "one-to-many") {
      recipient = cells[0] as Address;
      amountText = cells[1] ?? "";
    } else if (mode === "many-to-one") {
      source = cells[0] as Address;
      amountText = cells[1] ?? "";
    } else {
      source = cells[0] as Address;
      recipient = cells[1] as Address;
      amountText = cells[2] ?? "";
    }

    for (const addr of [source, recipient]) {
      if (addr === null) continue;
      if (!ADDRESS_RE.test(addr)) {
        preview.invalid.push({ line, raw, reason: "Not a valid wallet address" });
        return;
      }
      if (addr.toLowerCase() === ZERO) {
        preview.invalid.push({ line, raw, reason: "Zero address is never accepted" });
        return;
      }
    }
    if (source && recipient && source.toLowerCase() === recipient.toLowerCase()) {
      preview.invalid.push({ line, raw, reason: "Sends back to its own wallet" });
      return;
    }
    if (!addressOnly && !amountOk(amountText)) {
      preview.unsupportedAmount.push({ line, raw, reason: "Amount must be a plain number above zero" });
      return;
    }

    const key = `${(source ?? "").toLowerCase()}>${(recipient ?? "").toLowerCase()}`;
    const row: ParsedImportRow = { line, source, recipient, amountText };
    if (seen.has(key)) {
      preview.duplicates.push(row);
      return;
    }
    seen.add(key);
    preview.valid.push(row);
  });

  return preview;
}

/** CSV text of the rows a user could not import, for the "Download errors" action. */
export function errorsCsv(p: ImportPreview): string {
  const rows = [...p.invalid, ...p.unsupportedAmount].sort((a, b) => a.line - b.line);
  return ["line,reason,row", ...rows.map((r) => `${r.line},"${r.reason}","${r.raw.replace(/"/g, '""')}"`)].join("\n");
}

/** CSV receipt export for a completed or partially completed session. */
export function receiptCsv(args: {
  clientBatchId: string;
  tokenSymbol: string;
  rows: { source: string; recipient: string; amount: string; status: string; txHash?: string }[];
}): string {
  return [
    "batchId,token,source,recipient,amount,status,txHash",
    ...args.rows.map((r) =>
      [args.clientBatchId, args.tokenSymbol, r.source, r.recipient, r.amount, r.status, r.txHash ?? ""].join(","),
    ),
  ].join("\n");
}
