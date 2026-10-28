import { describe, expect, it } from "vitest";
import { assertLiquidityExecution, approvalAmounts, parseSlippagePercent } from "./executionSafety";
import { getVenue } from "./venues";
import { initialPairedAmount, validateCreatePool } from "./createPool";
import { priceToSqrtPriceX96, Q96 } from "./v3Math";
import { operationStatus } from "./lifecycle";

const wallet = "0x1000000000000000000000000000000000000001";
const v2 = getVenue(968, "bdex-v2");
if (!v2 || v2.kind !== "v2") throw new Error("Missing Testnet venue");
const base = { chainId: 968, walletChainId: 968, wallet, expectedWallet: wallet, dex: v2.label, kind: "add-liquidity" as const, target: v2.router };

describe("Liquidity signature boundary", () => {
  it("rejects unknown networks even when called outside UI", () => expect(() => assertLiquidityExecution({ ...base, chainId: 1, walletChainId: 1 })).toThrow("not enabled"));
  it("rejects a changed account", () => expect(() => assertLiquidityExecution({ ...base, wallet: "0x2000000000000000000000000000000000000002" })).toThrow("Wallet changed"));
  it("rejects a wrong wallet chain", () => expect(() => assertLiquidityExecution({ ...base, walletChainId: 677 })).toThrow("Switch"));
  it("rejects a substituted contract", () => expect(() => assertLiquidityExecution({ ...base, target: wallet })).toThrow("does not match"));
  it("allows supported Testnet add", () => expect(() => assertLiquidityExecution(base)).not.toThrow());
  it("rejects public CaSwap add but allows existing LP removal", () => {
    const ca = getVenue(968, "caswap");
    if (!ca || ca.kind !== "v2") throw new Error("Missing CaSwap");
    expect(() => assertLiquidityExecution({ ...base, dex: ca.label, target: ca.router })).toThrow("not supported");
    expect(() => assertLiquidityExecution({ ...base, dex: ca.label, target: ca.router, kind: "remove-liquidity" })).not.toThrow();
  });
});

describe("Exact allowances", () => {
  it("never grants unlimited approval or silently retains excess", () => expect(approvalAmounts((1n << 256n) - 1n, 100n)).toEqual([0n, 100n]));
  it("skips an already exact allowance", () => expect(approvalAmounts(100n, 100n)).toEqual([]));
  it("approves only required units from zero", () => expect(approvalAmounts(0n, 100n)).toEqual([100n]));
  it("blocks zero approvals", () => expect(() => approvalAmounts(0n, 0n)).toThrow());
});

describe("Exact initial prices", () => {
  it("preserves large deposit units with six-decimal token B", () => expect(initialPairedAmount(123456789012345678901234567890n, "2.5", 18, 6)).toBe(308641972530864197n));
  it("rounds tiny output down instead of rounding a deposit up", () => expect(initialPairedAmount(1n, "0.5", 6, 6)).toBe(0n));
  it("encodes flipped scientific-scale prices without removing exponents", () => {
    const r = validateCreatePool({ version: "v3", tokenA: { address: "0x2000000000000000000000000000000000000002", decimals: 18, symbol: "A" }, tokenB: { address: wallet, decimals: 18, symbol: "B" }, feeTier: 3000, enabledFeeTiers: [3000], existingPool: null, priceAinB: "100000000000000000000", priceConfirmed: true });
    if (!r.ok) throw new Error(r.reason);
    expect(r.sqrtPriceX96).toBe(priceToSqrtPriceX96("0.00000000000000000001", 18, 18));
    expect(r.sqrtPriceX96).toBeLessThan(Q96);
  });
});

describe("Honest lifecycle and slippage", () => {
  it("successful approval does not imply a completed deposit", () => expect(operationStatus({ txs: [{ hash: "0x1", label: "approval", phase: "confirmed" }], completed: false }).phase).toBe("confirming"));
  it("failed deposit after approval remains failed", () => expect(operationStatus({ txs: [{ hash: "0x1", label: "approval", phase: "confirmed" }], completed: false, error: "Simulation reverted" }).phase).toBe("failed"));
  it("does not invent a default for invalid slippage", () => { expect(parseSlippagePercent("abc")).toBeNull(); expect(parseSlippagePercent("0")).toBeNull(); expect(parseSlippagePercent("50.01")).toBeNull(); expect(parseSlippagePercent("0.5")).toBe(50); });
});