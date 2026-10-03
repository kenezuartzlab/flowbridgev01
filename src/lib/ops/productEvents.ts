/**
 * Privacy-safe product events (Ops + Growth Intelligence V1).
 *
 * Category-level only: no wallet address, email, signature, amount, free text
 * or AI conversation content ever leaves the browser here. Deduplication uses
 * a random per-browser identifier that is not derived from any identity.
 */
export const PRODUCT_EVENT_NAMES = [
  // journey
  "visit", "explore_opened", "wallet_connected", "account_signed_in",
  // activation / verification / binding (mirrors activationAnalytics)
  "ACTIVATION_CARD_SHOWN", "ACTIVATION_PROMPT_SHOWN", "VERIFY_STARTED", "VERIFY_EMAIL_SENT",
  "EMAIL_VERIFIED_OBSERVED", "WALLET_BINDING_STARTED", "WALLET_BOUND_OBSERVED",
  "ACTIVATION_COMPLETED_OBSERVED", "ACTIVATION_PROMPT_DECLINED", "ACTIVATION_PROMPT_SNOOZED",
  "DISCOVERY_ITEM_SHOWN", "DISCOVERY_ITEM_OPENED",
  // meaningful engagement
  "page_view", "route_details_viewed", "pool_inspected", "position_opened",
  "staking_product_reviewed", "calculator_used", "explanation_opened",
  "earn_category_viewed", "earn_action_started",
  // smart AI (category only)
  "ai_opened", "ai_route_explanation", "ai_liquidity_explanation", "ai_range_explanation",
  "ai_staking_explanation", "ai_why_no_route",
  // reliability (error constructor name only — never message text)
  "client_error",
] as const;
export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];

export const PRODUCT_AREAS = [
  "home", "discover", "learn", "trade", "liquidity", "positions", "earn", "staking",
  "campaigns", "flow_points", "activity", "account", "onboarding", "ai", "multisend", "other",
] as const;
export type ProductArea = (typeof PRODUCT_AREAS)[number];

export interface ProductEvent {
  eventName: ProductEventName;
  area: ProductArea;
  sessionHash: string;
  deviceCategory: "mobile" | "desktop" | "unknown";
  network?: number;
  /** Error constructor name only (e.g. "TypeError") — never message text. */
  errorKind?: string;
}

const SESSION_KEY = "fb_ops_sid";

export function areaForPath(pathname: string): ProductArea {
  const p = pathname.toLowerCase();
  if (p === "/" ) return "home";
  const first = p.split("/")[1] ?? "";
  const map: Record<string, ProductArea> = {
    discover: "discover", docs: "learn", learn: "learn", trade: "trade", liquidity: "liquidity",
    earn: "earn", stake: "staking", rewards: "flow_points", campaigns: "campaigns",
    activity: "activity", account: "account", assistant: "ai", multisend: "multisend",
  };
  return map[first] ?? "other";
}

function sessionHash(): string {
  try {
    let id = window.localStorage.getItem(SESSION_KEY);
    if (!id || !/^[a-f0-9]{24}$/.test(id)) {
      const bytes = new Uint8Array(12);
      crypto.getRandomValues(bytes);
      id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      window.localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "unavailable";
  }
}

export function readOpsSessionHash(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const id = sessionHash();
  return id === "unavailable" ? undefined : id;
}

const queue: ProductEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const onceKeys = new Set<string>();

function flush() {
  timer = null;
  if (queue.length === 0) return;
  const body = JSON.stringify({ events: queue.splice(0, queue.length) });
  try {
    if (navigator.sendBeacon?.("/api/product-events", new Blob([body], { type: "application/json" }))) return;
  } catch { /* fetch fallback */ }
  void fetch("/api/product-events", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => undefined);
}

/** Record one category-level product event. `once` dedupes per page load. */
export function trackProductEvent(eventName: ProductEventName, area: ProductArea, opts: { once?: boolean; network?: number } = {}) {
  if (typeof window === "undefined") return;
  if (!(PRODUCT_EVENT_NAMES as readonly string[]).includes(eventName)) return;
  if (opts.once) {
    const k = `${eventName}:${area}`;
    if (onceKeys.has(k)) return;
    onceKeys.add(k);
  }
  queue.push({
    eventName,
    area,
    sessionHash: sessionHash(),
    deviceCategory: window.innerWidth < 768 ? "mobile" : "desktop",
    ...(opts.network ? { network: opts.network } : {}),
  });
  if (queue.length >= 15) return flush();
  if (!timer) timer = setTimeout(flush, 2000);
}
