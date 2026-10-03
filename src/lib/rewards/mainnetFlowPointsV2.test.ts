import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, pad } from "viem";

import {
  DEFAULT_FLOW_POINTS_V2_POLICY as P,
  CORE_SWAP_LEDGER_REASONS,
  FLOW_POINTS_V2_DISABLED_LEGACY_RULES,
  coreSwapAward,
  isRapidReverseRoundTrip,
  isSelfReferral,
  referralMilestonesDue,
  referralMonthlyCapReached,
  utcMonthKey,
} from "./flowPointsV2";
import {
  MAINNET_FINALITY_CONFIRMATIONS,
  MAINNET_ROUTER_V4_ADDRESS,
  verifyMainnetRouterV4CoreSwap,
  type RouterV4ReceiptEvidence,
} from "@/lib/activity/mainnetRouterV4Evidence";
import { SWAP_ACTIVITY_EVENT_ABI } from "@/lib/activity/swapActivityEvent";
import { getFlowConversionPolicy } from "./flowConversionPolicy";

const WALLET = "0x628e237b73c5a37ef3968527563fa1a26b32bb97";
const FLOW = "0xcaab50f36252a57529afef651fa6b9f9281917ff";
const NATIVE = "0x0000000000000000000000000000000000000000";
const TX = "0x" + "ab".repeat(32);

function swapLog(tokenIn: string, tokenOut: string, amountIn: bigint, opts: { emitter?: string; sender?: string; logIndex?: number } = {}) {
  const topics = encodeEventTopics({
    abi: SWAP_ACTIVITY_EVENT_ABI,
    eventName: "SwapActivity",
    args: { sender: (opts.sender ?? WALLET) as `0x${string}`, recipient: WALLET as `0x${string}`, routerId: 3n },
  });
  const data = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
    [tokenIn as `0x${string}`, tokenOut as `0x${string}`, amountIn, 1n, 0n],
  );
  return { address: opts.emitter ?? MAINNET_ROUTER_V4_ADDRESS, topics, data, logIndex: opts.logIndex ?? 4 };
}

function evidence(over: Partial<RouterV4ReceiptEvidence> = {}): RouterV4ReceiptEvidence {
  return {
    chainId: 677,
    txHash: TX,
    from: WALLET,
    to: MAINNET_ROUTER_V4_ADDRESS,
    status: "success",
    blockNumber: 1000,
    headBlockNumber: 1000 + MAINNET_FINALITY_CONFIRMATIONS,
    blockTimestamp: 1_790_000_000,
    logs: [swapLog(NATIVE, FLOW, 10n ** 18n)] as any,
    ...over,
  };
}

describe("Mainnet 677 core swap economics", () => {
  it.each([
    [4.99, 0],
    [5, 5],
    [25.9, 25],
    [100.75, 100],
  ])("$%s → %s points", (usd, pts) => {
    expect(coreSwapAward(usd, 0, P).award).toBe(pts);
  });

  it("aggregates multiple swaps and caps 20 swaps / $1,200 at 1,000", () => {
    let total = 0;
    for (let i = 0; i < 20; i++) total += coreSwapAward(60, total, P).award;
    expect(total).toBe(1000);
  });

  it("swap after cap → 0 / DAILY_CAP_REACHED", () => {
    const r = coreSwapAward(50, 1000, P);
    expect(r.award).toBe(0);
    expect(r.reason).toBe("DAILY_CAP_REACHED");
  });

  it("counts historical and V2 core reasons toward the daily cap", () => {
    expect(CORE_SWAP_LEDGER_REASONS).toEqual(["CORE_SWAP", "CORE_SWAP_V2"]);
    expect(coreSwapAward(10, 0, P).reason).toBe("CORE_SWAP_V2");
  });
});

describe("Mainnet Router V4 canonical evidence", () => {
  it("rewards a canonical BOT → FLOW SwapActivity", () => {
    const r = verifyMainnetRouterV4CoreSwap(evidence(), { expectedWallet: WALLET });
    expect(r.status).toBe("VERIFIED");
    if (r.status !== "VERIFIED") return;
    expect(r.activity.tokenIn).toBe(NATIVE);
    expect(r.activity.tokenOut).toBe(FLOW);
    expect(r.activity.logIndex).toBe(4);
    expect(r.activity.activityKey).toBe(`677:${TX}:4`);
  });

  it("decodes FLOW → BOT with token tokenIn", () => {
    const r = verifyMainnetRouterV4CoreSwap(evidence({ logs: [swapLog(FLOW, NATIVE, 5n * 10n ** 18n)] as any }));
    expect(r.status === "VERIFIED" && r.activity.tokenIn).toBe(FLOW);
  });

  it("same event processed twice yields the same identity (dedup key)", () => {
    const a = verifyMainnetRouterV4CoreSwap(evidence());
    const b = verifyMainnetRouterV4CoreSwap(evidence());
    expect(a.status === "VERIFIED" && b.status === "VERIFIED" && a.activity.activityId === b.activity.activityId).toBe(true);
  });

  it("rejects a wrong wallet", () => {
    expect(verifyMainnetRouterV4CoreSwap(evidence(), { expectedWallet: "0x" + "11".repeat(20) }).status).toBe("REJECTED");
  });

  it("rejects a wrong router target and foreign emitters", () => {
    expect(verifyMainnetRouterV4CoreSwap(evidence({ to: "0x" + "22".repeat(20) })).status).toBe("REJECTED");
    expect(
      verifyMainnetRouterV4CoreSwap(evidence({ logs: [swapLog(NATIVE, FLOW, 1n, { emitter: "0x" + "33".repeat(20) })] as any })).status,
    ).toBe("REJECTED");
  });

  it("unconfirmed tx → NOT_FINAL (0 points)", () => {
    expect(verifyMainnetRouterV4CoreSwap(evidence({ headBlockNumber: 1000 })).status).toBe("NOT_FINAL");
    expect(verifyMainnetRouterV4CoreSwap(evidence({ blockNumber: 0 })).status).toBe("NOT_FINAL");
  });

  it("reverted tx → REJECTED", () => {
    expect(verifyMainnetRouterV4CoreSwap(evidence({ status: "reverted" })).status).toBe("REJECTED");
  });

  it("rejects non-677 chains and ambiguous logs", () => {
    expect(verifyMainnetRouterV4CoreSwap(evidence({ chainId: 968 })).status).toBe("REJECTED");
    expect(
      verifyMainnetRouterV4CoreSwap(
        evidence({ logs: [swapLog(NATIVE, FLOW, 1n, { logIndex: 1 }), swapLog(NATIVE, FLOW, 1n, { logIndex: 2 })] as any }),
      ).status,
    ).toBe("REJECTED");
  });

  it("Mainnet points have no FLOW conversion", () => {
    expect(getFlowConversionPolicy(677)).toBeNull();
  });
});

describe("Mainnet referral V2", () => {
  const none = { qualifiedSwapCount: 0, qualifiedVolumeUsd: 0, qualifiedActiveDays: 0 };
  it("signup only → 0", () => {
    expect(referralMilestonesDue(none, [], P)).toEqual([]);
  });
  it("+15 / +35 / +50 once each, max 100", () => {
    const s = { qualifiedSwapCount: 5, qualifiedVolumeUsd: 120, qualifiedActiveDays: 3 };
    const due = referralMilestonesDue(s, [], P);
    expect(due.map((d) => d.reason)).toEqual([
      "REFERRAL_FIRST_QUALIFYING_SWAP",
      "REFERRAL_100_USD_VOLUME",
      "REFERRAL_3_ACTIVE_DAYS",
    ]);
    expect(due.reduce((a, d) => a + d.points, 0)).toBe(100);
    expect(referralMilestonesDue(s, ["FIRST_SWAP", "VOLUME_100", "ACTIVE_DAYS_3"], P)).toEqual([]);
  });
  it("same-day swaps count as one active day", () => {
    const due = referralMilestonesDue({ qualifiedSwapCount: 9, qualifiedVolumeUsd: 50, qualifiedActiveDays: 1 }, ["FIRST_SWAP"], P);
    expect(due).toEqual([]);
  });
  it("11th rewarded referral in a month → no reward; next month resets", () => {
    expect(referralMonthlyCapReached(10, false, P)).toBe(true);
    expect(utcMonthKey("2026-10-31T23:59:59Z")).not.toBe(utcMonthKey("2026-11-01T00:00:00Z"));
    expect(referralMonthlyCapReached(0, false, P)).toBe(false);
  });
  it("blocks self-referral by account or wallet", () => {
    expect(isSelfReferral({ referrerId: "a", refereeId: "a" })).toBe(true);
    expect(isSelfReferral({ referrerId: "a", refereeId: "b", referrerWallet: WALLET, refereeWallet: WALLET.toUpperCase() })).toBe(true);
    expect(isSelfReferral({ referrerId: "a", refereeId: "b", referrerWallet: WALLET, refereeWallet: FLOW })).toBe(false);
  });
  it("no ongoing percentage share or signup credit", () => {
    expect(FLOW_POINTS_V2_DISABLED_LEGACY_RULES).toEqual(
      expect.arrayContaining(["referral-signup-auto-credit-50", "referral-activity-percentage-share"]),
    );
  });
});

describe("Anti-wash review", () => {
  it("flags a rapid reverse round trip", () => {
    const t = 1_000_000;
    expect(isRapidReverseRoundTrip([{ tokenIn: NATIVE, tokenOut: FLOW, at: t }], { tokenIn: FLOW, tokenOut: NATIVE, at: t + 60_000 })).toBe(true);
    expect(isRapidReverseRoundTrip([{ tokenIn: NATIVE, tokenOut: FLOW, at: t }], { tokenIn: FLOW, tokenOut: NATIVE, at: t + 3_600_000 })).toBe(false);
    expect(isRapidReverseRoundTrip([{ tokenIn: NATIVE, tokenOut: FLOW, at: t }], { tokenIn: NATIVE, tokenOut: FLOW, at: t + 1 })).toBe(false);
  });
});

// keep viem pad import used for potential padded addresses
void pad;
