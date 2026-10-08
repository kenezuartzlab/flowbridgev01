/**
 * V34 — verified reward progression toward the 1,000 FLOW claim minimum (pure).
 *
 * Counts ONLY funded, reconciled BOT Mainnet ledger points. Testnet rows,
 * unfunded rows, review-held rows, unsupported historical balances and Campaign
 * PTS never count. Nothing here changes economics or authorizes a claim: the
 * claim lifecycle is delegated verbatim to publicClaimPolicy.claimLifecycle.
 */
import { MAINNET_MIN_CLAIM_FLOW } from "./claimMinimumPolicy";
import { claimLifecycle, type ClaimLifecycle } from "./publicClaimPolicy";
import { MAINNET_CHAIN_ID } from "./historicalReconciliation";

export const PROGRESS_THRESHOLDS = [25, 50, 75, 100] as const;
export type ProgressThreshold = (typeof PROGRESS_THRESHOLDS)[number];

export type EarningSource = "CORE_SWAP" | "SIGNUP_BONUS" | "REFERRAL_MILESTONE" | "OTHER";

export interface ProgressionLedgerRow {
  points: number;
  chainId: number | null;
  fundingState: string | null;
  programId: string | null;
}

export interface ProgressionAllocation {
  epochId: number;
  amountFlow: number;
  walletMatches: boolean;
  proofValid: boolean;
  onChain: boolean;
  claimed: boolean;
  claimStart: number;
  claimEnd: number;
}

export interface ProgressionInput {
  ledger: ProgressionLedgerRow[];
  /** Reconciled authoritative Mainnet points (historicalReconciliation). */
  reconciledPoints: number;
  /** Points held for review (never counted). */
  reviewHeldPoints: number;
  /** Unsupported stored history (never counted). */
  historicalNonclaimable: number;
  /** Reconciliation class must be MATCH / EXPLAINED_DIFFERENCE for settlement. */
  reconciliationOk: boolean;
  /** Stored display total (may include unsupported history). */
  storedFlowPoints: number;
  walletBound: boolean;
  allocations: ProgressionAllocation[];
  nowSec: number;
}

export interface RewardProgression {
  minimum: number;
  earnedPoints: number;
  eligibleFundedFlow: number;
  settledFlow: number;
  claimedFlow: number;
  availableTowardMinimum: number;
  remainingToMinimum: number;
  percent: number;
  thresholdsReached: ProgressThreshold[];
  pendingUnfunded: number;
  reviewHeld: number;
  testnetExcluded: number;
  historicalNonclaimable: number;
  sources: Record<EarningSource, number>;
  settlementReady: boolean;
  lifecycle: ClaimLifecycle;
  lifecycleLabel: string;
  claimButton: boolean;
  /** Most relevant allocation (unclaimed first, oldest first). */
  allocation: ProgressionAllocation | null;
}

const KNOWN: EarningSource[] = ["CORE_SWAP", "SIGNUP_BONUS", "REFERRAL_MILESTONE"];
const floor = (n: number) => Math.max(0, Math.floor(Number(n) || 0));

export function pickAllocation(list: ProgressionAllocation[]): ProgressionAllocation | null {
  const valid = list.filter((a) => a.onChain && a.walletMatches && a.proofValid).sort((a, b) => a.epochId - b.epochId);
  return valid.find((a) => !a.claimed) ?? valid[valid.length - 1] ?? null;
}

export function computeRewardProgression(i: ProgressionInput): RewardProgression {
  const sources: Record<EarningSource, number> = { CORE_SWAP: 0, SIGNUP_BONUS: 0, REFERRAL_MILESTONE: 0, OTHER: 0 };
  let funded = 0;
  let pendingUnfunded = 0;
  let testnet = 0;
  for (const r of i.ledger) {
    const p = Math.floor(Number(r.points) || 0);
    if (p <= 0) continue;
    if (r.chainId !== MAINNET_CHAIN_ID) { testnet += p; continue; }
    if (r.fundingState !== "FUNDED") { pendingUnfunded += p; continue; }
    funded += p;
    const src = (KNOWN.includes(r.programId as EarningSource) ? r.programId : "OTHER") as EarningSource;
    sources[src] += p;
  }
  // Funded AND reconciled: the smaller of the two, never the stored aggregate.
  const eligibleFundedFlow = Math.min(funded, floor(i.reconciledPoints));
  const valid = i.allocations.filter((a) => a.onChain && a.walletMatches && a.proofValid);
  const settledFlow = valid.reduce((s, a) => s + floor(a.amountFlow), 0);
  const claimedFlow = valid.filter((a) => a.claimed).reduce((s, a) => s + floor(a.amountFlow), 0);
  const available = Math.max(0, eligibleFundedFlow - settledFlow);
  const remaining = Math.max(0, MAINNET_MIN_CLAIM_FLOW - available);
  const percent = Math.min(100, Math.floor((available / MAINNET_MIN_CLAIM_FLOW) * 100));
  const allocation = pickAllocation(i.allocations);
  const lc = claimLifecycle({
    earnedPoints: floor(i.storedFlowPoints),
    fundedEligiblePoints: eligibleFundedFlow,
    alreadySettledPoints: settledFlow,
    allocation: allocation && !(allocation.claimed && available >= MAINNET_MIN_CLAIM_FLOW) ? allocation : null,
    nowSec: i.nowSec,
  });
  const settlementReady =
    i.walletBound && i.reconciliationOk && floor(i.reviewHeldPoints) === 0 && available >= MAINNET_MIN_CLAIM_FLOW;
  // Lifecycle ELIGIBLE requires every settlement gate, not just the amount.
  const lifecycle: ClaimLifecycle = lc.state === "ELIGIBLE_FOR_SETTLEMENT" && !settlementReady ? "FUNDED" : lc.state;
  const lifecycleLabel =
    lifecycle !== lc.state ? `${available.toLocaleString("en-US")} FLOW reached — settlement needs a bound wallet and completed review` : lc.label;
  return {
    minimum: MAINNET_MIN_CLAIM_FLOW,
    earnedPoints: floor(i.storedFlowPoints),
    eligibleFundedFlow,
    settledFlow,
    claimedFlow,
    availableTowardMinimum: available,
    remainingToMinimum: remaining,
    percent,
    thresholdsReached: PROGRESS_THRESHOLDS.filter((t) => percent >= t),
    pendingUnfunded,
    reviewHeld: floor(i.reviewHeldPoints),
    testnetExcluded: testnet,
    historicalNonclaimable: floor(i.historicalNonclaimable),
    sources,
    settlementReady,
    lifecycle,
    lifecycleLabel,
    claimButton: lc.claimButton,
    allocation,
  };
}
