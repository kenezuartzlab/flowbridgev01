/**
 * V33 — controlled public Mainnet FLOW claims (pure).
 *
 * - PUBLIC_MAINNET_FLOW_CLAIMS is the single switch for ordinary users. It is
 *   OFF; turning it ON requires a separate owner release gate.
 * - Claim lifecycle states are kept distinct: eligible is never claimable.
 * - Settlement eligibility = eligibleBackedPoints - alreadySettledPoints >= 1,000,
 *   from funded, reconciled Mainnet ledger rows only.
 */
import { MAINNET_CLAIM_CANARY_EXCEPTION, MAINNET_MIN_CLAIM_FLOW } from './claimMinimumPolicy';

export const PUBLIC_MAINNET_FLOW_CLAIMS = false as boolean;

/** Rounds at or below this epoch are historical; the canary exception never applies beyond it. */
export const LAST_HISTORICAL_EPOCH = MAINNET_CLAIM_CANARY_EXCEPTION.epochId;

/**
 * Owner-approved standard claim window (V33.1, 2026-10-08): 30 days.
 * New payout rounds use claimClose = claimOpen + 30 days, matching published
 * rounds #1/#2. Previously published rounds are unchanged.
 */
export const CLAIM_WINDOW_POLICY = Object.freeze({
  currentSeconds: 30 * 86_400,
  source: 'owner-approved standard (V33.1); matches rounds #1 and #2',
  ownerApproved: true,
  status: 'APPROVED' as const,
});

export type ClaimLifecycle =
  | 'EARNED' | 'FUNDED' | 'ELIGIBLE_FOR_SETTLEMENT' | 'ALLOCATED_ON_CHAIN' | 'CLAIMABLE_NOW' | 'CLAIMED';

export interface LifecycleInput {
  earnedPoints: number;
  fundedEligiblePoints: number;
  alreadySettledPoints: number;
  allocation: null | {
    epochId: number; amountFlow: number; walletMatches: boolean; proofValid: boolean;
    onChain: boolean; claimed: boolean; claimStart: number; claimEnd: number;
  };
  nowSec: number;
  publicFlag?: boolean;
}

export function claimLifecycle(i: LifecycleInput): { state: ClaimLifecycle; label: string; claimButton: boolean } {
  const flag = i.publicFlag ?? PUBLIC_MAINNET_FLOW_CLAIMS;
  const a = i.allocation;
  if (a && a.onChain && a.walletMatches && a.proofValid) {
    if (a.claimed) return { state: 'CLAIMED', label: `Claimed ${fmt(a.amountFlow)} FLOW`, claimButton: false };
    const open = i.nowSec >= a.claimStart && i.nowSec <= a.claimEnd;
    // Historical canary rounds were claimable under their own gate; public rounds need the flag.
    const allowed = a.epochId <= LAST_HISTORICAL_EPOCH || flag;
    if (open && allowed) return { state: 'CLAIMABLE_NOW', label: `Claim ${fmt(a.amountFlow)} FLOW`, claimButton: true };
    return {
      state: 'ALLOCATED_ON_CHAIN',
      label: open ? `Allocated: ${fmt(a.amountFlow)} FLOW — public claims not open yet` : `Allocated: ${fmt(a.amountFlow)} FLOW · Claim opens: ${new Date(a.claimStart * 1000).toISOString()}`,
      claimButton: false,
    };
  }
  const available = Math.max(0, Math.floor(i.fundedEligiblePoints) - Math.floor(i.alreadySettledPoints));
  if (available >= MAINNET_MIN_CLAIM_FLOW) return { state: 'ELIGIBLE_FOR_SETTLEMENT', label: 'Eligible for next settlement batch', claimButton: false };
  if (i.fundedEligiblePoints > 0) return { state: 'FUNDED', label: `${fmt(available)} / ${fmt(MAINNET_MIN_CLAIM_FLOW)} FLOW toward minimum claim`, claimButton: false };
  return { state: 'EARNED', label: `${fmt(available)} / ${fmt(MAINNET_MIN_CLAIM_FLOW)} FLOW toward minimum claim`, claimButton: false };
}

export interface EligibilityRow {
  wallet: string | null;
  classification: string;
  pendingReview: number;
  /** Funded Mainnet ledger points (already excludes Testnet, unfunded, Campaign PTS, XP). */
  fundedPoints: number;
  /** Reconciled authoritative points. */
  authoritative: number;
  alreadySettledPoints: number;
}

const OK_CLASS = new Set(['MATCH', 'EXPLAINED_DIFFERENCE']);

/** Wallets eligible for the next ordinary settlement batch. */
export function settlementEligibility(rows: EligibilityRow[]) {
  const eligible: { wallet: string; flow: number }[] = [];
  let excludedFlow = 0;
  for (const r of rows) {
    const backed = Math.min(Math.floor(r.fundedPoints), Math.floor(r.authoritative));
    const available = Math.max(0, backed - Math.floor(r.alreadySettledPoints));
    const ok = !!r.wallet && OK_CLASS.has(r.classification) && r.pendingReview <= 0 && available >= MAINNET_MIN_CLAIM_FLOW;
    if (ok) eligible.push({ wallet: r.wallet!.toLowerCase(), flow: available });
    else excludedFlow += available;
  }
  return {
    wallets: eligible.length,
    totalFlow: eligible.reduce((t, e) => t + e.flow, 0),
    excludedBelowMinimumOrHeldFlow: excludedFlow,
    status: eligible.length ? ('BATCH_POSSIBLE' as const) : ('NO_PUBLIC_BATCH_REQUIRED_YET' as const),
  };
}

const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');
