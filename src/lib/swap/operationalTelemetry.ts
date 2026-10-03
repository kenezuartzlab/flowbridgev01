export type TradeOperationalEventName =
  | "quote_requested"
  | "review_opened"
  | "signature_requested"
  | "quote_success"
  | "quote_failure"
  | "quote_stale"
  | "review_invalidated"
  | "simulation_success"
  | "simulation_failure"
  | "wallet_rejected"
  | "tx_submitted"
  | "tx_confirmed"
  | "tx_reverted"
  | "rpc_failure"
  | "allowance_failure"
  | "insufficient_balance"
  | "minimum_output_failure"
  | "route_unavailable";

export interface TradeOperationalEvent {
  eventName: TradeOperationalEventName;
  network: 56 | 97 | 677 | 968;
  routeType: "single" | "atomic_v4" | "staged" | "unknown";
  dex: string;
  transactionCount: number;
  durationMs?: number;
  failureReason?: string;
  deviceCategory?: "mobile" | "desktop" | "unknown";
  /** Public token symbols only (never addresses or amounts). */
  tokenIn?: string;
  tokenOut?: string;
  /** Route-quality fields: ratios/bps and gas units only, never raw amounts. */
  priceImpactBps?: number;
  slippageBps?: number;
  /** actual output / quoted output in bps (10000 = exactly as quoted). */
  amountOutRatioBps?: number;
  poolFeesBps?: number;
  flowbridgeFeeBps?: number;
  gasEstimate?: number;
  gasUsed?: number;
  amountBucket?: "lt_1" | "1_10" | "10_100" | "100_1k" | "gte_1k" | "unknown";
  sessionHash?: string;
}

/** Keep only plausible public token symbols. */
export function sanitizeSymbol(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  return /^[A-Za-z0-9.$_-]{1,16}$/.test(v) ? v.toUpperCase() : undefined;
}

const intOrUndef = (v: number | undefined, min: number, max: number) =>
  v == null || !Number.isFinite(v) ? undefined : Math.max(min, Math.min(max, Math.round(v)));

export function sanitizeTradeEvent(event: TradeOperationalEvent, fallbackDevice: "mobile" | "desktop" | "unknown" = "unknown"): TradeOperationalEvent {
  return {
    ...event,
    dex: event.dex.slice(0, 80),
    transactionCount: Math.max(0, Math.min(20, Math.floor(event.transactionCount))),
    durationMs: intOrUndef(event.durationMs, 0, 3_600_000),
    failureReason: sanitizeFailureReason(event.failureReason),
    deviceCategory: event.deviceCategory ?? fallbackDevice,
    tokenIn: sanitizeSymbol(event.tokenIn),
    tokenOut: sanitizeSymbol(event.tokenOut),
    priceImpactBps: intOrUndef(event.priceImpactBps, 0, 10_000),
    slippageBps: intOrUndef(event.slippageBps, 0, 5_000),
    amountOutRatioBps: intOrUndef(event.amountOutRatioBps, 0, 20_000),
    poolFeesBps: intOrUndef(event.poolFeesBps, 0, 10_000),
    flowbridgeFeeBps: intOrUndef(event.flowbridgeFeeBps, 0, 1_000),
    gasEstimate: intOrUndef(event.gasEstimate, 0, 50_000_000),
    gasUsed: intOrUndef(event.gasUsed, 0, 50_000_000),
    sessionHash: event.sessionHash && /^[a-f0-9]{24}$/.test(event.sessionHash) ? event.sessionHash : undefined,
  };
}

/** Coarse USD bucket so analytics never stores a trade amount. */
export function amountBucket(usd: number | null | undefined): TradeOperationalEvent["amountBucket"] {
  if (usd == null || !Number.isFinite(usd) || usd < 0) return "unknown";
  if (usd < 1) return "lt_1";
  if (usd < 10) return "1_10";
  if (usd < 100) return "10_100";
  if (usd < 1000) return "100_1k";
  return "gte_1k";
}

const queue: TradeOperationalEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

export function sanitizeFailureReason(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const lower = value.toLowerCase();
  if (lower.includes("reject")) return "user_rejected";
  if (lower.includes("allowance") || lower.includes("approval")) return "allowance_failure";
  if (lower.includes("balance") || lower.includes("fund")) return "insufficient_balance";
  if (lower.includes("minimum") || lower.includes("slippage") || lower.includes("too little")) return "minimum_output_failure";
  if (lower.includes("network") || lower.includes("chain")) return "wrong_network";
  if (lower.includes("rpc") || lower.includes("fetch") || lower.includes("timeout") || lower.includes("transport")) return "rpc_failure";
  if (lower.includes("route") || lower.includes("liquidity")) return "route_unavailable";
  if (lower.includes("revert")) return "transaction_reverted";
  return "unknown_failure";
}

function flush() {
  timer = null;
  if (typeof window === "undefined" || queue.length === 0) return;
  const events = queue.splice(0, queue.length);
  const body = JSON.stringify({ events });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/trade-events", new Blob([body], { type: "application/json" }));
      return;
    }
  } catch { /* fetch fallback */ }
  void fetch("/api/trade-events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => undefined);
}

export function trackTradeOperationalEvent(event: TradeOperationalEvent) {
  if (typeof window === "undefined") return;
  let sid: string | undefined;
  try { sid = window.localStorage.getItem("fb_ops_sid") ?? undefined; } catch { /* storage unavailable */ }
  queue.push(sanitizeTradeEvent({ sessionHash: sid, ...event }, window.innerWidth < 768 ? "mobile" : "desktop"));
  if (queue.length >= 12) return flush();
  if (!timer) timer = setTimeout(flush, 1500);
}

export interface LiquidityGapObservation {
  network: 56 | 97 | 677 | 968;
  tokenIn: string;
  tokenOut: string;
  dexPreference: string;
  dexesChecked: string[];
  directPoolFound?: boolean | null;
  multihopFound?: boolean | null;
  missingConnection?: string | null;
}

/** Record aggregate demand for a pair that produced "No liquidity route yet". */
export function trackLiquidityGap(obs: LiquidityGapObservation) {
  if (typeof window === "undefined") return;
  const tokenIn = sanitizeSymbol(obs.tokenIn);
  const tokenOut = sanitizeSymbol(obs.tokenOut);
  if (!tokenIn || !tokenOut) return;
  let sid: string | undefined;
  try { sid = window.localStorage.getItem("fb_ops_sid") ?? undefined; } catch { /* ignore */ }
  const body = JSON.stringify({ ...obs, tokenIn, tokenOut, dexesChecked: obs.dexesChecked.slice(0, 6).map((d) => d.slice(0, 24)), sessionHash: sid && /^[a-f0-9]{24}$/.test(sid) ? sid : undefined });
  void fetch("/api/liquidity-gaps", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => undefined);
}
