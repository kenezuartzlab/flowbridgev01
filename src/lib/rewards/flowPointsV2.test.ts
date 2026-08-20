import { describe, expect, it } from "vitest";

import {
  DEFAULT_FLOW_POINTS_V2_POLICY as P,
  FLOW_POINTS_V2_DISABLED_LEGACY_RULES,
  coreSwapAward,
  coreSwapBasePoints,
  isFlowPointsV2Active,
  referralMilestonesDue,
  referralMonthlyCapReached,
  referralRelationshipEligible,
  utcDayKey,
  utcMonthKey,
} from "./flowPointsV2";
import { cumulativeFlowEntitlement, getFlowConversionPolicy } from "./flowConversionPolicy";
import { incrementalPayout } from "./flowAccrualPolicy";
import { BOT_TESTNET_CHAIN_ID } from "./flowRewardsRegistry";

describe("V12.4A core swap accrual", () => {
  it("awards nothing below the $5 minimum", () => {
    expect(coreSwapBasePoints(4.99, P)).toBe(0);
    expect(coreSwapAward(4.99, 0, P).award).toBe(0);
  });

  it("awards floor(verifiedUsd) at and above the minimum", () => {
    expect(coreSwapAward(5, 0, P).award).toBe(5);
    expect(coreSwapAward(25.9, 0, P).award).toBe(25);
    expect(coreSwapAward(120.999, 0, P).award).toBe(120);
  });

  it("caps the day at 1,000 points and reports the cap reason", () => {
    const partial = coreSwapAward(400, 900, P);
    expect(partial.award).toBe(100);
    expect(partial.base).toBe(400);
    expect(partial.remainingToday).toBe(0);

    const capped = coreSwapAward(400, 1000, P);
    expect(capped.award).toBe(0);
    expect(capped.reason).toBe("DAILY_CAP_REACHED");
  });

  it("cannot be bypassed by splitting volume across many swaps", () => {
    let awarded = 0;
    for (let i = 0; i < 20; i++) awarded += coreSwapAward(100, awarded, P).award;
    expect(awarded).toBe(P.dailyCoreSwapCap);
  });

  it("keys the cap on UTC days and referrals on calendar months", () => {
    expect(utcDayKey("2026-08-20T23:59:59.000Z")).toBe("2026-08-20");
    expect(utcDayKey("2026-08-21T00:00:01.000Z")).toBe("2026-08-21");
    expect(utcMonthKey("2026-08-21T00:00:01.000Z")).toBe("2026-08");
  });

  it("only governs accruals at or after effectiveAt", () => {
    expect(isFlowPointsV2Active("2026-08-20T14:59:59.000Z", P)).toBe(false);
    expect(isFlowPointsV2Active(P.effectiveAt, P)).toBe(true);
  });
});

describe("V12.4A referral milestones", () => {
  it("grants nothing for a signup with no qualified activity", () => {
    expect(
      referralMilestonesDue(
        { qualifiedSwapCount: 0, qualifiedVolumeUsd: 0, qualifiedActiveDays: 0 },
        [],
        P,
      ),
    ).toEqual([]);
  });

  it("grants +15 on the first qualifying swap, once", () => {
    const state = { qualifiedSwapCount: 1, qualifiedVolumeUsd: 6, qualifiedActiveDays: 1 };
    const due = referralMilestonesDue(state, [], P);
    expect(due.map((m) => [m.id, m.points])).toEqual([["FIRST_SWAP", 15]]);
    expect(referralMilestonesDue(state, ["FIRST_SWAP"], P)).toEqual([]);
  });

  it("grants +35 at $100 qualified volume and +50 at 3 active days", () => {
    const due = referralMilestonesDue(
      { qualifiedSwapCount: 4, qualifiedVolumeUsd: 140, qualifiedActiveDays: 3 },
      ["FIRST_SWAP"],
      P,
    );
    expect(due.map((m) => m.points)).toEqual([35, 50]);
  });

  it("never exceeds 100 points per referred user", () => {
    const all = referralMilestonesDue(
      { qualifiedSwapCount: 9, qualifiedVolumeUsd: 5000, qualifiedActiveDays: 9 },
      [],
      P,
    );
    expect(all.reduce((s, m) => s + m.points, 0)).toBe(P.referralMaxPerReferredUser);
    expect(
      referralMilestonesDue(
        { qualifiedSwapCount: 9, qualifiedVolumeUsd: 5000, qualifiedActiveDays: 9 },
        ["FIRST_SWAP", "VOLUME_100", "ACTIVE_DAYS_3"],
        P,
      ),
    ).toEqual([]);
  });

  it("enforces the 10-rewarded-referrals monthly cap but lets existing referees continue", () => {
    expect(referralMonthlyCapReached(9, false, P)).toBe(false);
    expect(referralMonthlyCapReached(10, false, P)).toBe(true);
    expect(referralMonthlyCapReached(10, true, P)).toBe(false);
  });

  it("rejects self-referral and unbound referees", () => {
    expect(
      referralRelationshipEligible({ referrerId: "u1", refereeId: "u1", refereeWalletBound: true }),
    ).toBe(false);
    expect(
      referralRelationshipEligible({ referrerId: "u1", refereeId: "u2", refereeWalletBound: false }),
    ).toBe(false);
    expect(
      referralRelationshipEligible({ referrerId: "u1", refereeId: "u2", refereeWalletBound: true }),
    ).toBe(true);
  });

  it("declares both legacy referral economics disabled", () => {
    expect(FLOW_POINTS_V2_DISABLED_LEGACY_RULES).toContain("referral-signup-auto-credit-50");
    expect(FLOW_POINTS_V2_DISABLED_LEGACY_RULES).toContain("referral-activity-percentage-share");
  });
});

describe("V12.4A claim compatibility", () => {
  const policy = getFlowConversionPolicy(BOT_TESTNET_CHAIN_ID);

  it("keeps the verified V12.3 claim at zero remaining FLOW", () => {
    const entitlement = cumulativeFlowEntitlement(1017, policy)!;
    expect(incrementalPayout(entitlement, entitlement)).toBe(0n);
  });

  it("increases claimable FLOW only by the new V2 points", () => {
    const before = cumulativeFlowEntitlement(1017, policy)!;
    const after = cumulativeFlowEntitlement(1017 + 25, policy)!;
    expect(incrementalPayout(after, before)).toBe(25n * 10n ** 18n);
  });

  it("excludes Campaign PTS from entitlement (points ledger is the only input)", () => {
    expect(cumulativeFlowEntitlement(1017, policy)).toBe(1017n * 10n ** 18n);
  });
});
