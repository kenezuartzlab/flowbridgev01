import { describe, expect, it } from "vitest";
import {
  buildMultiSendPlan,
  equalSplit,
  DEFAULT_FEE_BPS,
  NATIVE_GAS_RESERVE_WEI,
  quoteFee,
  quoteMaxRecipientsTotal,
  quotePercentRecipientsTotal,
  quoteRequiredSpend,
  spendableBalance,
  validateSourceAffordability,
} from "./planner";
import type { Address, TransferRow } from "./types";

const A = "0x1111111111111111111111111111111111111111" as Address;
const B = "0x2222222222222222222222222222222222222222" as Address;
const C = "0x3333333333333333333333333333333333333333" as Address;
const D = "0x4444444444444444444444444444444444444444" as Address;
const BATCH = `0x${"ab".repeat(32)}` as `0x${string}`;

const row = (id: string, source: Address, recipient: Address, amount: bigint): TransferRow => ({
  id,
  source,
  recipient,
  amount,
});

describe("MultiSend fee math", () => {
  it("charges 0.01% by default", () => {
    expect(DEFAULT_FEE_BPS).toBe(1);
    expect(quoteFee(10_000n * 10n ** 18n, 1)).toBe(10n ** 18n); // 10,000 -> 1
    expect(quoteRequiredSpend(10_000n * 10n ** 18n, 1)).toBe(10_001n * 10n ** 18n);
  });

  it("supports a zero fee and the 1% hard cap, and rejects anything above it", () => {
    expect(quoteFee(1000n, 0)).toBe(0n);
    expect(quoteFee(1000n, 100)).toBe(10n);
    expect(() => quoteFee(1000n, 101)).toThrow();
  });

  it("MAX never exceeds the balance once the fee is added", () => {
    for (const bps of [0, 1, 25, 100]) {
      const balance = 123_456_789_987_654_321n;
      const total = quoteMaxRecipientsTotal(balance, bps);
      expect(quoteRequiredSpend(total, bps)).toBeLessThanOrEqual(balance);
      expect(quoteRequiredSpend(total + 1n, bps)).toBeGreaterThan(balance);
    }
  });

  it("MAX on a native asset keeps the protected gas reserve", () => {
    const balance = 5n * 10n ** 18n;
    const spendable = spendableBalance({ balance, isNative: true });
    expect(spendable).toBe(balance - NATIVE_GAS_RESERVE_WEI);
    const total = quoteMaxRecipientsTotal(spendable, 1);
    expect(quoteRequiredSpend(total, 1) + NATIVE_GAS_RESERVE_WEI).toBeLessThanOrEqual(balance);
    expect(total).toBeGreaterThan(0n);
  });

  it("never treats MAX as draining native balance to zero", () => {
    const balance = NATIVE_GAS_RESERVE_WEI / 2n;
    expect(spendableBalance({ balance, isNative: true })).toBe(0n);
    expect(quoteMaxRecipientsTotal(0n, 1)).toBe(0n);
  });

  it("resolves percentages to exact base units", () => {
    const balance = 10n ** 18n;
    const half = quotePercentRecipientsTotal({ balance, isNative: false, feeBps: 1, percent: 50 });
    expect(quoteRequiredSpend(half, 1)).toBeLessThanOrEqual(balance / 2n);
    expect(() => quotePercentRecipientsTotal({ balance, isNative: false, feeBps: 1, percent: 0 })).toThrow();
  });

  it("splits a total exactly with no lost base units", () => {
    const parts = equalSplit(1000n, 3);
    expect(parts.reduce((a, b) => a + b, 0n)).toBe(1000n);
    expect(parts).toEqual([334n, 333n, 333n]);
    expect(() => equalSplit(2n, 5)).toThrow();
  });
});

describe("MultiSend planning", () => {
  it("groups Distribute into one source transaction", () => {
    const plan = buildMultiSendPlan({
      mode: "one-to-many",
      clientBatchId: BATCH,
      rows: [row("1", A, B, 100n), row("2", A, C, 200n)],
      feeBps: 1,
      maxRecipientsPerSource: 100,
    });
    expect(plan.sources).toHaveLength(1);
    expect(plan.sources[0].transactionCount).toBe(1);
    expect(plan.recipientsTotal).toBe(300n);
    expect(plan.destinationWalletCount).toBe(2);
  });

  it("groups Consolidate by source so each wallet signs once", () => {
    const plan = buildMultiSendPlan({
      mode: "many-to-one",
      clientBatchId: BATCH,
      rows: [row("1", A, D, 6_000n), row("2", B, D, 3_000n), row("3", C, D, 1_000n)],
      feeBps: 1,
      maxRecipientsPerSource: 100,
    });
    expect(plan.sourceWalletCount).toBe(3);
    expect(plan.sources.map((s) => s.transactionCount)).toEqual([1, 1, 1]);
    expect(plan.destinationWalletCount).toBe(1);
  });

  it("charges every source its own proportional fee", () => {
    const unit = 10n ** 18n;
    const plan = buildMultiSendPlan({
      mode: "many-to-one",
      clientBatchId: BATCH,
      rows: [row("1", A, D, 6_000n * unit), row("2", B, D, 3_000n * unit), row("3", C, D, 1_000n * unit)],
      feeBps: 1,
      maxRecipientsPerSource: 100,
    });
    expect(plan.sources.map((s) => s.serviceFee)).toEqual([600n * unit / 1000n, 300n * unit / 1000n, 100n * unit / 1000n]);
    expect(plan.serviceFeeTotal).toBe(unit);
    expect(plan.recipientsTotal).toBe(10_000n * unit);
  });

  it("groups Advanced rows by source", () => {
    const plan = buildMultiSendPlan({
      mode: "many-to-many",
      clientBatchId: BATCH,
      rows: [row("1", A, B, 10n), row("2", A, C, 20n), row("3", B, C, 30n)],
      feeBps: 1,
      maxRecipientsPerSource: 100,
    });
    expect(plan.sourceWalletCount).toBe(2);
    expect(plan.transferRowCount).toBe(3);
  });

  it("rejects zero amounts, self-sends, wrong mode shape and recipient overflow", () => {
    const base = { clientBatchId: BATCH, feeBps: 1, maxRecipientsPerSource: 2 } as const;
    expect(() => buildMultiSendPlan({ ...base, mode: "one-to-many", rows: [row("1", A, B, 0n)] })).toThrow();
    expect(() => buildMultiSendPlan({ ...base, mode: "one-to-many", rows: [row("1", A, A, 5n)] })).toThrow();
    expect(() =>
      buildMultiSendPlan({ ...base, mode: "one-to-many", rows: [row("1", A, B, 5n), row("2", C, B, 5n)] }),
    ).toThrow();
    expect(() =>
      buildMultiSendPlan({ ...base, mode: "many-to-one", rows: [row("1", A, B, 5n), row("2", A, C, 5n)] }),
    ).toThrow();
    expect(() =>
      buildMultiSendPlan({
        ...base,
        mode: "one-to-many",
        rows: [row("1", A, B, 5n), row("2", A, C, 5n), row("3", A, D, 5n)],
      }),
    ).toThrow();
    expect(() => buildMultiSendPlan({ ...base, mode: "one-to-many", rows: [] })).toThrow();
  });
});

describe("MultiSend affordability", () => {
  const plan = buildMultiSendPlan({
    mode: "one-to-many",
    clientBatchId: BATCH,
    rows: [row("1", A, B, 10n ** 18n)],
    feeBps: 1,
    maxRecipientsPerSource: 100,
  }).sources[0];

  it("requires transfers + fee + gas reserve for native sends", () => {
    const exact = plan.requiredAssetSpend + NATIVE_GAS_RESERVE_WEI;
    expect(validateSourceAffordability({ plan, isNative: true, assetBalance: exact, nativeBalance: exact }).ok).toBe(true);
    expect(
      validateSourceAffordability({ plan, isNative: true, assetBalance: exact - 1n, nativeBalance: exact - 1n }).ok,
    ).toBe(false);
  });

  it("requires token balance plus fee and some gas for ERC-20 sends", () => {
    expect(
      validateSourceAffordability({
        plan,
        isNative: false,
        assetBalance: plan.requiredAssetSpend,
        nativeBalance: 10n ** 16n,
      }).ok,
    ).toBe(true);
    expect(
      validateSourceAffordability({ plan, isNative: false, assetBalance: plan.requiredAssetSpend, nativeBalance: 0n }).ok,
    ).toBe(false);
    expect(
      validateSourceAffordability({
        plan,
        isNative: false,
        assetBalance: plan.recipientsTotal,
        nativeBalance: 10n ** 16n,
      }).ok,
    ).toBe(false);
  });
});
