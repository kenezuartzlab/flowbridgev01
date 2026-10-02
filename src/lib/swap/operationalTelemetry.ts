export type TradeOperationalEventName =
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
  queue.push({
    ...event,
    dex: event.dex.slice(0, 80),
    transactionCount: Math.max(0, Math.min(20, Math.floor(event.transactionCount))),
    durationMs: event.durationMs == null ? undefined : Math.max(0, Math.min(3_600_000, Math.floor(event.durationMs))),
    failureReason: sanitizeFailureReason(event.failureReason),
    deviceCategory: event.deviceCategory ?? (window.innerWidth < 768 ? "mobile" : "desktop"),
  });
  if (queue.length >= 12) return flush();
  if (!timer) timer = setTimeout(flush, 1500);
}
