// AutoTrade V1.2 pre-live guards — PURE. Applied before every irreversible effect
// (sign, broadcast, approve, revoke). Nothing here signs or sends.
import { parseTransaction, type Hex } from "viem";
import { ROUTER_V4 } from "./config";
import { assertAllowlisted, BOT_CHAIN_ID, type LegCall, type OutboxEntry } from "./executor";

/** Re-checked immediately before SIGN and again before BROADCAST (pause/lease race). */
export function preEffectGate(c: { heldFencing: number; currentFencing: number; currentHolder: string; holder: string; leaseUntilMs: number; nowMs: number; emergencyPaused: boolean }): string | null {
  if (c.emergencyPaused) return "EMERGENCY_PAUSED";
  if (c.currentHolder !== c.holder || c.currentFencing !== c.heldFencing) return "FENCE_LOST";
  if (c.nowMs >= c.leaseUntilMs - 2_000) return "LEASE_EXPIRING"; // 2s margin: never start an effect we may not record
  return null;
}
/** An outbox row may only be advanced by the writer holding the fencing token that created it, or a strictly newer one for recovery (rebroadcast same bytes only). */
export function fenceMayAdvance(rowFencing: number | null, heldFencing: number): boolean {
  return rowFencing !== null && heldFencing >= rowFencing;
}

/** A signer transport must return exactly the transaction we asked for. */
export function assertSignedMatches(raw: Hex, want: { to: string; data: string; value: bigint; nonce: number; gas: bigint; maxFeePerGas: bigint }) {
  const tx = parseTransaction(raw);
  if (tx.chainId !== BOT_CHAIN_ID) throw new Error("SIGNED_CHAIN");
  if ((tx.to ?? "").toLowerCase() !== want.to.toLowerCase()) throw new Error("SIGNED_TO");
  if ((tx.data ?? "0x").toLowerCase() !== want.data.toLowerCase()) throw new Error("SIGNED_DATA");
  if ((tx.value ?? 0n) !== want.value) throw new Error("SIGNED_VALUE");
  if (tx.nonce !== want.nonce) throw new Error("SIGNED_NONCE");
  if ((tx.gas ?? 0n) > want.gas) throw new Error("SIGNED_GAS");
  const fee = tx.maxFeePerGas ?? tx.gasPrice ?? 0n; if (fee > want.maxFeePerGas) throw new Error("SIGNED_FEE");
}

const APPROVE = "0x095ea7b3";
/** Exact approve(ROUTER_V4, amount) on the leg's input token only; amount 0 = revoke. */
export function assertApprovalCall(call: { to: string; data: string; value: bigint }, leg: LegCall, revoke: boolean) {
  if (!leg.approval) throw new Error("NO_APPROVAL_NEEDED");
  if (call.value !== 0n) throw new Error("APPROVE_VALUE");
  if (call.to.toLowerCase() !== leg.approval.token.toLowerCase()) throw new Error("APPROVE_TOKEN");
  const d = call.data.toLowerCase(); if (d.slice(0, 10) !== APPROVE || d.length !== 138) throw new Error("APPROVE_SELECTOR");
  if ("0x" + d.slice(34, 74) !== ROUTER_V4.toLowerCase()) throw new Error("APPROVE_SPENDER");
  if (BigInt("0x" + d.slice(74)) !== (revoke ? 0n : leg.approval.amount)) throw new Error("APPROVE_AMOUNT");
}
/** Any effect we will sign must be a leg call or its exact approve/revoke. */
export function assertEffect(kind: "approve" | "revoke" | "leg", call: { to: string; data: string; value: bigint }, leg: LegCall) {
  if (kind === "leg") return assertAllowlisted(call);
  return assertApprovalCall(call, leg, kind === "revoke");
}

/** Revoke is owed whenever an approval landed and no revoke is final — including when the leg reverted, was replaced or is stuck. */
export function revokeOwed(rows: { side: string; state: OutboxEntry["state"] }[]): boolean {
  const approved = rows.some((r) => r.side === "approve" && (r.state === "MINED" || r.state === "FINAL"));
  const revoked = rows.some((r) => r.side === "revoke" && r.state === "FINAL");
  return approved && !revoked;
}
/** No new leg may start while any effect for this account is non-terminal (unknown fill). */
export function accountHasOpenEffect(rows: { state: OutboxEntry["state"] }[]): boolean {
  return rows.some((r) => !["FINAL", "REVERTED", "REPLACED"].includes(r.state));
}

/** Exactly one dedicated trading account; never a privileged project wallet. */
export function assertTradingAccount(account: string, registered: { address: string; status: string }[], privileged: string[]) {
  const a = account.toLowerCase();
  if (privileged.some((p) => p.toLowerCase() === a)) throw new Error("PRIVILEGED_WALLET");
  const active = registered.filter((r) => r.status === "authorized");
  if (active.length !== 1 || active[0]!.address !== a) throw new Error("NOT_THE_DEDICATED_ACCOUNT");
}

/** First canary limits: a quote-denominated cap (USDT-equivalent via a verified quote) plus a separate native gas reserve. */
export const CANARY = { capUsdt6: 5_000_000n, maxQuoteAgeMs: 10_000 } as const;
export function canaryBudgetCheck(c: { budgetUsdt6: bigint; quoteAgeMs: number; quoteVerified: boolean; nativeBalanceWei: bigint; gasReserveWei: bigint; worstCaseGasWei: bigint; legsRemaining: number; spendIsNative: boolean; spendWei: bigint }): string | null {
  if (!c.quoteVerified || c.quoteAgeMs > CANARY.maxQuoteAgeMs) return "CAP_QUOTE_UNVERIFIED";
  if (c.budgetUsdt6 <= 0n || c.budgetUsdt6 > CANARY.capUsdt6) return "CAP_EXCEEDED";
  if (c.gasReserveWei < c.worstCaseGasWei * BigInt(c.legsRemaining)) return "GAS_RESERVE_TOO_SMALL";
  const needed = c.gasReserveWei + (c.spendIsNative ? c.spendWei : 0n);
  if (c.nativeBalanceWei < needed) return "NATIVE_BALANCE_BELOW_SPEND_PLUS_RESERVE";
  return null;
}
