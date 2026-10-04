/**
 * Reward funding planning + solvency + payout readiness (pure).
 * Produces PROPOSALS only. Nothing here sets, funds or moves a budget.
 */

export type ProgramId = "SIGNUP_BONUS" | "CORE_SWAP" | "REFERRAL_MILESTONE" | "OTHER";

export interface ProgramSolvencyInput {
  programId: ProgramId;
  authorizedBudget: number;
  backingVerified: boolean;
  reserved: number;
  /** Confirmed earned points attributed to this program (ledger). */
  earned: number;
  claimed: number;
  /** Earned points with no funded reservation. */
  unfunded: number;
}

export interface ProgramSolvencyRow extends ProgramSolvencyInput {
  remaining: number;
  backingLabel: string;
  invariantOk: boolean;
  claimableAllowed: boolean;
}

export function programSolvency(p: ProgramSolvencyInput): ProgramSolvencyRow {
  const remaining = Math.max(0, p.authorizedBudget - p.reserved);
  const invariantOk = p.reserved >= 0 && p.reserved <= p.authorizedBudget && p.claimed <= p.reserved;
  return {
    ...p,
    remaining,
    invariantOk,
    backingLabel: p.authorizedBudget === 0
      ? "NO BUDGET — POINTS PENDING_FUNDING"
      : p.backingVerified ? "ON-CHAIN FUNDED" : "APPROVED BUDGET — BACKING VERIFICATION PENDING",
    // Fail closed: only an on-chain verified, positive, invariant-clean budget may ever be claimable.
    claimableAllowed: p.backingVerified && p.authorizedBudget > 0 && invariantOk,
  };
}

/** A reservation may only draw from its own program. No cross-budget spending. */
export function canReserve(programs: ProgramSolvencyRow[], programId: ProgramId, amount: number): boolean {
  const p = programs.find((x) => x.programId === programId);
  return !!p && amount > 0 && p.remaining >= amount;
}

export interface FundingOption {
  name: "MINIMUM LAUNCH FUND" | "30-DAY OPERATING FUND" | "90-DAY OPERATING FUND";
  flowRequired: number;
  runwayDaysAtObservedRate: number | null;
  maxLiabilitySupported: string;
  assumptions: string[];
}

const roundUp = (n: number, step = 1000) => Math.max(step, Math.ceil(n / step) * step);

export interface SwapFundingInput {
  verifiedAccrualToDate: number;
  points7d: number;
  activeEarners30d: number;
  eligibleBoundWallets: number;
  dailyCap: number;
  safetyBuffer: number;
}

export function swapFundingOptions(i: SwapFundingInput): FundingOption[] {
  const daily = i.points7d / 7;
  const earners = Math.max(1, i.activeEarners30d);
  const capDay = i.dailyCap * earners;
  const base = i.verifiedAccrualToDate + capDay * i.safetyBuffer;
  const mk = (name: FundingOption["name"], days: number): FundingOption => {
    const flow = roundUp(base + daily * days * i.safetyBuffer);
    return {
      name,
      flowRequired: flow,
      runwayDaysAtObservedRate: daily > 0 ? Math.floor((flow - i.verifiedAccrualToDate) / daily) : null,
      maxLiabilitySupported: `${Math.floor((flow - i.verifiedAccrualToDate) / i.dailyCap)} full-cap wallet-days (${i.dailyCap.toLocaleString()} pts each)`,
      assumptions: [
        `Existing verified Mainnet accrual ${i.verifiedAccrualToDate} pts covered first`,
        `Observed 7-day rate ${i.points7d} pts (${daily.toFixed(2)}/day), ${days}-day projection`,
        `One full daily cap for ${earners} active Mainnet earner(s) × ${i.safetyBuffer} safety buffer`,
        `${i.eligibleBoundWallets} bound wallets could earn; worst case ${(i.eligibleBoundWallets * i.dailyCap).toLocaleString()} pts/day`,
        "No growth assumed; re-run after 30 days of data",
      ],
    };
  };
  return [mk("MINIMUM LAUNCH FUND", 0), mk("30-DAY OPERATING FUND", 30), mk("90-DAY OPERATING FUND", 90)];
}

export interface MilestoneFundingInput {
  qualifiedMilestonePoints30d: number;
  activeReferrers: number;
  monthlyRewardedReferralCap: number;
  maxMilestonePerReferral: number;
  safetyBuffer: number;
}

export function milestoneFundingOptions(i: MilestoneFundingInput): FundingOption[] {
  const referrers = Math.max(1, i.activeReferrers);
  const monthlyMax = referrers * i.monthlyRewardedReferralCap * i.maxMilestonePerReferral;
  const daily = i.qualifiedMilestonePoints30d / 30;
  const mk = (name: FundingOption["name"], months: number, flow: number): FundingOption => ({
    name,
    flowRequired: roundUp(flow),
    runwayDaysAtObservedRate: daily > 0 ? Math.floor(roundUp(flow) / daily) : null,
    maxLiabilitySupported: `${Math.floor(roundUp(flow) / i.maxMilestonePerReferral)} fully completed referrals (${i.maxMilestonePerReferral} pts each)`,
    assumptions: [
      `+15 first qualifying swap, +35 $100 cumulative volume, +50 three active days; max ${i.maxMilestonePerReferral}/referral`,
      `Referrer signup +100 is funded by SIGNUP_BONUS, not here`,
      `${referrers} active referrer(s) × ${i.monthlyRewardedReferralCap} rewarded referrals/month cap = ${monthlyMax.toLocaleString()} pts/month worst case`,
      `Observed Mainnet-qualified milestone points (30d): ${i.qualifiedMilestonePoints30d}`,
      months === 0 ? "One referrer reaching the monthly cap once" : `${months} month(s) of worst-case cap usage`,
    ],
  });
  return [
    mk("MINIMUM LAUNCH FUND", 0, i.monthlyRewardedReferralCap * i.maxMilestonePerReferral * i.safetyBuffer),
    mk("30-DAY OPERATING FUND", 1, monthlyMax),
    mk("90-DAY OPERATING FUND", 3, monthlyMax * 3),
  ];
}

export interface PayoutCapability { capability: string; supported: boolean; how: string }

/** Read-only audit of the canonical Mainnet FlowRewardsMerkleDistributor (0x7b80…b922). */
export const MAINNET_PAYOUT_AUDIT: { address: string; capabilities: PayoutCapability[] } = {
  address: "0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922",
  capabilities: [
    { capability: "1 FLOW Point = 1 FLOW", supported: true, how: "Leaf amount is FLOW wei; allocation builder sets amount = points × 1e18" },
    { capability: "Cumulative entitlement", supported: true, how: "Each epoch publishes delta = backed cumulative − previously allocated; computed off-chain and reproduced independently" },
    { capability: "Already-claimed accounting", supported: true, how: "isClaimed(epochId, index) bitmap; AlreadyClaimed revert" },
    { capability: "Replay protection", supported: true, how: "Claimed bit set before transfer; one claim per leaf" },
    { capability: "Wallet-bound claims", supported: true, how: "Leaf binds account address; transfer goes only to leaf account" },
    { capability: "Funded allocation checks", supported: true, how: "publishEpoch reverts InsufficientFunding when free balance < epoch total" },
    { capability: "Budget / reservation discipline", supported: true, how: "campaignBudget + totalReserved; BudgetExceeded; recovery limited to free balance" },
    { capability: "Pause", supported: true, how: "PAUSER_ROLE pause; DEFAULT_ADMIN_ROLE unpause" },
    { capability: "Claim proof verification", supported: true, how: "MerkleProof against published root; InvalidProof revert; publish delay ≥ 24h" },
  ],
};
export const payoutContractSufficient = () => MAINNET_PAYOUT_AUDIT.capabilities.every((c) => c.supported);

export const MAINNET_PROMOTION_PACKAGE = [
  "Reconcile historical points: zero unexplained differences and zero insufficient-evidence accounts (owner review of every flagged row)",
  "Freeze verified starting balances: signed snapshot (ledger row ids, totals, digest) committed to the repo",
  "Approve funded budgets per program (SIGNUP_BONUS, CORE_SWAP, REFERRAL_MILESTONE) — owner decision, recorded as audited ADMIN_ADJUSTMENT",
  "Fund the Mainnet payout authority: treasury → distributor transfer equal to the approved backed total (multisig, separate gate)",
  "Verify on-chain balance: freeBalance() ≥ approved total, read independently at a recorded block",
  "Publish first 1:1 allocation: setCampaignBudget then publishEpoch(root, total, window) after minPublishDelay",
  "Independently reproduce allocation: second builder recomputes leaves/root from the frozen snapshot; roots must match byte-for-byte",
  "Verify proof: local MerkleProof check for every leaf against the on-chain root",
  "Open claims to a tiny canary cohort/wallet (approved practice wallet only)",
  "Confirm claim: receipt, Claim event, isClaimed bit, balances, totalReserved decrease",
  "Expand to all reconciled wallets",
] as const;
