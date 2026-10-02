/**
 * Liquidity V1 — transaction lifecycle + liquidity Activity records.
 * A transaction is only Confirmed from Confirming with a successful receipt —
 * never merely because a hash exists.
 */
export type TxPhase =
  | "preparing"
  | "approval-required"
  | "waiting-signature"
  | "submitted"
  | "confirming"
  | "confirmed"
  | "failed";

export const PHASE_LABEL: Record<TxPhase, string> = {
  preparing: "Preparing",
  "approval-required": "Approval Required",
  "waiting-signature": "Waiting for Signature",
  submitted: "Submitted",
  confirming: "Confirming",
  confirmed: "Confirmed",
  failed: "Failed",
};

const NEXT: Record<TxPhase, TxPhase[]> = {
  preparing: ["approval-required", "waiting-signature", "failed"],
  "approval-required": ["waiting-signature", "failed"],
  "waiting-signature": ["submitted", "failed", "approval-required"],
  submitted: ["confirming", "failed"],
  confirming: ["confirmed", "failed"],
  confirmed: [],
  failed: ["preparing"],
};

export function advance(from: TxPhase, to: TxPhase, receipt?: { status: "success" | "reverted" } | null): TxPhase {
  if (!NEXT[from].includes(to)) throw new Error(`Invalid transition ${from} → ${to}`);
  if (to === "confirmed" && receipt?.status !== "success") throw new Error("Cannot confirm without a successful receipt");
  return to;
}

export function phaseFromReceipt(receipt: { status: "success" | "reverted" } | null | undefined): TxPhase {
  if (!receipt) return "confirming";
  return receipt.status === "success" ? "confirmed" : "failed";
}

export type LiquidityActivityKind =
  | "routed-swap"
  | "add-liquidity"
  | "remove-liquidity"
  | "create-pool"
  | "increase-liquidity"
  | "decrease-liquidity"
  | "collect-fees"
  | "burn-position"
  | "approval";

export const KIND_LABEL: Record<LiquidityActivityKind, string> = {
  "routed-swap": "Routed Swap",
  "add-liquidity": "Add Liquidity",
  "remove-liquidity": "Remove Liquidity",
  "create-pool": "Create Pool",
  "increase-liquidity": "Increase Liquidity",
  "decrease-liquidity": "Decrease Liquidity",
  "collect-fees": "Collect Fees",
  "burn-position": "Burn Position",
  approval: "Approval",
};

export interface LiquidityTx { hash: string; label: string; phase: TxPhase }

export interface LiquidityActivity {
  id: string;
  kind: LiquidityActivityKind;
  chainId: number;
  dex: string;
  pair: string;
  amounts: string[];
  tokenId?: string;
  pool?: string;
  wallet: string;
  createdAt: number;
  txs: LiquidityTx[];
}

export function operationStatus(a: Pick<LiquidityActivity, "txs">): { phase: TxPhase; summary: string } {
  const n = a.txs.length;
  const c = a.txs.filter((t) => t.phase === "confirmed").length;
  const f = a.txs.filter((t) => t.phase === "failed").length;
  const w = n - c - f;
  const phase: TxPhase = f > 0 ? "failed" : n > 0 && c === n ? "confirmed" : n === 0 ? "preparing" : "confirming";
  const parts = [`${n} transaction${n === 1 ? "" : "s"}`, `${c} confirmed`];
  if (w) parts.push(`${w} waiting`);
  if (f) parts.push(`${f} failed`);
  return { phase, summary: parts.join(" · ") };
}

const KEY = "fb.liquidity.activity.v1";

function read(): LiquidityActivity[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as LiquidityActivity[]; } catch { return []; }
}

export function listLiquidityActivity(wallet?: string): LiquidityActivity[] {
  const all = read();
  return wallet ? all.filter((a) => a.wallet.toLowerCase() === wallet.toLowerCase()) : all;
}

export function upsertLiquidityActivity(a: LiquidityActivity): void {
  if (typeof window === "undefined") return;
  const all = read().filter((x) => x.id !== a.id);
  all.unshift(a);
  window.localStorage.setItem(KEY, JSON.stringify(all.slice(0, 200)));
  window.dispatchEvent(new Event("fb-liquidity-activity"));
}
