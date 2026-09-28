// Exact Uniswap-V3 concentrated-liquidity math (BigInt, faithful port of
// TickMath / SqrtPriceMath / SwapMath). Pure — no network, no writes.
export const Q96 = 1n << 96n;
export const MIN_TICK = -887272;
export const MAX_TICK = 887272;
export const MIN_SQRT = 4295128739n;
export const MAX_SQRT = 1461446703485210103287273052203988822378723970342n;

const mulDiv = (a, b, d) => (a * b) / d;
const mulDivUp = (a, b, d) => { const p = a * b; return p / d + (p % d === 0n ? 0n : 1n); };
const divUp = (a, b) => a / b + (a % b === 0n ? 0n : 1n);

export function getSqrtRatioAtTick(tick) {
  const absTick = BigInt(tick < 0 ? -tick : tick);
  if (absTick > BigInt(MAX_TICK)) throw new Error("T");
  let r = (absTick & 1n) !== 0n ? 0xfffcb933bd6fad37aa2d162d1a594001n : 0x100000000000000000000000000000000n;
  const m = [
    [0x2n, 0xfff97272373d413259a46990580e213an], [0x4n, 0xfff2e50f5f656932ef12357cf3c7fdccn],
    [0x8n, 0xffe5caca7e10e4e61c3624eaa0941cd0n], [0x10n, 0xffcb9843d60f6159c9db58835c926644n],
    [0x20n, 0xff973b41fa98c081472e6896dfb254c0n], [0x40n, 0xff2ea16466c96a3843ec78b326b52861n],
    [0x80n, 0xfe5dee046a99a2a811c461f1969c3053n], [0x100n, 0xfcbe86c7900a88aedcffc83b479aa3a4n],
    [0x200n, 0xf987a7253ac413176f2b074cf7815e54n], [0x400n, 0xf3392b0822b70005940c7a398e4b70f3n],
    [0x800n, 0xe7159475a2c29b7443b29c7fa6e889d9n], [0x1000n, 0xd097f3bdfd2022b8845ad8f792aa5825n],
    [0x2000n, 0xa9f746462d870fdf8a65dc1f90e061e5n], [0x4000n, 0x70d869a156d2a1b890bb3df62baf32f7n],
    [0x8000n, 0x31be135f97d08fd981231505542fcfa6n], [0x10000n, 0x9aa508b5b7a84e1c677de54f3e99bc9n],
    [0x20000n, 0x5d6af8dedb81196699c329225ee604n], [0x40000n, 0x2216e584f5fa1ea926041bedfe98n],
    [0x80000n, 0x48a170391f7dc42444e8fa2n],
  ];
  for (const [bit, mul] of m) if ((absTick & bit) !== 0n) r = (r * mul) >> 128n;
  if (tick > 0) r = ((1n << 256n) - 1n) / r;
  return (r >> 32n) + (r % (1n << 32n) === 0n ? 0n : 1n);
}

// amount0 between two sqrt prices (token0 = x)
export function amount0Delta(a, b, L, up) {
  if (a > b) [a, b] = [b, a];
  const num1 = L << 96n, num2 = b - a;
  return up ? divUp(mulDivUp(num1, num2, b), a) : mulDiv(num1, num2, b) / a;
}
export function amount1Delta(a, b, L, up) {
  if (a > b) [a, b] = [b, a];
  return up ? mulDivUp(L, b - a, Q96) : mulDiv(L, b - a, Q96);
}

/**
 * Exact-to-target swap: move sqrtP to `target` across initialized ticks.
 * ticks: sorted array of { tick, liquidityNet } (initialized ticks only).
 * Returns net/gross input, output, fee, ticks crossed, end state, and whether
 * the path left all liquidity (one-sided / out of range).
 */
export function swapToTarget({ sqrtP, tick, L, ticks, feePips, target }) {
  const zeroForOne = target < sqrtP;
  let s = sqrtP, liq = L, amountInNet = 0n, amountOut = 0n, feePaid = 0n, crossed = 0;
  let exhausted = false;
  const fee = BigInt(feePips);
  let curTick = tick;
  while (s !== target) {
    // next initialized tick in swap direction
    let next;
    if (zeroForOne) { for (let i = ticks.length - 1; i >= 0; i--) if (ticks[i].tick <= curTick) { next = ticks[i]; break; } }
    else { for (const t of ticks) if (t.tick > curTick) { next = t; break; } }
    const nextSqrt = next ? getSqrtRatioAtTick(next.tick) : (zeroForOne ? MIN_SQRT : MAX_SQRT);
    const stepTarget = zeroForOne ? (nextSqrt < target ? target : nextSqrt) : (nextSqrt > target ? target : nextSqrt);
    if (liq > 0n) {
      const inNet = zeroForOne ? amount0Delta(stepTarget, s, liq, true) : amount1Delta(s, stepTarget, liq, true);
      const out = zeroForOne ? amount1Delta(stepTarget, s, liq, false) : amount0Delta(s, stepTarget, liq, false);
      const stepFee = mulDivUp(inNet, fee, 1000000n - fee);
      amountInNet += inNet; amountOut += out; feePaid += stepFee;
    } else exhausted = true;
    s = stepTarget;
    if (next && s === nextSqrt) {
      liq = zeroForOne ? liq - next.liquidityNet : liq + next.liquidityNet;
      curTick = zeroForOne ? next.tick - 1 : next.tick;
      crossed++;
    } else if (!next && s !== target) break;
  }
  return { zeroForOne, amountInNet, amountInGross: amountInNet + feePaid, amountOut, feePaid, ticksCrossed: crossed, endSqrt: s, endLiquidity: liq, exhaustedLiquidity: exhausted || liq === 0n };
}

export function bigSqrt(n) {
  if (n < 2n) return n;
  let x = n, y = (x + 1n) >> 1n;
  while (y < x) { x = y; y = (x + n / x) >> 1n; }
  return x;
}
/** sqrtPriceX96 after multiplying the raw price by (num/den). */
export function scaleSqrt(sqrtP, num, den) { return bigSqrt((sqrtP * sqrtP * num) / den); }

/** Token amounts for liquidity dL at sqrtP within [a,b]. */
export function amountsForLiquidity(sqrtP, a, b, dL) {
  if (sqrtP <= a) return { amount0: amount0Delta(a, b, dL, true), amount1: 0n };
  if (sqrtP >= b) return { amount0: 0n, amount1: amount1Delta(a, b, dL, true) };
  return { amount0: amount0Delta(sqrtP, b, dL, true), amount1: amount1Delta(a, sqrtP, dL, true) };
}
