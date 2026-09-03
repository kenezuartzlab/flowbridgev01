/**
 * FlowBridge V30.2B P3D — BOT Mainnet 677 locked Genesis staking policy.
 *
 * Locked products (30D / 90D / 180D / 365D) become executable ONLY from the
 * live deployed `quoteOpen()` result for the connected wallet plus live pause /
 * emergency / product / capacity / funding reads. Nothing here infers
 * eligibility from a static table, from another wallet, or from a previous
 * gate: the quote is the authority for Genesis rate, Genesis duration and the
 * reserved obligations, and a quote that drifts before signing is rejected.
 *
 * Truth rules enforced by this module:
 *  - APR only, never APY: no compounding exists on chain.
 *  - Genesis lasts at most the wallet's remaining eligible Genesis reward-days;
 *    afterwards the current production behaviour is the reserved floor-only
 *    path while the oracle stays unset. Target / hard-cap variable rates are
 *    never presented as current earnings.
 *  - Approval is exact (never unlimited) and always a separate confirmation
 *    from opening the position.
 */
import { V30_2B_FEATURE_ACTIVATION } from '@/lib/deploy/v302bCanonicalRegistry';
import { BOT_MAINNET_CHAIN_ID } from '@/lib/network/canonicalNetworks';
import { LOCKED_PRODUCT_IDS, type LockedProductId } from './mainnetLockedProducts';

export { LOCKED_PRODUCT_IDS };
export type { LockedProductId };

export const LOCKED_PRODUCT_LABELS: Readonly<Record<LockedProductId, string>> = {
  1: '30 Days',
  2: '90 Days',
  3: '180 Days',
  4: '365 Days',
};

/** P3D activates locked Genesis execution only when staking execution is on. */
export function isLockedStakingActivated(): boolean {
  return (
    V30_2B_FEATURE_ACTIVATION.stakingExecutionEnabled &&
    V30_2B_FEATURE_ACTIVATION.lockedGenesisStakingEnabled
  );
}

/** Exactly the values returned by the deployed vault `quoteOpen()`. */
export interface LiveLockedQuote {
  productId: LockedProductId;
  principalWei: bigint;
  lockSeconds: number;
  genesisRateBps: number;
  genesisSeconds: number;
  genesisReservedWei: bigint;
  floorRateBps: number;
  floorReservedWei: bigint;
  /** Chain timestamp the quote was read at — used for maturity and staleness. */
  quotedAt: number;
}

export interface LockedExecutionGates {
  chainId: number;
  vaultPaused: boolean;
  emergencyMode: boolean;
  productActive: boolean;
  oracle: string;
  minPrincipalWei: bigint;
  walletBalanceWei: bigint;
  allowanceWei: bigint;
  treasuryFreeWei: bigint;
  genesisYear1RemainingWei: bigint;
  standardYear1RemainingWei: bigint;
  /** Defaults to the registry activation flag; explicit only for tests. */
  activated?: boolean;
}

export type LockedExecutionDecision = 'EXECUTABLE' | 'BLOCKED';

export interface LockedExecutionEvaluation {
  decision: LockedExecutionDecision;
  blockers: string[];
  /** TX1 is required whenever the live allowance is not already exact. */
  needsApproval: boolean;
  /** Exact allowance to request — never unlimited. */
  exactAllowanceWei: bigint;
  totalReservedWei: bigint;
  maturityAt: number;
  /** True when the live quote covers the entire lock with Genesis. */
  genesisCoversTerm: boolean;
  /** True when part of the term is reserved floor-only (no variable bonus). */
  postGenesisFloorOnly: boolean;
}

/**
 * Fail-closed evaluation. Every blocker comes from live state or from the live
 * quote; no static product assumption can unlock a product.
 */
export function evaluateLockedExecution(
  quote: LiveLockedQuote,
  gates: LockedExecutionGates,
): LockedExecutionEvaluation {
  const blockers: string[] = [];

  const activated = gates.activated ?? isLockedStakingActivated();
  if (!activated) blockers.push('Locked staking is not activated.');
  if (gates.chainId !== BOT_MAINNET_CHAIN_ID) blockers.push('Switch to BOT Mainnet to stake.');
  if (gates.vaultPaused) blockers.push('The staking vault is paused on chain.');
  if (gates.emergencyMode) blockers.push('The staking controller is in emergency mode.');
  if (!gates.productActive) blockers.push('This product is not active on chain.');
  if (quote.principalWei <= 0n) blockers.push('Enter an amount of FLOW to stake.');
  if (quote.principalWei > 0n && quote.principalWei < gates.minPrincipalWei) {
    blockers.push('Amount is below the live minimum stake for this product.');
  }
  if (quote.principalWei > gates.walletBalanceWei) {
    blockers.push('Your wallet FLOW balance is below this amount.');
  }
  if (quote.lockSeconds <= 0) blockers.push('This is not a locked product.');

  // Reserved obligations must fit live capacity and funded inventory.
  if (quote.floorReservedWei <= 0n) {
    blockers.push('The reserved floor obligation rounds to zero at this amount — increase it.');
  }
  if (quote.floorReservedWei > gates.standardYear1RemainingWei) {
    blockers.push('Remaining Year-1 standard reward capacity cannot reserve this position.');
  }
  if (quote.genesisReservedWei > gates.genesisYear1RemainingWei) {
    blockers.push('Remaining Year-1 Genesis reward capacity cannot reserve this position.');
  }
  const totalReservedWei = quote.genesisReservedWei + quote.floorReservedWei;
  if (totalReservedWei > gates.treasuryFreeWei) {
    blockers.push('The pre-funded reward reserve cannot fully fund this position right now.');
  }

  // Per-wallet Genesis eligibility comes ONLY from this wallet's live quote.
  const genesisCoversTerm = quote.genesisSeconds >= quote.lockSeconds;
  if (quote.genesisSeconds <= 0) {
    blockers.push(
      'This wallet has no Genesis reward-days left, so this locked term would earn the reserved floor rate only.',
    );
  }

  return {
    decision: blockers.length === 0 ? 'EXECUTABLE' : 'BLOCKED',
    blockers,
    needsApproval: gates.allowanceWei < quote.principalWei,
    exactAllowanceWei: quote.principalWei,
    totalReservedWei,
    maturityAt: quote.quotedAt + quote.lockSeconds,
    genesisCoversTerm,
    postGenesisFloorOnly: !genesisCoversTerm,
  };
}

/** Terms freeze: the signed quote must be the quote shown. */
export function lockedQuoteFingerprint(q: LiveLockedQuote): string {
  return [
    'p3d',
    q.productId,
    q.principalWei.toString(),
    q.lockSeconds,
    q.genesisRateBps,
    q.genesisSeconds,
    q.genesisReservedWei.toString(),
    q.floorRateBps,
    q.floorReservedWei.toString(),
  ].join(':');
}

export function isLockedQuoteStale(shown: LiveLockedQuote, atSign: LiveLockedQuote): boolean {
  return lockedQuoteFingerprint(shown) !== lockedQuoteFingerprint(atSign);
}

export interface LockedPhaseCopy {
  genesis: string;
  /** null when Genesis covers the whole locked term. */
  postGenesis: string | null;
  /** Always-on truth footnote. */
  reserveNote: string;
}

const days = (seconds: number) => Math.floor(seconds / 86_400);
const pct = (bps: number) => `${(bps / 100).toFixed(1)}%`;

/**
 * Copy derived only from the live quote: Genesis phase first, then the reserved
 * floor-only phase. Variable target / hard-cap economics are never quoted as
 * current earnings.
 */
export function lockedPhaseCopy(q: LiveLockedQuote): LockedPhaseCopy {
  const genesis =
    q.genesisSeconds > 0
      ? `Genesis phase: ${pct(q.genesisRateBps)} APR for ${days(q.genesisSeconds)} of ${days(
          q.lockSeconds,
        )} locked days, reserved up front from the pre-funded reward reserve.`
      : `No Genesis reward-days remain for this wallet, so no Genesis phase applies to this position.`;
  const postGenesis =
    q.genesisSeconds >= q.lockSeconds
      ? null
      : `After Genesis: ${pct(q.floorRateBps)} APR reserved floor only for the remaining ${days(
          q.lockSeconds - q.genesisSeconds,
        )} days. Variable bonus rewards are unavailable in production today and are not included.`;
  return {
    genesis,
    postGenesis,
    reserveNote:
      'Rewards are paid from the pre-funded, segregated staking reward reserve — FLOW is never minted for rewards, and your principal is held separately. APR, never compounded. Locked principal is withdrawable at maturity only.',
  };
}

/** UI-facing state when live reads fail — execution must be disabled. */
export const LOCKED_UNAVAILABLE_COPY =
  'Live staking terms could not be read from BOT Mainnet. Staking is unavailable — retry in a moment.';
