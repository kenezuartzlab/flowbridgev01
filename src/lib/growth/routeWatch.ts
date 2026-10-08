/**
 * V34 — opt-in route availability watch (browser presentation state).
 * Stores only token symbols + chain. Never trades, never asks for signatures.
 */
export interface RouteWatch { from: string; to: string; chainId: number; lastAvailable: boolean; notifiedAt?: number }

const KEY = "flowbridge.v34.routeWatch";
const MAX = 10;

export function readRouteWatches(): RouteWatch[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((w) => typeof w?.from === "string" && typeof w?.to === "string").slice(0, MAX) : [];
  } catch { return []; }
}

function write(list: RouteWatch[]) {
  if (typeof window !== "undefined") try { window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch { /* presentation */ }
  return list;
}

export const watchKey = (w: Pick<RouteWatch, "from" | "to" | "chainId">) => `${w.chainId}:${w.from.toUpperCase()}>${w.to.toUpperCase()}`;

export function addRouteWatch(list: RouteWatch[], w: Omit<RouteWatch, "lastAvailable">): RouteWatch[] {
  if (list.some((x) => watchKey(x) === watchKey(w))) return list;
  return [...list, { ...w, from: w.from.toUpperCase(), to: w.to.toUpperCase(), lastAvailable: false }].slice(0, MAX);
}
export function removeRouteWatch(list: RouteWatch[], key: string) { return list.filter((x) => watchKey(x) !== key); }

/** Pure transition: returns updated watches and the routes that BECAME available. */
export function applyRouteChecks(list: RouteWatch[], available: Record<string, boolean>, now: number) {
  const became: RouteWatch[] = [];
  const next = list.map((w) => {
    const k = watchKey(w);
    if (!(k in available)) return w;
    const isAvail = available[k];
    if (isAvail && !w.lastAvailable) { became.push(w); return { ...w, lastAvailable: true, notifiedAt: now }; }
    return { ...w, lastAvailable: isAvail };
  });
  return { next, became };
}

export const saveRouteWatches = write;
