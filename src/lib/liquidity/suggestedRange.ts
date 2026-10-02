/**
 * Liquidity V1 — AI Suggested range profiles. Informational only: derived from
 * the live pool tick and tick spacing. Never promises returns; never rebalances.
 */
import { nearestUsableTick, tickToPrice, MIN_TICK, MAX_TICK } from "./v3Math";

export type RangeProfile = "wide" | "balanced" | "narrow";

/** Half-width in price multiples: wide ×/÷2, balanced ±20%, narrow ±5%. */
const WIDTH: Record<RangeProfile, number> = { wide: 2, balanced: 1.2, narrow: 1.05 };

export interface SuggestedRange {
  profile: RangeProfile;
  tickLower: number;
  tickUpper: number;
  priceLower: number;
  priceUpper: number;
  currentPrice: number;
  /** Capital concentration vs a full-range position (≈ 1/(1-(pa/pb)^¼)). */
  concentration: number;
  notes: string[];
}

export interface PoolSnapshot {
  exists: boolean;
  liquidity: bigint;
  sqrtPriceX96: bigint;
  tick: number;
  tickSpacing: number;
  dec0: number;
  dec1: number;
}

export function suggestRanges(pool: PoolSnapshot | null): SuggestedRange[] | null {
  // Fail closed: no live pool / no liquidity / no price → no suggestion.
  if (!pool || !pool.exists || pool.liquidity <= 0n || pool.sqrtPriceX96 <= 0n || !(pool.tickSpacing > 0)) return null;
  const cur = tickToPrice(pool.tick, pool.dec0, pool.dec1);
  return (Object.keys(WIDTH) as RangeProfile[]).map((profile) => {
    const delta = Math.log(WIDTH[profile]) / Math.log(1.0001);
    let lo = nearestUsableTick(Math.floor(pool.tick - delta), pool.tickSpacing);
    let hi = nearestUsableTick(Math.ceil(pool.tick + delta), pool.tickSpacing);
    if (lo >= pool.tick) lo -= pool.tickSpacing;
    if (hi <= pool.tick) hi += pool.tickSpacing;
    lo = Math.max(lo, Math.ceil(MIN_TICK / pool.tickSpacing) * pool.tickSpacing);
    hi = Math.min(hi, Math.floor(MAX_TICK / pool.tickSpacing) * pool.tickSpacing);
    const ratio = Math.pow(1.0001, lo - hi);
    const concentration = 1 / (1 - Math.pow(ratio, 0.25));
    const pct = Math.round((WIDTH[profile] - 1) * 100);
    return {
      profile,
      tickLower: lo,
      tickUpper: hi,
      priceLower: tickToPrice(lo, pool.dec0, pool.dec1),
      priceUpper: tickToPrice(hi, pool.dec0, pool.dec1),
      currentPrice: cur,
      concentration,
      notes: [
        `Range covers about ${profile === "wide" ? "half to double" : `±${pct}% around`} the current price.`,
        `About ${concentration.toFixed(1)}× the capital concentration of a full-range position, so it earns a larger share of swap fees while the price stays inside.`,
        profile === "narrow"
          ? "Narrow ranges go out of range more easily. Out of range, the position earns no fees and is entirely one token."
          : "Out of range, the position earns no fees and is entirely one token.",
        "Fees depend on future trading volume. None are guaranteed, and nothing is rebalanced automatically.",
      ],
    };
  });
}
