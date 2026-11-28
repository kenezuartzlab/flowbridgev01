/** Transport integration behind a source-locked factory. IO is injected for offline rehearsal. */
import { keccak256, parseTransaction, recoverTransactionAddress, type Hex, type TransactionSerialized } from "viem";
import { assertEffect, assertSignedMatches } from "./v12";
import { checkGas, type LegCall } from "./executor";
import type { EffectCall } from "./paperExecutor";
import { EXTERNAL_DIRECTIONAL_FEE_CAP_BPS } from "@/lib/swap/routeComparison";

export interface ManagedEffectRequest {
  key: string; orderId: string; account: Hex; side: "buy" | "sell" | "approve" | "revoke";
  call: EffectCall; leg: LegCall; gas: bigint; maxFeePerGas: bigint; maxGasWei: bigint;
  routeGuard: { registered: boolean; quoteOnly: boolean; externalFeeBps: number; feeMutable: boolean; verified: boolean };
}
export interface ManagedEffectRow {
  key: string; nonce: number; state: "RESERVED" | "SIGNED" | "BROADCAST" | "FINAL" | "REVERTED";
  raw: Hex | null; hash: Hex | null;
  actualOut?: bigint | null;
  receiptBlock?: bigint | null;
  receiptBlockHash?: Hex | null;
}
export interface ManagedEffectIO {
  /** Authoritative storage rechecks: source flag, approvals, order fingerprint, cap, RPC, lease and pause. */
  authorize(request: ManagedEffectRequest): Promise<void>;
  reserve(request: ManagedEffectRequest): Promise<ManagedEffectRow>;
  advance(row: ManagedEffectRow, next: ManagedEffectRow): Promise<void>;
  sign(request: ManagedEffectRequest, nonce: number): Promise<Hex>;
  broadcast(raw: Hex): Promise<Hex>;
  /** Must compare canonical receipt evidence from independently operated nodes. */
  receipt(hash: Hex, request: ManagedEffectRequest): Promise<{ final: boolean; status: "success" | "reverted"; actualOut: bigint; blockNumber?: bigint; blockHash?: Hex } | null>;
}

export async function validateManagedSignature(raw: Hex, request: ManagedEffectRequest, nonce: number) {
  assertSignedMatches(raw, { ...request.call, nonce, gas: request.gas, maxFeePerGas: request.maxFeePerGas });
  const tx = parseTransaction(raw);
  if (tx.type !== "legacy" && tx.type !== "eip1559") throw new Error("SIGNED_TX_TYPE");
  if (tx.gas !== request.gas || (tx.maxFeePerGas ?? tx.gasPrice) !== request.maxFeePerGas || (tx.maxPriorityFeePerGas ?? 0n) > request.maxFeePerGas) throw new Error("SIGNED_GAS_OR_FEE_MISMATCH");
  const sender = await recoverTransactionAddress({ serializedTransaction: raw as TransactionSerialized });
  if (sender.toLowerCase() !== request.account.toLowerCase()) throw new Error("SIGNED_SENDER");
}

/** No runtime live override here: production IO's authorize always enforces the source kill switch. */
export async function executeManagedEffect(request: ManagedEffectRequest, io: ManagedEffectIO) {
  await io.authorize(request);
  const guard = request.routeGuard;
  if (!guard?.verified || !guard.registered || guard.quoteOnly || guard.feeMutable || !Number.isInteger(guard.externalFeeBps) || guard.externalFeeBps < 0 || guard.externalFeeBps > EXTERNAL_DIRECTIONAL_FEE_CAP_BPS) throw new Error("ROUTE_GUARD_REJECTED");
  assertEffect(request.side === "approve" || request.side === "revoke" ? request.side : "leg", request.call, request.leg);
  if (request.side === "buy" || request.side === "sell") {
    if (request.call.to.toLowerCase() !== request.leg.to.toLowerCase() || request.call.data.toLowerCase() !== request.leg.data.toLowerCase() || request.call.value !== request.leg.value) throw new Error("IMMUTABLE_CALL_MISMATCH");
  }
  const gasError = checkGas(request.gas, request.maxFeePerGas, request.maxGasWei);
  if (gasError) throw new Error(gasError);
  let row = await io.reserve(request);
  if (row.key !== request.key) throw new Error("OUTBOX_IDENTITY");
  if (row.state === "FINAL" || row.state === "REVERTED") return { state: row.state, actualOut: row.actualOut ?? null };
  if (row.state === "RESERVED") {
    await io.authorize(request);
    const raw = await io.sign(request, row.nonce);
    await validateManagedSignature(raw, request, row.nonce);
    const next = { ...row, state: "SIGNED" as const, raw, hash: keccak256(raw) };
    await io.advance(row, next); row = next;
  }
  if (!row.raw || !row.hash) throw new Error("OUTBOX_SIGNATURE_MISSING");
  const raw = row.raw, txHash = row.hash;
  if (keccak256(raw).toLowerCase() !== txHash.toLowerCase()) throw new Error("OUTBOX_HASH_MISMATCH");
  await validateManagedSignature(raw, request, row.nonce);
  if (row.state === "SIGNED") {
    await io.authorize(request);
    // Persist ambiguous submission BEFORE external call. Crash/restart reconciles, never signs/sends again.
    const next = { ...row, state: "BROADCAST" as const };
    await io.advance(row, next); row = next;
    const hash = await io.broadcast(raw);
    if (hash.toLowerCase() !== txHash.toLowerCase()) throw new Error("BROADCAST_HASH_MISMATCH");
  }
  const receipt = await io.receipt(txHash, request);
  if (!receipt?.final) return { state: "BROADCAST" as const, actualOut: null };
  const next = { ...row, state: receipt.status === "success" ? "FINAL" as const : "REVERTED" as const, actualOut: receipt.actualOut, receiptBlock: receipt.blockNumber ?? null, receiptBlockHash: receipt.blockHash ?? null };
  await io.advance(row, next);
  return { state: next.state, actualOut: receipt.actualOut };
}