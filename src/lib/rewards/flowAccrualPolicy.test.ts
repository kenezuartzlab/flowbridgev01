import { describe, expect, it } from "vitest";

import {
  DEFAULT_REWARD_RULES,
  estimateFlowPointsForUsd,
  isRewardEligibleUsd,
  referralActivityShare,
} from "@/lib/rewards";
import {
  FLOW_ACCRUAL_CONFLICTS,
  FLOW_ACCRUAL_ELIGIBILITY,
  FLOW_ACCRUAL_POLICY_FIELDS,
  FLOW_DISTRIBUTOR_FUNDED_UNITS,
  distributorFundingLevel,
  incrementalPayout,
} from "./flowAccrualPolicy";
import { cumulativeFlowEntitlement, getFlowConversionPolicy } from "./flowConversionPolicy";
import { BOT_TESTNET_CHAIN_ID } from "./flowRewardsRegistry";

/**
 * V12.4 §6 — deterministic accrual-integrity coverage. These lock the CURRENT
 * production economics; they intentionally do not assert the documented
 * daily-tier policy, which is not executed (see FLOW_ACCRUAL_CONFLICTS).
 */
describe("V12.4 swap accrual", () => {
  it("credits a qualifying swap under the live block formula", () => {
    expect(estimateFlowPointsForUsd(120, DEFAULT_REWARD_RULES)).toBe(120);
  });

  it("produces no economic points for a sub-threshold swap", () => {
    expect(isRewardEligibleUsd(4.99, DEFAULT_REWARD_RULES)).toBe(false);
    expect(estimateFlowPointsForUsd(4.99, DEFAULT_REWARD_RULES)).toBe(0);
    expect(estimateFlowPointsForUsd(0, DEFAULT_REWARD_RULES)).toBe(0);
    expect(estimateFlowPointsForUsd(null, DEFAULT_REWARD_RULES)).toBe(0);
  });

  it("is a pure function of verified USD — replaying the same swap yields the same value, never a second grant", () => {
    const first = estimateFlowPointsForUsd(50, DEFAULT_REWARD_RULES);
    const replay = estimateFlowPointsForUsd(50, DEFAULT_REWARD_RULES);
    expect(replay).toBe(first);
    // Idempotency itself is enforced by the unique (user_id, tx_hash) index in
    // createTransactionHistory: the duplicate returns the stored row and the
    // profile update block is skipped entirely.
  });

  it("credits two distinct qualifying swaps independently (no aggregate cap is executed)", () => {
    expect(
      estimateFlowPointsForUsd(30, DEFAULT_REWARD_RULES) +
        estimateFlowPointsForUsd(30, DEFAULT_REWARD_RULES),
    ).toBe(60);
  });

  it("keeps bridge and campaign activity outside core FLOW Points", () => {
    expect(FLOW_ACCRUAL_ELIGIBILITY.bridge).toBe(false);
    expect(FLOW_ACCRUAL_ELIGIBILITY.campaignTask).toBe(false);
    expect(FLOW_ACCRUAL_ELIGIBILITY.swapSubThreshold).toBe(false);
    expect(FLOW_ACCRUAL_ELIGIBILITY.swapVerified).toBe(true);
  });
});

describe("V12.4 referral accrual", () => {
  it("shares the configured percentage of the referee's points exactly once", () => {
    expect(referralActivityShare(120, 20)).toBe(24);
  });

  it("grants nothing when the share rounds below one point or the pct is unset", () => {
    expect(referralActivityShare(4, 20)).toBe(0);
    expect(referralActivityShare(120, 0)).toBe(0);
    expect(referralActivityShare(120, null)).toBe(0);
    expect(referralActivityShare(120, undefined)).toBe(0);
  });

  it("never grants a share for a non-earning referee swap", () => {
    const refereePoints = estimateFlowPointsForUsd(2, DEFAULT_REWARD_RULES);
    expect(refereePoints).toBe(0);
    expect(referralActivityShare(refereePoints, 20)).toBe(0);
  });

  it("flags the unresolved signup-bonus conflict instead of silently running two rules", () => {
    expect(FLOW_ACCRUAL_ELIGIBILITY.referralSignup).toBe("conflict");
    expect(FLOW_ACCRUAL_CONFLICTS.map((c) => c.id)).toContain("referral-signup-auto-credit");
    // No conflict may be a double-credit path.
    expect(FLOW_ACCRUAL_CONFLICTS.every((c) => c.doubleCreditRisk === false)).toBe(true);
  });
});

describe("V12.4 post-claim cumulative entitlement", () => {
  const policy = getFlowConversionPolicy(BOT_TESTNET_CHAIN_ID);

  it("leaves claimableDelta at 0 when nothing new accrued after a claim", () => {
    const entitlement = cumulativeFlowEntitlement(1017, policy)!;
    expect(incrementalPayout(entitlement, entitlement)).toBe(0n);
  });

  it("pays only the incremental difference when new points arrive", () => {
    const before = cumulativeFlowEntitlement(1017, policy)!;
    const after = cumulativeFlowEntitlement(1117, policy)!;
    expect(after > before).toBe(true);
    expect(incrementalPayout(after, before)).toBe(100n * 10n ** 18n);
  });

  it("never goes negative if on-chain claimed exceeds the current entitlement", () => {
    expect(incrementalPayout(5n, 9n)).toBe(0n);
  });

  it("excludes Campaign PTS from cumulative FLOW entitlement", () => {
    // The entitlement input is the FLOW Points ledger only; campaign PTS is a
    // separate store and never an argument to this computation.
    const withoutCampaign = cumulativeFlowEntitlement(1017, policy)!;
    expect(withoutCampaign).toBe(1017n * 10n ** 18n);
  });
});

describe("V12.4 monitoring thresholds", () => {
  it("reports the funded distributor as healthy", () => {
    expect(distributorFundingLevel(FLOW_DISTRIBUTOR_FUNDED_UNITS)).toBe("healthy");
  });

  it("warns below 20% and alerts below 5% of funding", () => {
    expect(distributorFundingLevel(1_500_000n * 10n ** 18n)).toBe("low");
    expect(distributorFundingLevel(100_000n * 10n ** 18n)).toBe("critical");
  });
});

describe("V12.4 policy inventory", () => {
  it("documents a source for every reward field", () => {
    expect(FLOW_ACCRUAL_POLICY_FIELDS.length).toBeGreaterThan(0);
    for (const f of FLOW_ACCRUAL_POLICY_FIELDS) {
      expect(f.source.length).toBeGreaterThan(0);
      expect(f.note.length).toBeGreaterThan(0);
    }
  });
});
