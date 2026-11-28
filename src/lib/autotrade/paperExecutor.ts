// AutoTrade V1.3 paper executor orchestration. Effects use a separate negative
// chain namespace and deterministic mock receipts; no live flag or signer override.
import { encodeFunctionData, keccak256, parseAbi, parseTransaction, type Hex, type TransactionSerialized } from "viem";
import { decide, apply, type Decision, type Order, type Quote } from "./engine";
import { assertAllowlisted, buildLegCall, checkGas, planAmounts, type LegCall } from "./executor";
import { legTokens } from "./path";
import { GUARDS as ENGINE_GUARDS, ROUTER_V4, ROUTER_V4_FEE_BPS_BDEX_V3 } from "./config";
import { assertEffect, assertSignedMatches, preEffectGate } from "./v12";
import { assertRouteExecutable } from "@/lib/swap/routeComparison";

export const PAPER_CHAIN_ID = -677 as const;
export const PAPER_ACCOUNT = "paper-autotrade-v1" as const;
export type PaperEffectSide = "approve" | "buy" | "sell" | "revoke";
export type PaperEffectState = "RESERVED" | "SIGNED" | "BROADCAST" | "MINED" | "FINAL" | "REVERTED" | "REPLACED";
export interface EffectCall { to: Hex; data: Hex; value: bigint }
export interface StoredCall { call: EffectCall; legCall: LegCall }
export interface PaperEffect {
  key: string;
  parentKey: string;
  side: PaperEffectSide;
  nonce: number;
  state: PaperEffectState;
  txHash: string | null;
  signedRaw: Hex | null;
  minedBlock: number | null;
  minedHash: string | null;
  storedCall: StoredCall;
  fencing: number;
}
export interface PaperLease { holder: string; fencing: number; leaseUntilMs: number }
export interface PaperReceipt {
  status: "success" | "reverted";
  confirmations: number;
  actualOut: bigint;
  block: number;
  blockHash: string;
}
export interface PreparedPaperEffect { raw: Hex | null; txHash: string; gas: bigint; maxFeePerGas: bigint }
export interface PaperTransport {
  kind: "mock" | "fork";
  account?: Hex;
  prepare(args: { key: string; call: EffectCall; nonce: number; quotedOut: bigint; maxGasWei: bigint }): Promise<PreparedPaperEffect>;
  broadcast(args: { raw: Hex | null; txHash: string }): Promise<void>;
  receipt(txHash: string): Promise<PaperReceipt | null>;
  canonicalBlockHash?(block: number): Promise<string | null>;
}
export interface PaperExecutionStore {
  reserve(args: {
    order: Order; key: string; parentKey: string; side: PaperEffectSide; storedCall: StoredCall; lease: PaperLease;
  }): Promise<PaperEffect>;
  advance(args: {
    order: Order; effect: PaperEffect; patch: Partial<Pick<PaperEffect, "state" | "txHash" | "signedRaw" | "minedBlock" | "minedHash">>;
    nextOrder?: Order; event?: unknown; decision?: unknown; requireUnpaused: boolean; lease: PaperLease;
  }): Promise<void>;
  effects(orderId: string): Promise<PaperEffect[]>;
}

const ERC20 = parseAbi(["function approve(address spender,uint256 amount) returns (bool)"]);
const zero = "0x0000000000000000000000000000000000000000" as Hex;

function jsonCall(call: EffectCall): EffectCall { return { ...call, value: BigInt(call.value) } }
function assertQuoteRoute(order: Order, quote: Quote, side: "buy" | "sell") {
  if (!quote.route) throw new Error("ROUTE_EVIDENCE_MISSING");
  const route = assertRouteExecutable(quote.route);
  if (route.routerId !== order.spec.pair.routerId || route.amountIn !== quote.amountIn) throw new Error("ROUTE_SELECTION_MISMATCH");
  const expected = legTokens(order.spec.pair, side).map((a) => a.toLowerCase());
  if (JSON.stringify(route.path) !== JSON.stringify(expected)) throw new Error("ROUTE_PATH_MISMATCH");
  if (route.caller.toLowerCase() !== ROUTER_V4.toLowerCase()) throw new Error("ROUTE_CALLER_MISMATCH");
}
function gate(lease: PaperLease, emergencyPaused = false): void {
  const error = preEffectGate({
    heldFencing: lease.fencing, currentFencing: lease.fencing, currentHolder: lease.holder, holder: lease.holder,
    leaseUntilMs: lease.leaseUntilMs, nowMs: Date.now(), emergencyPaused,
  });
  if (error) throw new Error(error);
}
function approveCall(legCall: LegCall, revoke: boolean): EffectCall {
  if (!legCall.approval) throw new Error("NO_APPROVAL_NEEDED");
  return {
    to: legCall.approval.token,
    data: encodeFunctionData({ abi: ERC20, functionName: "approve", args: [ROUTER_V4 as Hex, revoke ? 0n : legCall.approval.amount] }),
    value: 0n,
  };
}
async function validatePrepared(transport: PaperTransport, prepared: PreparedPaperEffect, call: EffectCall, nonce: number, maxGasWei: bigint) {
  const gasError = checkGas(prepared.gas, prepared.maxFeePerGas, maxGasWei);
  if (gasError) throw new Error(gasError);
  if (!prepared.raw) {
    if (transport.kind !== "mock") throw new Error("SIGNED_PAYLOAD_REQUIRED");
    return;
  }
  assertSignedMatches(prepared.raw, { ...call, nonce, gas: prepared.gas, maxFeePerGas: prepared.maxFeePerGas });
  const parsed = parseTransaction(prepared.raw);
  if (parsed.type !== "legacy" && parsed.type !== "eip1559") throw new Error("SIGNED_TX_TYPE");
  if (prepared.maxFeePerGas <= 0n || prepared.gas <= 0n) throw new Error("SIGNED_GAS");
  if (transport.account) {
    const { recoverTransactionAddress } = await import("viem");
    const sender = await recoverTransactionAddress({ serializedTransaction: prepared.raw as TransactionSerialized });
    if (sender.toLowerCase() !== transport.account.toLowerCase()) throw new Error("SIGNED_SENDER");
  } else throw new Error("SIGNER_ACCOUNT_MISSING");
}

async function performEffect(args: {
  order: Order; store: PaperExecutionStore; transport: PaperTransport; lease: PaperLease;
  key: string; parentKey: string; side: PaperEffectSide; legCall: LegCall; call: EffectCall; quotedOut: bigint;
  onBroadcast?: (current: Order, txHash: string, nonce: number) => Order;
  onFinal?: (current: Order, txHash: string, receipt: PaperReceipt) => Order;
  onReverted?: (current: Order, txHash: string) => Order;
}): Promise<{ order: Order; effect: PaperEffect; receipt: PaperReceipt | null }> {
  const { store, transport, lease, side, legCall, quotedOut } = args;
  let order = args.order;
  let effect = await store.reserve({ order, key: args.key, parentKey: args.parentKey, side, storedCall: { call: jsonCall(args.call), legCall }, lease });
  if (effect.state === "FINAL") return { order, effect, receipt: null };
  if (["REVERTED", "REPLACED"].includes(effect.state)) throw new Error("EFFECT_TERMINAL");

  const call = effect.storedCall.call;
  assertEffect(side === "approve" ? "approve" : side === "revoke" ? "revoke" : "leg", call, effect.storedCall.legCall);
  gate(lease);
  let prepared: PreparedPaperEffect;
  if (effect.signedRaw && effect.txHash) {
    const parsed = parseTransaction(effect.signedRaw);
    prepared = { raw: effect.signedRaw, txHash: effect.txHash, gas: parsed.gas ?? 0n, maxFeePerGas: parsed.maxFeePerGas ?? parsed.gasPrice ?? 0n };
  } else {
    prepared = await transport.prepare({ key: effect.key, call, nonce: effect.nonce, quotedOut, maxGasWei: order.spec.maxGasWeiPerLeg });
    if (!prepared.raw && transport.kind === "mock" && effect.txHash && effect.txHash !== prepared.txHash) throw new Error("PAPER_TX_MISMATCH");
    if (effect.state === "RESERVED") {
      await store.advance({ order, effect, patch: { state: "SIGNED", txHash: prepared.txHash, signedRaw: prepared.raw }, requireUnpaused: true, lease });
      effect = { ...effect, state: "SIGNED", txHash: prepared.txHash, signedRaw: prepared.raw };
    } else {
      if (effect.txHash !== prepared.txHash) throw new Error("PAPER_TX_MISMATCH");
      effect = { ...effect, txHash: prepared.txHash, signedRaw: prepared.raw };
    }
  }
  await validatePrepared(transport, prepared, call, effect.nonce, order.spec.maxGasWeiPerLeg);
  gate(lease);

  if (effect.state === "SIGNED") {
    const nextOrder = args.onBroadcast?.(order, effect.txHash!, effect.nonce);
    await store.advance({ order, effect, patch: { state: "BROADCAST" }, nextOrder, event: nextOrder ? { type: "paper_broadcast", key: effect.key } : undefined, requireUnpaused: true, lease });
    if (nextOrder) order = nextOrder;
    effect = { ...effect, state: "BROADCAST" };
  }
  await transport.broadcast({ raw: prepared.raw, txHash: effect.txHash! });
  const receipt = await transport.receipt(effect.txHash!);
  if (!receipt) return { order, effect, receipt: null };
  if (receipt.status === "reverted") {
    const nextOrder = args.onReverted?.(order, effect.txHash!);
    await store.advance({ order, effect, patch: { state: "REVERTED" }, nextOrder, event: nextOrder ? { type: "paper_reverted", key: effect.key } : undefined, requireUnpaused: false, lease });
    return { order: nextOrder ?? order, effect: { ...effect, state: "REVERTED" }, receipt };
  }
  if (receipt.confirmations < ENGINE_GUARDS.minConfirmations) {
    if (effect.state !== "MINED") await store.advance({ order, effect, patch: { state: "MINED", minedBlock: receipt.block, minedHash: receipt.blockHash }, requireUnpaused: false, lease });
    return { order, effect: { ...effect, state: "MINED" }, receipt };
  }
  if (effect.state !== "MINED") {
    await store.advance({ order, effect, patch: { state: "MINED", minedBlock: receipt.block, minedHash: receipt.blockHash }, requireUnpaused: false, lease });
    effect = { ...effect, state: "MINED" };
  }
  const nextOrder = args.onFinal?.(order, effect.txHash!, receipt);
  await store.advance({ order, effect, patch: { state: "FINAL" }, nextOrder, event: nextOrder ? { type: "paper_final", key: effect.key, actualOut: receipt.actualOut.toString() } : undefined, requireUnpaused: false, lease });
  return { order: nextOrder ?? order, effect: { ...effect, state: "FINAL" }, receipt };
}

async function revokeDebts(order: Order, store: PaperExecutionStore, transport: PaperTransport, lease: PaperLease): Promise<Order> {
  const effects = await store.effects(order.id);
  for (const approval of effects.filter((e) => e.side === "approve" && e.state === "FINAL")) {
    const revoked = effects.some((e) => e.parentKey === approval.parentKey && e.side === "revoke" && e.state === "FINAL");
    if (revoked) continue;
    const legCall = approval.storedCall.legCall;
    const call = approveCall(legCall, true);
    const result = await performEffect({
      order, store, transport, lease, key: `${approval.parentKey}:revoke`, parentKey: approval.parentKey,
      side: "revoke", legCall, call, quotedOut: 0n,
    });
    order = result.order;
  }
  return order;
}

async function reconcile(order: Order, store: PaperExecutionStore, transport: PaperTransport, lease: PaperLease) {
  const leg = order.legs.find((l) => l.txHash && l.actualOut === null);
  if (!leg?.txHash) return { order, decision: { kind: "wait", reason: order.state } as Decision };
  let effect = (await store.effects(order.id)).find((e) => e.key === `${leg.idempotencyKey}:leg`);
  if (!effect) throw new Error("OUTBOX_EFFECT_MISSING");
  if (effect.state === "MINED" && effect.minedBlock !== null && transport.canonicalBlockHash) {
    const canonical = await transport.canonicalBlockHash(effect.minedBlock);
    if (canonical !== effect.minedHash) {
      await store.advance({ order, effect, patch: { state: "BROADCAST" }, requireUnpaused: false, lease });
      return { order, decision: { kind: "wait", reason: "REORGED" } as Decision };
    }
  }
  const receipt = await transport.receipt(leg.txHash);
  if (!receipt) return { order, decision: { kind: "wait", reason: "RECEIPT_PENDING" } as Decision };
  if (receipt.status === "reverted") {
    let next = apply(order, { type: "reverted", txHash: leg.txHash });
    await store.advance({ order, effect, patch: { state: "REVERTED" }, nextOrder: next, event: { type: "paper_reverted", key: effect.key }, requireUnpaused: false, lease });
    next = await revokeDebts(next, store, transport, lease);
    return { order: next, decision: { kind: "wait", reason: "REVERTED" } as Decision };
  }
  if (receipt.confirmations < ENGINE_GUARDS.minConfirmations) {
    if (effect.state === "BROADCAST") await store.advance({ order, effect, patch: { state: "MINED", minedBlock: receipt.block, minedHash: receipt.blockHash }, requireUnpaused: false, lease });
    return { order, decision: { kind: "wait", reason: "CONFIRMATIONS_PENDING" } as Decision };
  }
  if (effect.state === "BROADCAST") {
    await store.advance({ order, effect, patch: { state: "MINED", minedBlock: receipt.block, minedHash: receipt.blockHash }, requireUnpaused: false, lease });
    effect = { ...effect, state: "MINED" };
  }
  let next = apply(order, { type: "confirmed", txHash: leg.txHash, actualOut: receipt.actualOut, confirmations: receipt.confirmations });
  await store.advance({ order, effect, patch: { state: "FINAL" }, nextOrder: next, event: { type: "paper_final", key: effect.key, actualOut: receipt.actualOut.toString() }, requireUnpaused: false, lease });
  next = await revokeDebts(next, store, transport, lease);
  return { order: next, decision: { kind: "wait", reason: "RECEIPT_FINAL" } as Decision };
}

/** Actual worker → reservation → validated transport → durable outbox → receipt path. */
export async function processTransportedPaperOrder(args: {
  order: Order; quote: Quote | null; now: number; store: PaperExecutionStore; transport: PaperTransport; lease: PaperLease;
}): Promise<{ order: Order; decision: Decision }> {
  let { order } = args;
  const { store, transport, lease, quote, now } = args;
  if (order.spec.mode !== "paper") throw new Error("NOT_PAPER");
  if (order.legs.some((l) => l.txHash && l.actualOut === null)) return reconcile(order, store, transport, lease);
  if (transport.canonicalBlockHash) {
    for (const effect of (await store.effects(order.id)).filter((e) => e.state === "FINAL" && e.minedBlock !== null)) {
      const canonical = await transport.canonicalBlockHash(effect.minedBlock!);
      if (canonical !== effect.minedHash) throw new Error("FINAL_REORG_REVIEW");
    }
  }
  if (order.state !== "ARMED" && order.state !== "HOLDING") return { order, decision: { kind: "wait", reason: order.state } };
  order = await revokeDebts(order, store, transport, lease);
  if (!quote) return { order, decision: { kind: "wait", reason: "QUOTE_UNAVAILABLE" } };
  const decision = decide(order, quote, now, ROUTER_V4_FEE_BPS_BDEX_V3);
  if (decision.kind !== "submit") return { order, decision };
  const side = decision.leg.side;
  assertQuoteRoute(order, quote, side);
  const plan = planAmounts(decision.leg.amountIn, ROUTER_V4_FEE_BPS_BDEX_V3);
  const deadline = BigInt(Math.floor(now / 1000) + 600);
  const legCall = buildLegCall(order.spec.pair, side, plan, decision.leg.minOut, transport.account ?? zero, deadline);
  assertAllowlisted(legCall);
  if (legCall.approval) {
    const approved = await performEffect({
      order, store, transport, lease, key: `${decision.leg.idempotencyKey}:approve`, parentKey: decision.leg.idempotencyKey,
      side: "approve", legCall, call: approveCall(legCall, false), quotedOut: 0n,
    });
    order = approved.order;
    if (approved.effect.state !== "FINAL") return { order, decision: { kind: "wait", reason: `APPROVAL_${approved.effect.state}` } as Decision };
  }
  const executed = await performEffect({
    order, store, transport, lease, key: `${decision.leg.idempotencyKey}:leg`, parentKey: decision.leg.idempotencyKey,
    side, legCall, call: { to: legCall.to, data: legCall.data, value: legCall.value }, quotedOut: quote.amountOut,
    onBroadcast: (current, txHash, nonce) => apply(current, { type: "submitted", leg: decision.leg, txHash, nonce }),
    onFinal: (current, txHash, receipt) => apply(current, { type: "confirmed", txHash, actualOut: receipt.actualOut, confirmations: receipt.confirmations }),
    onReverted: (current, txHash) => apply(current, { type: "reverted", txHash }),
  });
  order = executed.order;
  if (["FINAL", "REVERTED", "REPLACED"].includes(executed.effect.state)) order = await revokeDebts(order, store, transport, lease);
  return { order, decision };
}

/** Deterministic mock: output is encoded in the synthetic hash for crash/restart recovery. */
export class MockPaperTransport implements PaperTransport {
  readonly kind = "mock" as const;
  readonly account = "0x0000000000000000000000000000000000000677" as Hex;
  async prepare({ key, quotedOut }: { key: string; quotedOut: bigint }): Promise<PreparedPaperEffect> {
    return { raw: null, txHash: `paper:${key}:${quotedOut.toString(16)}`, gas: 1n, maxFeePerGas: 1n };
  }
  async broadcast(_args: { raw: Hex | null; txHash: string }): Promise<void> {}
  async receipt(txHash: string): Promise<PaperReceipt | null> {
    const amount = txHash.split(":").at(-1);
    if (!amount || !/^[0-9a-f]+$/.test(amount)) throw new Error("PAPER_RECEIPT_UNKNOWN");
    return { status: "success", confirmations: ENGINE_GUARDS.minConfirmations, actualOut: BigInt(`0x${amount}`), block: 1, blockHash: `paper:${keccak256(txHash as Hex)}` };
  }
}
