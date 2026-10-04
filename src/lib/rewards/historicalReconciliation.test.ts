import { describe, expect, it } from "vitest";
import { reconcileAll, reconcileAccount, type ReconAccountInput, type ReconLedgerRow } from "./historicalReconciliation";
import {
  MAINNET_PAYOUT_AUDIT, MAINNET_PROMOTION_PACKAGE, canReserve, milestoneFundingOptions, payoutContractSufficient,
  programSolvency, swapFundingOptions,
} from "./rewardFundingPlan";

let n = 0;
const row = (p: Partial<ReconLedgerRow>): ReconLedgerRow => ({
  id: `r${++n}`, reason: "CORE_SWAP", points: 0, chainId: null, createdAt: "2026-08-20T00:00:00Z", evidenceKey: `k${n}`,
  verifiedUsd: null, dayKey: null, refereeId: null, reservationId: null, fundingState: "UNFUNDED", ...p,
});
const OWNER = "owner", REF = "kentrosh", ELON = "elon", ANA = "ana";
const legacy = (i: number): ReconAccountInput => ({ userId: `legacy${i}`, createdAt: "2026-07-01T00:00:00Z", storedFlowPoints: 50, storedPointsSelf: 50, storedReferralSignup: 0, ledger: [] });

// Snapshot of production ledger shape on 2026-10-04 (identities anonymised).
function snapshot(): ReconAccountInput[] {
  return [
    { userId: OWNER, createdAt: "2026-06-24T00:00:00Z", storedFlowPoints: 175, storedPointsSelf: 75, storedReferralSignup: 0, ledger: [
      row({ points: 11, chainId: 968 }), row({ points: 10, chainId: 968 }), row({ points: 10, chainId: 968 }), row({ points: 925, chainId: 968 }), row({ points: 75, chainId: 968 }),
      row({ points: 0, chainId: 677 }), row({ points: 0, chainId: 677 }),
      row({ reason: "REFERRAL_MILESTONE_FIRST_SWAP", points: 15, refereeId: REF, createdAt: "2026-08-20T18:00:00Z" }),
      row({ reason: "REFERRAL_MILESTONE_VOLUME_100", points: 35, refereeId: REF, createdAt: "2026-08-20T18:00:01Z" }),
      row({ reason: "REFERRAL_MILESTONE_FIRST_SWAP", points: 15, refereeId: ELON, createdAt: "2026-08-23T06:00:00Z" }),
      row({ reason: "REFERRAL_MILESTONE_VOLUME_100", points: 35, refereeId: ELON, createdAt: "2026-08-23T06:00:01Z" }),
      row({ reason: "REFERRAL_3_ACTIVE_DAYS", points: 50, refereeId: REF, createdAt: "2026-10-03T17:19:04Z" }),
    ] },
    { userId: REF, createdAt: "2026-07-01T00:00:00Z", storedFlowPoints: 10, storedPointsSelf: 10, storedReferralSignup: 0, ledger: [
      row({ points: 500, chainId: 968 }), row({ points: 100, chainId: 968 }), row({ points: 200, chainId: 968 }), row({ points: 1000, chainId: 968 }),
      row({ reason: "CORE_SWAP_V2", points: 5, chainId: 677, evidenceKey: "0x9694:2", verifiedUsd: 5.194, dayKey: "2026-10-03", createdAt: "2026-10-03T17:19:00Z" }),
      row({ reason: "CORE_SWAP_V2", points: 5, chainId: 677, evidenceKey: "0xe798:4", verifiedUsd: 5.565, dayKey: "2026-10-04", createdAt: "2026-10-04T00:22:56Z" }),
    ] },
    { userId: ELON, createdAt: "2026-07-01T00:00:00Z", storedFlowPoints: 0, storedPointsSelf: 0, storedReferralSignup: 0, ledger: [row({ points: 955, chainId: 968 })] },
    { userId: ANA, createdAt: "2026-07-20T00:00:00Z", storedFlowPoints: 314, storedPointsSelf: 20, storedReferralSignup: 50, ledger: [
      row({ reason: "REFERRAL_MILESTONE_FIRST_SWAP", points: 15, refereeId: OWNER }),
      row({ reason: "REFERRAL_MILESTONE_VOLUME_100", points: 35, refereeId: OWNER }),
      row({ reason: "REFERRAL_MILESTONE_ACTIVE_DAYS_3", points: 50, refereeId: OWNER }),
    ] },
    ...Array.from({ length: 18 }, (_, i) => legacy(i)),
  ];
}

describe("historical reconciliation", () => {
  it("classifies the production snapshot and stays BLOCKED", () => {
    const s = reconcileAll(snapshot());
    expect(s.accounts).toBe(22);
    expect(s.counts).toEqual({ MATCH: 2, EXPLAINED_DIFFERENCE: 18, UNEXPLAINED_POSITIVE_DIFFERENCE: 0, UNEXPLAINED_NEGATIVE_DIFFERENCE: 0, INSUFFICIENT_HISTORICAL_EVIDENCE: 2 });
    expect(s.pass).toBe(false);
  });

  it("derives owner total from ledger only, never from the stored 175", () => {
    const owner = reconcileAll(snapshot()).results.find((r) => r.userId === OWNER)!;
    expect(owner.authoritative).toBe(0);
    expect(owner.pendingReview).toBe(150);
    expect(owner.classification).toBe("INSUFFICIENT_HISTORICAL_EVIDENCE");
  });

  it("counts the two live Router V4 + V3 swaps exactly once (10)", () => {
    const ref = reconcileAll(snapshot()).results.find((r) => r.userId === REF)!;
    expect(ref.breakdown.coreSwap).toBe(10);
    expect(ref.classification).toBe("MATCH");
    expect(ref.explained).toContain("BOT_TESTNET_LEDGER_ROWS_EXCLUDED");
  });

  it("flags a manipulated stored balance as unexplained positive", () => {
    const r = reconcileAll([{ userId: "x", createdAt: "2026-07-01T00:00:00Z", storedFlowPoints: 9999, storedPointsSelf: 9999, storedReferralSignup: 0, ledger: [] }]).results[0]!;
    expect(r.classification).toBe("UNEXPLAINED_POSITIVE_DIFFERENCE");
    expect(r.authoritative).toBe(0);
    expect(r.flags).toContain("STORED_BALANCE_WITHOUT_LEDGER");
  });

  it("flags stored below ledger as unexplained negative", () => {
    const r = reconcileAll([{ userId: "y", createdAt: "2026-07-01T00:00:00Z", storedFlowPoints: 0, storedPointsSelf: 0, storedReferralSignup: 0, ledger: [row({ reason: "CORE_SWAP_V2", points: 7, chainId: 677 })] }]).results[0]!;
    expect(r.classification).toBe("UNEXPLAINED_NEGATIVE_DIFFERENCE");
  });

  it("dedups duplicate canonical evidence", () => {
    const a = row({ reason: "CORE_SWAP_V2", points: 6, chainId: 677, evidenceKey: "same" });
    const b = row({ reason: "CORE_SWAP_V2", points: 6, chainId: 677, evidenceKey: "same" });
    const r = reconcileAccount({ userId: "z", createdAt: "2026-07-01T00:00:00Z", storedFlowPoints: 6, storedPointsSelf: 6, storedReferralSignup: 0, ledger: [a, b] }, new Map());
    expect(r.authoritative).toBe(6);
    expect(r.excluded[0]!.cause).toBe("DUPLICATE_EVIDENCE");
  });

  it("accepts only exact 100-point reserved post-effective signup awards", () => {
    const ok = reconcileAccount({ userId: "n", createdAt: "2026-10-05T00:00:00Z", storedFlowPoints: 100, storedPointsSelf: 0, storedReferralSignup: 0, ledger: [row({ reason: "SIGNUP_BONUS_REFEREE", points: 100, reservationId: "res" })] }, new Map());
    expect(ok.classification).toBe("MATCH");
    const bad = reconcileAccount({ userId: "m", createdAt: "2026-10-05T00:00:00Z", storedFlowPoints: 150, storedPointsSelf: 0, storedReferralSignup: 0, ledger: [row({ reason: "SIGNUP_BONUS_REFEREE", points: 150, reservationId: null })] }, new Map());
    expect(bad.classification).toBe("INSUFFICIENT_HISTORICAL_EVIDENCE");
  });
});

describe("solvency, funding and payout readiness", () => {
  const signup = programSolvency({ programId: "SIGNUP_BONUS", authorizedBudget: 1_000_000, backingVerified: false, reserved: 0, earned: 0, claimed: 0, unfunded: 0 });
  const swap = programSolvency({ programId: "CORE_SWAP", authorizedBudget: 0, backingVerified: false, reserved: 0, earned: 10, claimed: 0, unfunded: 10 });

  it("labels unverified budgets honestly and keeps claims locked", () => {
    expect(signup.backingLabel).toBe("APPROVED BUDGET — BACKING VERIFICATION PENDING");
    expect(signup.claimableAllowed).toBe(false);
    expect(signup.remaining).toBe(1_000_000);
    expect(signup.invariantOk).toBe(true);
    expect(swap.backingLabel).toContain("PENDING_FUNDING");
    expect(swap.claimableAllowed).toBe(false);
  });

  it("never spends across budgets", () => {
    expect(canReserve([signup, swap], "SIGNUP_BONUS", 200)).toBe(true);
    expect(canReserve([signup, swap], "CORE_SWAP", 5)).toBe(false);
    expect(canReserve([signup, swap], "REFERRAL_MILESTONE", 15)).toBe(false);
  });

  it("detects budget invariant violations", () => {
    expect(programSolvency({ programId: "SIGNUP_BONUS", authorizedBudget: 100, backingVerified: true, reserved: 200, earned: 0, claimed: 0, unfunded: 0 }).invariantOk).toBe(false);
  });

  it("projects swap funding options in ascending order", () => {
    const o = swapFundingOptions({ verifiedAccrualToDate: 10, points7d: 10, activeEarners30d: 1, eligibleBoundWallets: 8, dailyCap: 1000, safetyBuffer: 2 });
    expect(o.map((x) => x.flowRequired)).toEqual([3000, 3000, 3000]);
    expect(o[0]!.name).toBe("MINIMUM LAUNCH FUND");
    expect(o.every((x, i) => i === 0 || x.flowRequired >= o[i - 1]!.flowRequired)).toBe(true);
  });

  it("projects milestone funding separately from the signup bonus", () => {
    const o = milestoneFundingOptions({ qualifiedMilestonePoints30d: 0, activeReferrers: 2, monthlyRewardedReferralCap: 10, maxMilestonePerReferral: 100, safetyBuffer: 1 });
    expect(o.map((x) => x.flowRequired)).toEqual([1000, 2000, 6000]);
    expect(o[0]!.assumptions.join(" ")).toContain("SIGNUP_BONUS");
  });

  it("confirms the Mainnet payout contract supports every requirement", () => {
    expect(payoutContractSufficient()).toBe(true);
    expect(MAINNET_PAYOUT_AUDIT.capabilities).toHaveLength(9);
    expect(MAINNET_PROMOTION_PACKAGE).toHaveLength(11);
  });
});
