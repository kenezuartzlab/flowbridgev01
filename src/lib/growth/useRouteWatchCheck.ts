/**
 * V34 — checks opted-in watched routes with a read-only quote (at most every
 * 10 minutes). Returns routes that BECAME available. Never trades or signs.
 */
import { useEffect, useState } from "react";
import { applyRouteChecks, readRouteWatches, saveRouteWatches, watchKey, type RouteWatch } from "./routeWatch";

const KEY = "flowbridge.v34.routeWatch.checkedAt";
const EVERY = 10 * 60_000;

export function useRouteWatchCheck() {
  const [became, setBecame] = useState<RouteWatch[]>(() => []);
  useEffect(() => {
    const list = readRouteWatches();
    if (!list.length) return;
    // Previously-notified watches stay visible until dismissed (stable ids dedupe).
    setBecame(list.filter((w) => w.lastAvailable));
    const last = Number(window.localStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < EVERY) return;
    window.localStorage.setItem(KEY, String(Date.now()));
    let off = false;
    void (async () => {
      const [{ getCuratedTokens }, { getBestRoute }, { parseUnits }] = await Promise.all([
        import("@/lib/swap/tokenRegistry"), import("@/lib/swap/quoter"), import("viem"),
      ]);
      const avail: Record<string, boolean> = {};
      for (const w of list) {
        const mainnet = w.chainId === 677;
        const toks = getCuratedTokens(mainnet);
        const a = toks.find((t) => t.symbol.toUpperCase() === w.from);
        const b = toks.find((t) => t.symbol.toUpperCase() === w.to);
        if (!a || !b) continue;
        try { avail[watchKey(w)] = !!(await getBestRoute(a, b, parseUnits("1", a.decimals), mainnet)); } catch { /* unknown, skip */ }
      }
      if (off) return;
      const { next } = applyRouteChecks(list, avail, Date.now());
      saveRouteWatches(next);
      setBecame(next.filter((w) => w.lastAvailable));
    })();
    return () => { off = true; };
  }, []);
  return became;
}
