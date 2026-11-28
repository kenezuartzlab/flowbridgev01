// AutoTrade V1 pure engine: price bounds -> exact minOut, quote guards, durable
// state machine and paper fills. No network, no signing. Tested in engine.test.ts.
import { AUTOTRADE_LIVE_ENABLED, GUARDS, type AutoTradePair } from "./config";
import type { ComparedRoute } from "@/lib/swap/routeComparison";

export interface Rational { num: bigint; den: bigint }
export function parsePrice(s: string): Rational {
  const t = s.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(t)) throw new Error("INVALID_PRICE");
  const [i, f = ""] = t.split(".");
  const den = 10n ** BigInt(f.length);
  const num = BigInt(i! + f);
  if (num <= 0n) throw new Error("INVALID_PRICE");
  return { num, den };
}
const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;

/** Router V4 takes its fee on input: pulled = swapAmount + floor(swapAmount*bps/1e4). */
export function splitRouterFee(total: bigint, bps: number) {
  const swapAmount = (total * 10_000n) / (10_000n + BigInt(bps));
  return { swapAmount, fee: (swapAmount * BigInt(bps)) / 10_000n };
}

/** Buy: spending `quoteIn` (incl. router fee) must yield >= quoteIn / maxPrice base. */
export function buyFloor(quoteIn: bigint, maxPrice: Rational, p: AutoTradePair): bigint {
  return ceilDiv(quoteIn * 10n ** BigInt(p.base.decimals) * maxPrice.den, 10n ** BigInt(p.quote.decimals) * maxPrice.num);
}
/** Sell: selling `baseIn` (incl. router fee) must yield >= baseIn * minPrice quote. */
export function sellFloor(baseIn: bigint, minPrice: Rational, p: AutoTradePair): bigint {
  return ceilDiv(baseIn * minPrice.num * 10n ** BigInt(p.quote.decimals), minPrice.den * 10n ** BigInt(p.base.decimals));
}
export function slippageFloor(quotedOut: bigint, slipBps: number) { return (quotedOut * BigInt(10_000 - slipBps)) / 10_000n; }

export interface Quote {
  amountIn: bigint; amountOut: bigint; block: number; headBlock: number; fetchedAt: number;
  /** independent second source amountOut for the same input (e.g. second RPC). */
  crossCheckOut: bigint | null;
  priceImpactBps: number; gasUnits: bigint; gasPriceWei: bigint;
  /** Exact selected registered route and diagnostic-only alternatives. */
  route?: ComparedRoute;
  quoteOnlyAlternatives?: ComparedRoute[];
}
export type QuoteRejection = "STALE_QUOTE" | "STALE_BLOCK" | "NO_CROSS_CHECK" | "SOURCE_DEVIATION" | "INSUFFICIENT_LIQUIDITY" | "PRICE_IMPACT";
export function checkQuote(q: Quote, now: number): QuoteRejection | null {
  if (now - q.fetchedAt > GUARDS.maxQuoteAgeMs || q.fetchedAt > now + 2_000) return "STALE_QUOTE";
  if (q.headBlock - q.block > GUARDS.maxQuoteBlockLag || q.block > q.headBlock) return "STALE_BLOCK";
  if (q.amountOut <= 0n) return "INSUFFICIENT_LIQUIDITY";
  if (q.crossCheckOut === null) return "NO_CROSS_CHECK";
  const hi = q.amountOut > q.crossCheckOut ? q.amountOut : q.crossCheckOut;
  const lo = q.amountOut > q.crossCheckOut ? q.crossCheckOut : q.amountOut;
  if ((hi - lo) * 10_000n > hi * BigInt(GUARDS.maxSourceDeviationBps)) return "SOURCE_DEVIATION";
  if (q.priceImpactBps > GUARDS.maxPriceImpactBps) return "PRICE_IMPACT";
  return null;
}

export type OrderState = "ARMED" | "BUY_SUBMITTED" | "HOLDING" | "SELL_SUBMITTED" | "COMPLETED" | "PAUSED" | "CANCELLED" | "EXPIRED" | "FAILED";
export interface OrderSpec {
  pair: AutoTradePair; mode: "paper" | "live";
  budgetQuote: bigint; maxBuyPrice: Rational; minSellPrice: Rational; stopPrice: Rational | null;
  slippageBps: number; maxGasWeiPerLeg: bigint; maxLossQuote: bigint; expiresAt: number; repeat: boolean;
}
export interface Leg { side: "buy" | "sell"; idempotencyKey: string; amountIn: bigint; minOut: bigint; txHash: string | null; nonce: number | null; actualOut: bigint | null }
export interface Order { id: string; spec: OrderSpec; state: OrderState; resumeState: OrderState | null; acquiredBase: bigint; proceedsQuote: bigint; legs: Leg[]; version: number }

export function validateSpec(s: OrderSpec, now: number): string | null {
  if (s.repeat) return "REPEAT_NOT_SUPPORTED_V1";
  if (s.budgetQuote <= 0n) return "BUDGET";
  if (s.slippageBps < 1 || s.slippageBps > GUARDS.maxSlippageBps) return "SLIPPAGE";
  if (s.expiresAt <= now || s.expiresAt - now > GUARDS.maxExpiryMs) return "EXPIRY";
  if (s.maxGasWeiPerLeg <= 0n || s.maxLossQuote < 0n || s.maxLossQuote > s.budgetQuote) return "LIMITS";
  // sell min must be >= max buy (no round-trip at a planned loss / wash pattern)
  if (s.minSellPrice.num * s.maxBuyPrice.den < s.maxBuyPrice.num * s.minSellPrice.den) return "SELL_BELOW_BUY";
  if (s.stopPrice && s.stopPrice.num * s.maxBuyPrice.den >= s.maxBuyPrice.num * s.stopPrice.den) return "STOP_ABOVE_BUY";
  return null;
}

export function newOrder(id: string, spec: OrderSpec, now: number): Order {
  const err = validateSpec(spec, now); if (err) throw new Error(err);
  if (spec.mode === "live") assertLiveAllowed();
  return { id, spec, state: "ARMED", resumeState: null, acquiredBase: 0n, proceedsQuote: 0n, legs: [], version: 0 };
}
export function assertLiveAllowed(): never | void {
  if (!AUTOTRADE_LIVE_ENABLED) throw new Error("LIVE_DISABLED");
}

export type Decision =
  | { kind: "wait"; reason: string }
  | { kind: "reject"; reason: QuoteRejection | "GAS_LIMIT" }
  | { kind: "submit"; leg: Leg; stop?: boolean };

/** Decide the next action for an order given a fresh quote of the *exact* next leg input. */
export function decide(o: Order, q: Quote, now: number, routerFeeBps: number): Decision {
  if (o.state !== "ARMED" && o.state !== "HOLDING") return { kind: "wait", reason: o.state };
  if (now >= o.spec.expiresAt) return { kind: "wait", reason: "EXPIRED" };
  const r = checkQuote(q, now); if (r) return { kind: "reject", reason: r };
  if (q.gasUnits * q.gasPriceWei > o.spec.maxGasWeiPerLeg) return { kind: "reject", reason: "GAS_LIMIT" };
  const buy = o.state === "ARMED";
  const amountIn = buy ? o.spec.budgetQuote : o.acquiredBase;
  // the DEX receives amountIn minus the Router V4 input fee; floors use the fee-inclusive amount
  if (q.amountIn !== splitRouterFee(amountIn, routerFeeBps).swapAmount) return { kind: "wait", reason: "QUOTE_AMOUNT_MISMATCH" };
  const slip = slippageFloor(q.amountOut, o.spec.slippageBps);
  const lossBound = o.spec.budgetQuote - o.spec.maxLossQuote;
  let bound: bigint; let stop = false;
  if (buy) bound = buyFloor(amountIn, o.spec.maxBuyPrice, o.spec.pair);
  else {
    bound = sellFloor(amountIn, o.spec.minSellPrice, o.spec.pair);
    if (q.amountOut < bound && o.spec.stopPrice && q.amountOut <= sellFloor(amountIn, o.spec.stopPrice, o.spec.pair)) {
      bound = lossBound; stop = true; // stop triggered; never accept more loss than the limit
    }
  }
  if (q.amountOut < bound) return { kind: "wait", reason: stop ? "LOSS_LIMIT" : "PRICE_NOT_MET" };
  const minOut = bound > slip ? bound : slip;
  const side = buy ? "buy" : "sell";
  return { kind: "submit", stop, leg: { side, idempotencyKey: `${o.id}:${side}`, amountIn, minOut, txHash: null, nonce: null, actualOut: null } };
}

export type OrderEvent =
  | { type: "submitted"; leg: Leg; txHash: string; nonce: number }
  | { type: "confirmed"; txHash: string; actualOut: bigint; confirmations: number }
  | { type: "reverted"; txHash: string }
  | { type: "reorged"; txHash: string }
  | { type: "pause" } | { type: "resume" } | { type: "cancel" } | { type: "expire" };

/** Deterministic, idempotent transitions. Throws on illegal moves (caller keeps old state). */
export function apply(o: Order, e: OrderEvent): Order {
  const n = { ...o, legs: o.legs.map((l) => ({ ...l })), version: o.version + 1 };
  const open = n.legs.find((l) => l.txHash && l.actualOut === null);
  switch (e.type) {
    case "submitted": {
      if (n.legs.some((l) => l.idempotencyKey === e.leg.idempotencyKey)) throw new Error("DUPLICATE_LEG");
      if (open) throw new Error("LEG_IN_FLIGHT");
      const want = e.leg.side === "buy" ? "ARMED" : "HOLDING";
      if (n.state !== want) throw new Error("ILLEGAL_SUBMIT");
      n.legs.push({ ...e.leg, txHash: e.txHash, nonce: e.nonce });
      n.state = e.leg.side === "buy" ? "BUY_SUBMITTED" : "SELL_SUBMITTED";
      return n;
    }
    case "confirmed": {
      const leg = n.legs.find((l) => l.txHash === e.txHash);
      if (!leg) throw new Error("UNKNOWN_TX");
      if (leg.actualOut !== null) return o; // idempotent replay
      if (e.confirmations < GUARDS.minConfirmations) throw new Error("NOT_FINAL");
      if (e.actualOut < leg.minOut) throw new Error("OUTPUT_BELOW_MIN");
      leg.actualOut = e.actualOut;
      if (leg.side === "buy") { n.acquiredBase = e.actualOut; n.state = "HOLDING"; }
      else { n.proceedsQuote = e.actualOut; n.state = "COMPLETED"; }
      return n;
    }
    case "reverted": {
      const i = n.legs.findIndex((l) => l.txHash === e.txHash && l.actualOut === null);
      if (i < 0) throw new Error("UNKNOWN_TX");
      const side = n.legs[i]!.side; n.legs.splice(i, 1);
      n.state = "FAILED"; n.resumeState = side === "buy" ? "ARMED" : "HOLDING";
      return n;
    }
    case "reorged": {
      const leg = n.legs.find((l) => l.txHash === e.txHash);
      if (!leg) throw new Error("UNKNOWN_TX");
      if (leg.actualOut !== null) {
        if (leg.side === "sell" || n.state !== "HOLDING") throw new Error("REORG_AFTER_PROGRESS");
        leg.actualOut = null; n.acquiredBase = 0n;
      }
      n.state = leg.side === "buy" ? "BUY_SUBMITTED" : "SELL_SUBMITTED"; // never resubmit; await re-inclusion
      return n;
    }
    case "pause":
      if (["COMPLETED", "CANCELLED", "EXPIRED", "PAUSED"].includes(n.state)) throw new Error("ILLEGAL_PAUSE");
      n.resumeState = n.state; n.state = "PAUSED"; return n;
    case "resume":
      if (n.state !== "PAUSED" && n.state !== "FAILED") throw new Error("ILLEGAL_RESUME");
      n.state = n.resumeState ?? "ARMED"; n.resumeState = null; return n;
    case "cancel": case "expire":
      if (open) throw new Error("LEG_IN_FLIGHT");
      if (n.acquiredBase > 0n && n.state !== "COMPLETED") { n.state = e.type === "cancel" ? "CANCELLED" : "EXPIRED"; return n; } // holdings stay with trading account; operator sells manually
      if (["COMPLETED", "CANCELLED", "EXPIRED"].includes(n.state)) throw new Error("TERMINAL");
      n.state = e.type === "cancel" ? "CANCELLED" : "EXPIRED"; return n;
  }
}

/** Paper fill: treat the quoted amount as the confirmed output. */
export function paperStep(o: Order, q: Quote, now: number, routerFeeBps: number): { order: Order; decision: Decision } {
  if (o.spec.mode !== "paper") throw new Error("NOT_PAPER");
  if (now >= o.spec.expiresAt && (o.state === "ARMED" || o.state === "HOLDING")) return { order: apply(o, { type: "expire" }), decision: { kind: "wait", reason: "EXPIRED" } };
  const d = decide(o, q, now, routerFeeBps);
  if (d.kind !== "submit") return { order: o, decision: d };
  const tx = `paper:${d.leg.idempotencyKey}`;
  let n = apply(o, { type: "submitted", leg: d.leg, txHash: tx, nonce: -1 });
  n = apply(n, { type: "confirmed", txHash: tx, actualOut: q.amountOut, confirmations: GUARDS.minConfirmations });
  return { order: n, decision: d };
}
