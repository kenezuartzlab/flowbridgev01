/** Liquidity V1 — Create Pool validation (pure). */
import { isAddress } from "viem";
import { priceToSqrtPriceX96 } from "./v3Math";

export interface PoolTokenInput { address: string; decimals: number; symbol: string }

export type CreatePoolCheck =
  | { ok: true; token0: PoolTokenInput; token1: PoolTokenInput; flipped: boolean; priceAinB: number; priceBinA: number; sqrtPriceX96?: bigint }
  | { ok: false; reason: string };

export function sortTokens<T extends { address: string }>(a: T, b: T): [T, T, boolean] {
  return a.address.toLowerCase() < b.address.toLowerCase() ? [a, b, false] : [b, a, true];
}

export function reciprocalPrices(priceAinB: string): { aInB: number; bInA: number } {
  const p = Number(priceAinB);
  if (!/^\s*\d+(\.\d+)?\s*$/.test(priceAinB) || !(p > 0) || !Number.isFinite(p)) throw new Error("Enter a valid initial price greater than zero");
  return { aInB: p, bInA: 1 / p };
}

export function validateCreatePool(input: {
  version: "v2" | "v3";
  tokenA: PoolTokenInput;
  tokenB: PoolTokenInput;
  feeTier?: number;
  enabledFeeTiers: readonly number[];
  existingPool: string | null;
  /** 1 Token A = X Token B */
  priceAinB: string;
  priceConfirmed: boolean;
}): CreatePoolCheck {
  const { tokenA, tokenB } = input;
  if (!isAddress(tokenA.address) || !isAddress(tokenB.address)) return { ok: false, reason: "Invalid token address" };
  if (tokenA.address.toLowerCase() === tokenB.address.toLowerCase()) return { ok: false, reason: "Choose two different tokens" };
  for (const t of [tokenA, tokenB]) if (!Number.isInteger(t.decimals) || t.decimals < 0 || t.decimals > 36) return { ok: false, reason: `Unsupported decimals for ${t.symbol}` };
  if (input.version === "v3" && (input.feeTier == null || !input.enabledFeeTiers.includes(input.feeTier))) return { ok: false, reason: "Unsupported fee tier" };
  if (input.existingPool && !/^0x0{40}$/i.test(input.existingPool)) return { ok: false, reason: "This pool already exists — add liquidity to it instead" };
  let pr;
  try { pr = reciprocalPrices(input.priceAinB); } catch (e) { return { ok: false, reason: (e as Error).message }; }
  if (!input.priceConfirmed) return { ok: false, reason: "Confirm the initial price in both directions" };
  const [t0, t1, flipped] = sortTokens(tokenA, tokenB);
  let sqrtPriceX96: bigint | undefined;
  if (input.version === "v3") {
    // Pool price is token1 per token0.
    try { sqrtPriceX96 = priceToSqrtPriceX96(input.priceAinB.trim(), t0.decimals, t1.decimals, flipped); } catch (e) { return { ok: false, reason: (e as Error).message }; }
  }
  return { ok: true, token0: t0, token1: t1, flipped, priceAinB: pr.aInB, priceBinA: pr.bInA, sqrtPriceX96 };
}

/** Token B raw units from a human B/A price, rounded down without Number conversion. */
export function initialPairedAmount(amountA: bigint, price: string, decA: number, decB: number): bigint {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(price.trim());
  if (!m || amountA <= 0n) throw new Error("Invalid initial amount or price");
  const frac = m[2] ?? "";
  if (frac.length > 36) throw new Error("Price supports at most 36 decimal places");
  const numerator = BigInt(m[1] + frac);
  return amountA * numerator * 10n ** BigInt(decB) / (10n ** BigInt(frac.length + decA));
}
