/**
 * Liquidity V1 — exact BDEX V3 (Uniswap-V3-compatible) math in bigint.
 * TickMath / LiquidityAmounts ports plus UI helpers. Pure: no I/O.
 */
export const MIN_TICK = -887272;
export const MAX_TICK = 887272;
export const Q96 = 1n << 96n;
const Q192 = Q96 * Q96;
const MAX_UINT256 = (1n << 256n) - 1n;

const TICK_CONSTS: [number, bigint][] = [
  [0x2, 0xfff97272373d413259a46990580e213an],
  [0x4, 0xfff2e50f5f656932ef12357cf3c7fdccn],
  [0x8, 0xffe5caca7e10e4e61c3624eaa0941cd0n],
  [0x10, 0xffcb9843d60f6159c9db58835c926644n],
  [0x20, 0xff973b41fa98c081472e6896dfb254c0n],
  [0x40, 0xff2ea16466c96a3843ec78b326b52861n],
  [0x80, 0xfe5dee046a99a2a811c461f1969c3053n],
  [0x100, 0xfcbe86c7900a88aedcffc83b479aa3a4n],
  [0x200, 0xf987a7253ac413176f2b074cf7815e54n],
  [0x400, 0xf3392b0822b70005940c7a398e4b70f3n],
  [0x800, 0xe7159475a2c29b7443b29c7fa6e889d9n],
  [0x1000, 0xd097f3bdfd2022b8845ad8f792aa5825n],
  [0x2000, 0xa9f746462d870fdf8a65dc1f90e061e5n],
  [0x4000, 0x70d869a156d2a1b890bb3df62baf32f7n],
  [0x8000, 0x31be135f97d08fd981231505542fcfa6n],
  [0x10000, 0x9aa508b5b7a84e1c677de54f3e99bc9n],
  [0x20000, 0x5d6af8dedb81196699c329225ee604n],
  [0x40000, 0x2216e584f5fa1ea926041bedfe98n],
  [0x80000, 0x48a170391f7dc42444e8fa2n],
];

export function getSqrtRatioAtTick(tick: number): bigint {
  if (!Number.isInteger(tick) || tick < MIN_TICK || tick > MAX_TICK) throw new Error("Tick out of range");
  const abs = Math.abs(tick);
  let ratio = abs & 1 ? 0xfffcb933bd6fad37aa2d162d1a594001n : 0x100000000000000000000000000000000n;
  for (const [bit, c] of TICK_CONSTS) if (abs & bit) ratio = (ratio * c) >> 128n;
  if (tick > 0) ratio = MAX_UINT256 / ratio;
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}

export function sqrtBig(n: bigint): bigint {
  if (n < 0n) throw new Error("negative");
  if (n < 2n) return n;
  let x = n, y = (x + 1n) >> 1n;
  while (y < x) { x = y; y = (x + n / x) >> 1n; }
  return x;
}

/** Raw (token1 per token0, in base units) price from sqrtPriceX96, as a float for display. */
export function sqrtPriceX96ToRawPrice(sqrtPriceX96: bigint): number {
  const s = Number(sqrtPriceX96) / Number(Q96);
  return s * s;
}

/** Human price of token0 in token1 units. */
export function tickToPrice(tick: number, dec0: number, dec1: number): number {
  return Math.pow(1.0001, tick) * Math.pow(10, dec0 - dec1);
}

export function priceToTick(price: number, dec0: number, dec1: number): number {
  if (!(price > 0) || !Number.isFinite(price)) throw new Error("Invalid price");
  const raw = price * Math.pow(10, dec1 - dec0);
  return Math.floor(Math.log(raw) / Math.log(1.0001));
}

export function nearestUsableTick(tick: number, spacing: number): number {
  if (!(spacing > 0)) throw new Error("Invalid tick spacing");
  const r = Math.round(tick / spacing) * spacing;
  const min = Math.ceil(MIN_TICK / spacing) * spacing;
  const max = Math.floor(MAX_TICK / spacing) * spacing;
  return Math.min(max, Math.max(min, r));
}

export function fullRangeTicks(spacing: number): { tickLower: number; tickUpper: number } {
  return { tickLower: Math.ceil(MIN_TICK / spacing) * spacing, tickUpper: Math.floor(MAX_TICK / spacing) * spacing };
}

export type RangeValidation = { ok: true } | { ok: false; reason: string };

export function validateRange(tickLower: number, tickUpper: number, spacing: number): RangeValidation {
  if (!Number.isInteger(tickLower) || !Number.isInteger(tickUpper)) return { ok: false, reason: "Ticks must be whole numbers" };
  if (tickLower >= tickUpper) return { ok: false, reason: "Lower price must be below upper price" };
  if (tickLower < MIN_TICK || tickUpper > MAX_TICK) return { ok: false, reason: "Range is outside the supported price bounds" };
  if (tickLower % spacing !== 0 || tickUpper % spacing !== 0) return { ok: false, reason: `Ticks must be multiples of the pool tick spacing (${spacing})` };
  return { ok: true };
}

export type RangeStatus = "in-range" | "below-range" | "above-range" | "closed";

/** below-range: price under lower tick → position is 100% token0. */
export function rangeStatus(currentTick: number, tickLower: number, tickUpper: number, liquidity: bigint): RangeStatus {
  if (liquidity === 0n) return "closed";
  if (currentTick < tickLower) return "below-range";
  if (currentTick >= tickUpper) return "above-range";
  return "in-range";
}

/** Price string "1.5" (token1 per token0, human) → sqrtPriceX96 using exact integer math. */
export function priceToSqrtPriceX96(price: string, dec0: number, dec1: number): bigint {
  const m = /^\s*(\d+)(?:\.(\d+))?\s*$/.exec(price);
  if (!m) throw new Error("Invalid price");
  const frac = (m[2] ?? "").slice(0, 36);
  let num = BigInt(m[1] + frac);
  let den = 10n ** BigInt(frac.length);
  if (num === 0n) throw new Error("Price must be greater than zero");
  if (dec1 >= dec0) num *= 10n ** BigInt(dec1 - dec0);
  else den *= 10n ** BigInt(dec0 - dec1);
  const s = sqrtBig((num * Q192) / den);
  if (s < 4295128739n || s >= 1461446703485210103287273052203988822378723970342n) throw new Error("Price is outside the supported range");
  return s;
}

// ── LiquidityAmounts ────────────────────────────────────────────────────────
const sortS = (a: bigint, b: bigint) => (a > b ? [b, a] : [a, b]);

export function liquidityForAmount0(sa: bigint, sb: bigint, amount0: bigint): bigint {
  [sa, sb] = sortS(sa, sb);
  return (amount0 * ((sa * sb) / Q96)) / (sb - sa);
}
export function liquidityForAmount1(sa: bigint, sb: bigint, amount1: bigint): bigint {
  [sa, sb] = sortS(sa, sb);
  return (amount1 * Q96) / (sb - sa);
}
export function liquidityForAmounts(sp: bigint, sa: bigint, sb: bigint, a0: bigint, a1: bigint): bigint {
  [sa, sb] = sortS(sa, sb);
  if (sp <= sa) return liquidityForAmount0(sa, sb, a0);
  if (sp < sb) {
    const l0 = liquidityForAmount0(sp, sb, a0);
    const l1 = liquidityForAmount1(sa, sp, a1);
    return l0 < l1 ? l0 : l1;
  }
  return liquidityForAmount1(sa, sb, a1);
}
export function amountsForLiquidity(sp: bigint, sa: bigint, sb: bigint, L: bigint): { amount0: bigint; amount1: bigint } {
  [sa, sb] = sortS(sa, sb);
  const a0 = (s1: bigint, s2: bigint) => (((L << 96n) * (s2 - s1)) / s2) / s1;
  const a1 = (s1: bigint, s2: bigint) => (L * (s2 - s1)) / Q96;
  if (sp <= sa) return { amount0: a0(sa, sb), amount1: 0n };
  if (sp < sb) return { amount0: a0(sp, sb), amount1: a1(sa, sp) };
  return { amount0: 0n, amount1: a1(sa, sb) };
}

/** Given amount0 desired, the amount1 needed at the current price for a range (and vice versa). */
export function pairedAmount(sp: bigint, tickLower: number, tickUpper: number, amount: bigint, side: 0 | 1): bigint {
  const sa = getSqrtRatioAtTick(tickLower), sb = getSqrtRatioAtTick(tickUpper);
  if (sp <= sa) return 0n;
  if (sp >= sb) return 0n;
  const L = side === 0 ? liquidityForAmount0(sp, sb, amount) : liquidityForAmount1(sa, sp, amount);
  const r = amountsForLiquidity(sp, sa, sb, L);
  return side === 0 ? r.amount1 : r.amount0;
}

export function applySlippage(amount: bigint, slippageBps: number): bigint {
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 5000) throw new Error("Invalid slippage");
  return (amount * BigInt(10_000 - slippageBps)) / 10_000n;
}
