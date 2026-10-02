/** Liquidity V1 — Uniswap-V2-style pair math (BDEX V2 and CaSwap). Pure. */
import { applySlippage } from "./v3Math";

export interface PairReserves {
  reserveA: bigint;
  reserveB: bigint;
  totalSupply: bigint;
}

/** Amount of B matching amountA at the pool's actual ratio (router `quote`). */
export function quoteV2(amountA: bigint, reserveA: bigint, reserveB: bigint): bigint {
  if (amountA <= 0n) throw new Error("Amount must be greater than zero");
  if (reserveA <= 0n || reserveB <= 0n) throw new Error("Pool has no liquidity");
  return (amountA * reserveB) / reserveA;
}

export interface AddPlan {
  amountADesired: bigint;
  amountBDesired: bigint;
  amountAMin: bigint;
  amountBMin: bigint;
  newPair: boolean;
  /** Estimated LP minted (0 for a new pair — depends on MINIMUM_LIQUIDITY). */
  estimatedLp: bigint;
  shareBps: number;
}

export function planAddV2(
  amountA: bigint,
  amountB: bigint | null,
  pool: PairReserves | null,
  slippageBps: number,
  balances: { a: bigint; b: bigint },
): AddPlan {
  if (amountA <= 0n) throw new Error("Amount must be greater than zero");
  const newPair = !pool || pool.reserveA === 0n || pool.reserveB === 0n;
  const b = newPair ? amountB : quoteV2(amountA, pool!.reserveA, pool!.reserveB);
  if (b == null || b <= 0n) throw new Error("Enter both amounts for a new pool");
  if (amountA > balances.a || b > balances.b) throw new Error("Insufficient balance");
  let lp = 0n, shareBps = 10_000;
  if (!newPair) {
    const la = (amountA * pool!.totalSupply) / pool!.reserveA;
    const lb = (b * pool!.totalSupply) / pool!.reserveB;
    lp = la < lb ? la : lb;
    shareBps = Number((lp * 10_000n) / (pool!.totalSupply + lp));
  }
  return {
    amountADesired: amountA,
    amountBDesired: b,
    // New pair: the ratio is set by the user, so minimums equal desired amounts.
    amountAMin: newPair ? amountA : applySlippage(amountA, slippageBps),
    amountBMin: newPair ? b : applySlippage(b, slippageBps),
    newPair,
    estimatedLp: lp,
    shareBps,
  };
}

export interface RemovePlan {
  liquidity: bigint;
  expectedA: bigint;
  expectedB: bigint;
  amountAMin: bigint;
  amountBMin: bigint;
}

export function planRemoveV2(lpBalance: bigint, pctOrAmount: { pct?: number; amount?: bigint }, pool: PairReserves, slippageBps: number): RemovePlan {
  let liq: bigint;
  if (pctOrAmount.amount != null) liq = pctOrAmount.amount;
  else {
    const p = pctOrAmount.pct ?? 0;
    if (!(p > 0 && p <= 100)) throw new Error("Choose a percentage between 1 and 100");
    liq = (lpBalance * BigInt(Math.round(p * 100))) / 10_000n;
  }
  if (liq <= 0n) throw new Error("Amount must be greater than zero");
  if (liq > lpBalance) throw new Error("Insufficient LP balance");
  if (pool.totalSupply === 0n) throw new Error("Pool has no liquidity");
  const expectedA = (liq * pool.reserveA) / pool.totalSupply;
  const expectedB = (liq * pool.reserveB) / pool.totalSupply;
  return { liquidity: liq, expectedA, expectedB, amountAMin: applySlippage(expectedA, slippageBps), amountBMin: applySlippage(expectedB, slippageBps) };
}

export function lpShareBps(lpBalance: bigint, totalSupply: bigint): number {
  if (totalSupply === 0n) return 0;
  return Number((lpBalance * 10_000n) / totalSupply);
}

/** Deadline in unix seconds; rejects a past/zero window. */
export function deadlineFrom(nowSec: number, minutes: number): bigint {
  if (!(minutes >= 1 && minutes <= 60)) throw new Error("Deadline must be between 1 and 60 minutes");
  return BigInt(Math.floor(nowSec) + Math.round(minutes * 60));
}

export function isExpired(deadline: bigint, nowSec: number): boolean {
  return BigInt(Math.floor(nowSec)) >= deadline;
}
