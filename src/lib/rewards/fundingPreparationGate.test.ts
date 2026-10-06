import { describe, expect, it } from "vitest";
import { reconcileAll, OWNER_REVIEW_DECISIONS, type ReconAccountInput, type ReconLedgerRow } from "./historicalReconciliation";
import {
  APPROVED_INITIAL_BUDGETS, FUNDING_PREPARATION, TOTAL_REQUIRED_BACKING, allocateBacking, buildDraftAllocation,
  canReserve, fundingShortfallWei, programSolvency,
} from "./rewardFundingPlan";
import { MAINNET_CLAIM_GATE_FACTS, oneToOneClaimGate } from "./signupBonusPolicy";

const OWNER = "532956a9-657d-489e-aa6a-5385423e9a7c", ANA = "9af56470-d5bd-4e17-8e0e-fc651478878b", REF = "afb08df9";
let n = 0;
const row = (p: Partial<ReconLedgerRow>): ReconLedgerRow => ({ id: `r${++n}`, reason: "CORE_SWAP", points: 0, chainId: null, createdAt: "2026-08-20T00:00:00Z", evidenceKey: `k${n}`, verifiedUsd: null, dayKey: null, refereeId: null, reservationId: null, fundingState: "UNFUNDED", ...p });
const snap = (): ReconAccountInput[] => [
  { userId: OWNER, createdAt: "2026-06-24T00:00:00Z", storedFlowPoints: 175, storedPointsSelf: 75, storedReferralSignup: 0, ledger: [
    row({ points: 925, chainId: 968 }), row({ points: 75, chainId: 968 }),
    row({ reason: "REFERRAL_MILESTONE_FIRST_SWAP", points: 15, refereeId: REF }), row({ reason: "REFERRAL_3_ACTIVE_DAYS", points: 50, refereeId: REF }),
  ] },
  { userId: REF, createdAt: "2026-07-01T00:00:00Z", storedFlowPoints: 10, storedPointsSelf: 10, storedReferralSignup: 0, ledger: [
    row({ points: 1000, chainId: 968 }),
    row({ reason: "CORE_SWAP_V2", points: 5, chainId: 677, evidenceKey: "0x9694:2", verifiedUsd: 5.194 }),
    row({ reason: "CORE_SWAP_V2", points: 5, chainId: 677, evidenceKey: "0xe798:4", verifiedUsd: 5.565 }),
  ] },
  { userId: ANA, createdAt: "2026-07-20T00:00:00Z", storedFlowPoints: 314, storedPointsSelf: 20, storedReferralSignup: 50, ledger: [
    row({ reason: "REFERRAL_MILESTONE_FIRST_SWAP", points: 15, refereeId: OWNER }), row({ reason: "REFERRAL_MILESTONE_VOLUME_100", points: 35, refereeId: OWNER }),
  ] },
  ...Array.from({ length: 3 }, (_, i) => ({ userId: `legacy${i}`, createdAt: "2026-07-01T00:00:00Z", storedFlowPoints: 50, storedPointsSelf: 50, storedReferralSignup: 0, ledger: [] })),
];

describe("owner reconciliation decisions", () => {
  const s = reconcileAll(snap(), OWNER_REVIEW_DECISIONS);
  const get = (id: string) => s.results.find((r) => r.userId === id)!;
  it("both review accounts become REVIEWED — NONCLAIMABLE with zero entitlement", () => {
    for (const [id, stored] of [[OWNER, 175], [ANA, 314]] as const) {
      expect(get(id).classification).toBe("REVIEWED_NONCLAIMABLE_HISTORICAL");
      expect(get(id).authoritative).toBe(0);
      expect(get(id).nonclaimableHistorical).toBe(stored);
      expect(get(id).pendingReview).toBe(0);
    }
  });
  it("reconciliation passes without fabricated evidence", () => {
    expect(s.pass).toBe(true);
    expect(s.counts.INSUFFICIENT_HISTORICAL_EVIDENCE).toBe(0);
    expect(s.authoritativeTotal).toBe(10);
  });
  it("without the review decisions it stays blocked", () => expect(reconcileAll(snap()).pass).toBe(false));
  it("testnet points never enter Mainnet entitlement", () => {
    expect(s.testnetExcludedTotal).toBe(2000);
    expect(get(REF).breakdown.coreSwap).toBe(10);
  });
  it("old +50 balances stay explained historical, never authoritative", () => {
    const l = get("legacy0");
    expect(l.classification).toBe("EXPLAINED_DIFFERENCE");
    expect(l.authoritative).toBe(0);
    expect(l.nonclaimableHistorical).toBe(50);
  });
  it("clean proof account totals exactly 10 from the ledger", () => expect(get(REF).authoritative).toBe(10));
  it("draft allocation excludes reviewed/legacy and contains only the 10-point proof", () => {
    const wallets: Record<string, string> = { [REF]: "0x628E237B73c5A37EF3968527563fa1a26b32bB97", [OWNER]: "0x3d8a", [ANA]: "0x32a3" };
    const d = buildDraftAllocation(s.results.map((r) => ({ ...r, wallet: wallets[r.userId] ?? "0xlegacy" + r.userId })));
    expect(d.status).toBe("DRAFT_NOT_PUBLISHED");
    expect(d.leaves).toEqual([{ index: 0, account: "0x628e237b73c5a37ef3968527563fa1a26b32bb97", points: 10, amountWei: "10000000000000000000" }]);
  });
});

describe("budgets and funding", () => {
  it("separate 1M / 3k / 2k buckets totalling 1,005,000", () => {
    expect(APPROVED_INITIAL_BUDGETS).toEqual({ SIGNUP_BONUS: 1_000_000, CORE_SWAP: 3_000, REFERRAL_MILESTONE: 2_000 });
    expect(TOTAL_REQUIRED_BACKING).toBe(1_005_000);
  });
  it("no cross-budget spending", () => {
    const rows = [
      programSolvency({ programId: "SIGNUP_BONUS", authorizedBudget: 1_000_000, backingVerified: true, reserved: 0, earned: 0, claimed: 0, unfunded: 0 }),
      programSolvency({ programId: "CORE_SWAP", authorizedBudget: 3_000, backingVerified: true, reserved: 2_995, earned: 0, claimed: 0, unfunded: 0 }),
    ];
    expect(canReserve(rows, "CORE_SWAP", 10)).toBe(false);
    expect(canReserve(rows, "REFERRAL_MILESTONE", 15)).toBe(false);
  });
  it("shortfall: 999,999 free → 5,001; live 2,499,999 → 0", () => {
    expect(fundingShortfallWei(999_999n * 10n ** 18n)).toBe(5_001n * 10n ** 18n);
    expect(fundingShortfallWei(BigInt(FUNDING_PREPARATION.liveFreeBalanceWei))).toBe(0n);
  });
  it("the same FLOW never backs two buckets", () => {
    const b = allocateBacking(1_002_000n * 10n ** 18n);
    expect(b.buckets.SIGNUP_BONUS!.fullyBacked).toBe(true);
    expect(b.buckets.CORE_SWAP!.backedFlow + b.buckets.REFERRAL_MILESTONE!.backedFlow).toBe(2_000);
    expect(b.buckets.REFERRAL_MILESTONE!.fullyBacked).toBe(false);
  });
  it("prepared budget tx is unsigned and unbroadcast", () => {
    expect(FUNDING_PREPARATION.signed).toBe(false);
    expect(FUNDING_PREPARATION.broadcast).toBe(false);
    expect(FUNDING_PREPARATION.budgetTx.calldata.startsWith("0x7bc0db46")).toBe(true);
    expect(BigInt(FUNDING_PREPARATION.budgetTx.newBudgetWei)).toBe(1_005_001n * 10n ** 18n);
  });
  it("claims remain locked before funding", () => {
    expect(MAINNET_CLAIM_GATE_FACTS.distributorDeployed).toBe(false);
    expect(oneToOneClaimGate({ ...MAINNET_CLAIM_GATE_FACTS, distributorFlowBalance: null, totalReservedPoints: 0 }).open).toBe(false);
  });
});
