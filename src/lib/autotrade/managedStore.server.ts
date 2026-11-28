/** Separate chain-677 storage. No live effects share paper nonce rows. */
import { keccak256, stringToHex, type Hex } from "viem";
import type { ManagedEffectIO, ManagedEffectRequest, ManagedEffectRow } from "./liveTransport";

export interface ManagedLease { holder: string; fencing: number; attempt: string }
export interface ManagedRpcStoreClient { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> }
export function managedRequestJson(request: ManagedEffectRequest) {
  return JSON.parse(JSON.stringify(request, (_k, value) => typeof value === "bigint" ? value.toString() : value)) as Record<string, unknown>;
}
export function managedFingerprint(request: ManagedEffectRequest) {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)])) : value;
  return keccak256(stringToHex(JSON.stringify(canonical(managedRequestJson(request)))));
}
function row(value: unknown): ManagedEffectRow {
  if (!value || typeof value !== "object") throw new Error("MANAGED_STORE_RESPONSE");
  const r = value as Record<string, unknown>;
  if (typeof r["effect_key"] !== "string" || !Number.isSafeInteger(r["nonce"]) || !["RESERVED", "SIGNED", "BROADCAST", "FINAL", "REVERTED"].includes(String(r["state"]))) throw new Error("MANAGED_STORE_RESPONSE");
  return { key: r["effect_key"], nonce: Number(r["nonce"]), state: r["state"] as ManagedEffectRow["state"], raw: r["signed_raw"] as Hex | null, hash: r["tx_hash"] as Hex | null,
    actualOut: r["actual_out"] === null || r["actual_out"] === undefined ? null : BigInt(String(r["actual_out"])),
    receiptBlock: r["receipt_block"] === null || r["receipt_block"] === undefined ? null : BigInt(String(r["receipt_block"])), receiptBlockHash: (r["receipt_block_hash"] ?? null) as Hex | null };
}
export class ManagedExecutionStore {
  constructor(private readonly client: ManagedRpcStoreClient, private readonly lease: ManagedLease, private readonly pendingNonce: () => Promise<number>) {}
  private async operation(op: string, request: ManagedEffectRequest, extra: Record<string, unknown> = {}) {
    const result = await this.client.rpc("autotrade_managed_effect", {
      _op: op, _order_id: request.orderId, _key: request.key, _request: managedRequestJson(request), _fingerprint: managedFingerprint(request),
      _holder: this.lease.holder, _fencing: this.lease.fencing, _attempt: this.lease.attempt, _patch: extra,
    });
    if (result.error) throw new Error(result.error.message);
    return result.data;
  }
  authorize = async (request: ManagedEffectRequest) => { await this.operation("authorize", request); };
  reserve = async (request: ManagedEffectRequest) => row(await this.operation("reserve", request, { chainNonce: await this.pendingNonce() }));
  advance = (request: ManagedEffectRequest): ManagedEffectIO["advance"] => async (previous, next) => {
    await this.operation("advance", request, { expectedState: previous.state, state: next.state, raw: next.raw, hash: next.hash, actualOut: next.actualOut?.toString() ?? null, receiptBlock: next.receiptBlock?.toString() ?? null, receiptBlockHash: next.receiptBlockHash ?? null });
  };
}