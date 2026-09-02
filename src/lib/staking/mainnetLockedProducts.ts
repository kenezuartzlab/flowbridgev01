/**
 * FlowBridge V30.2B P3C — BOT Mainnet 677 locked Genesis product policy.
 *
 * Read-only classification of the four locked staking products
 * (30D / 90D / 180D / 365D) plus exact canary transaction preparation.
 *
 * Fail-closed by construction:
 *  - No locked product is publicly executable. `isLockedProductPubliclyExecutable`
 *    returns false unconditionally, so feature-flag drift alone can never turn
 *    a locked product into a live button.
 *  - 180D / 365D carry a permanent post-Genesis dependency marker: their locked
 *    term outlives the 90-day Genesis window, so the tail is covered only by
 *    the fixed floor obligation reserved at entry. That is contractually
 *    defined but has no proven live lifecycle, so they stay BLOCKED.
 *  - Canary preparation never signs, never broadcasts, never uses an unlimited
 *    approval, and always derives the exact allowance from the exact principal.
 *
 * Nothing here mutates chain state or touches the P3B Flexible path.
 */
import { V30_2B_FEATURE_ACTIVATION } from '@/lib/deploy/v302bCanonicalRegistry';
import { BOT_MAINNET_CHAIN_ID } from '@/lib/network/canonicalNetworks';
import { MAINNET_FLEXIBLE_PRODUCT_ID } from './mainnetGenesisStaking';

/** Vault constants, mirrored from the verified deployed FlowStakingVaultV2. */
export const VAULT_BPS = 10_000n;
export const VAULT_YEAR_SECONDS = 365n * 24n * 60n * 60n;
export const VAULT_GENESIS_MAX_SECONDS = 90n * 24n * 60n * 60n;

export type LockedProductId = 1 | 2 | 3 | 4;

export const LOCKED_PRODUCT_IDS: readonly LockedProductId[] = [1, 2, 3, 4] as const;

export interface LockedProductTerms {
  productId: LockedProductId;
  name: string;
  /** Live controller values read at preflight block 21831690 on chain 677. */
  lockSeconds: number;
  genesisAprBps: number;
  floorBps: number;
  minPrincipalWei: bigint;
}

export const LOCKED_PRODUCT_TERMS: Readonly<Record<LockedProductId, LockedProductTerms>> = {
  1: { productId: 1, name: '30 Days', lockSeconds: 2_592_000, genesisAprBps: 2700, floorBps: 800, minPrincipalWei: 10n ** 18n },
  2: { productId: 2, name: '90 Days', lockSeconds: 7_776_000, genesisAprBps: 3600, floorBps: 1000, minPrincipalWei: 10n ** 18n },
  3: { productId: 3, name: '180 Days', lockSeconds: 15_552_000, genesisAprBps: 4800, floorBps: 1200, minPrincipalWei: 10n ** 18n },
  4: { productId: 4, name: '365 Days', lockSeconds: 31_536_000, genesisAprBps: 6000, floorBps: 1500, minPrincipalWei: 10n ** 18n },
};

export function isLockedProductId(productId: number): productId is LockedProductId {
  return productId === 1 || productId === 2 || productId === 3 || productId === 4;
}

/**
 * A locked product outlives the Genesis window when its lock exceeds 90 days.
 * True for 180D and 365D — the structural reason they can never be fast-tracked.
 */
export function hasPostGenesisDependency(productId: LockedProductId): boolean {
  return BigInt(LOCKED_PRODUCT_TERMS[productId].lockSeconds) > VAULT_GENESIS_MAX_SECONDS;
}

/** Locked products are NEVER publicly executable in this gate. */
export function isLockedProductPubliclyExecutable(_productId: number): false {
  return false;
}

/** Deployed-arithmetic reproduction: floor obligation reserved at entry. */
export function computeFloorObligationWei(principalWei: bigint, floorBps: number, lockSeconds: number): bigint {
  if (lockSeconds <= 0) return 0n;
  return (principalWei * BigInt(floorBps) * BigInt(lockSeconds)) / (VAULT_BPS * VAULT_YEAR_SECONDS);
}

/** Deployed-arithmetic reproduction: granted Genesis seconds for a wallet. */
export function computeGenesisGrantSeconds(lockSeconds: number, walletQuotaRemainingSeconds: bigint): bigint {
  const lock = BigInt(lockSeconds);
  const window = lock === 0n ? VAULT_GENESIS_MAX_SECONDS : lock > VAULT_GENESIS_MAX_SECONDS ? VAULT_GENESIS_MAX_SECONDS : lock;
  return window < walletQuotaRemainingSeconds ? window : walletQuotaRemainingSeconds;
}

/** Deployed-arithmetic reproduction: Genesis obligation reserved at entry. */
export function computeGenesisObligationWei(principalWei: bigint, genesisAprBps: number, grantSeconds: bigint): bigint {
  if (grantSeconds <= 0n) return 0n;
  return (principalWei * BigInt(genesisAprBps) * grantSeconds) / (VAULT_BPS * VAULT_YEAR_SECONDS);
}

export interface LockedCanaryLiveState {
  chainId: number;
  vaultPaused: boolean;
  emergencyMode: boolean;
  productActive: boolean;
  oracle: string;
  epochRoleGrantedToController: boolean;
  publisherRoleGranted: boolean;
  walletBalanceWei: bigint;
  walletGenesisQuotaRemainingSeconds: bigint;
  treasuryFreeWei: bigint;
  genesisYear1RemainingWei: bigint;
  standardYear1RemainingWei: bigint;
  openLockedPositionCount: number;
  blockTimestamp: number;
}

export type LockedProductDecision = 'CANARY_READY' | 'BLOCKED';

export interface LockedCanaryQuote {
  productId: LockedProductId;
  name: string;
  principalWei: bigint;
  /** Exact allowance the user must approve — never unlimited. */
  exactAllowanceWei: bigint;
  lockSeconds: number;
  maturityAt: number;
  /** Locked products have no early exit; earliest withdrawal is maturity. */
  earliestWithdrawalAt: number;
  genesisGrantSeconds: bigint;
  genesisReservationWei: bigint;
  floorReservationWei: bigint;
  totalEntryReservationWei: bigint;
  genesisCoversFullTerm: boolean;
  postGenesisDependency: boolean;
  decision: LockedProductDecision;
  blockers: string[];
}

/**
 * Prepares — never broadcasts — the smallest exact locked-product canary.
 * Every blocker is derived from live state passed in by the caller.
 */
export function prepareLockedCanaryQuote(
  productId: LockedProductId,
  principalWei: bigint,
  live: LockedCanaryLiveState,
): LockedCanaryQuote {
  const terms = LOCKED_PRODUCT_TERMS[productId];
  const blockers: string[] = [];

  if (live.chainId !== BOT_MAINNET_CHAIN_ID) blockers.push('wrong network — locked canary is BOT Mainnet 677 only');
  if (live.vaultPaused) blockers.push('vault is paused');
  if (live.emergencyMode) blockers.push('controller emergency mode is active');
  if (!live.productActive) blockers.push('product is inactive on the controller');
  if (!/^0x0{40}$/i.test(live.oracle)) blockers.push('oracle is configured — P3C forbids oracle-dependent execution');
  if (live.epochRoleGrantedToController) blockers.push('EPOCH_ROLE is granted to the controller — standard epochs must stay disabled');
  if (live.publisherRoleGranted) blockers.push('PUBLISHER_ROLE is granted — standard rate publication must stay disabled');
  if (live.openLockedPositionCount > 0) blockers.push('a locked canary position is already open — only one at a time');
  if (principalWei < terms.minPrincipalWei) blockers.push('principal below the live minimum principal');
  if (principalWei > live.walletBalanceWei) blockers.push('wallet FLOW balance below the canary principal');

  const grantSeconds = computeGenesisGrantSeconds(terms.lockSeconds, live.walletGenesisQuotaRemainingSeconds);
  const genesisReservationWei = computeGenesisObligationWei(principalWei, terms.genesisAprBps, grantSeconds);
  const floorReservationWei = computeFloorObligationWei(principalWei, terms.floorBps, terms.lockSeconds);
  const totalEntryReservationWei = genesisReservationWei + floorReservationWei;

  if (floorReservationWei === 0n) blockers.push('floor obligation rounds to zero — openPosition would revert FloorNotReservable');
  if (floorReservationWei > live.standardYear1RemainingWei) blockers.push('floor obligation exceeds remaining standard Year-1 capacity');
  if (genesisReservationWei > live.genesisYear1RemainingWei) blockers.push('genesis obligation exceeds remaining Genesis Year-1 capacity');
  if (totalEntryReservationWei > live.treasuryFreeWei) blockers.push('total entry reservation exceeds funded reward treasury free balance');

  const postGenesisDependency = hasPostGenesisDependency(productId);
  const genesisCoversFullTerm = grantSeconds >= BigInt(terms.lockSeconds);
  if (postGenesisDependency) {
    blockers.push('locked term outlives the 90-day Genesis window — post-Genesis period has no proven live lifecycle');
  } else if (!genesisCoversFullTerm) {
    blockers.push('wallet lifetime Genesis quota is short of the locked term — not fully Genesis-covered through maturity');
  }

  const maturityAt = live.blockTimestamp + terms.lockSeconds;
  return {
    productId,
    name: terms.name,
    principalWei,
    exactAllowanceWei: principalWei,
    lockSeconds: terms.lockSeconds,
    maturityAt,
    earliestWithdrawalAt: maturityAt,
    genesisGrantSeconds: grantSeconds,
    genesisReservationWei,
    floorReservationWei,
    totalEntryReservationWei,
    genesisCoversFullTerm,
    postGenesisDependency,
    decision: blockers.length === 0 ? 'CANARY_READY' : 'BLOCKED',
    blockers,
  };
}

/**
 * Terms freeze: a quote signed later must match the quote shown. Any drift in
 * principal, reservations or maturity invalidates the authorization.
 */
export function lockedQuoteFingerprint(q: LockedCanaryQuote): string {
  return [
    'p3c',
    q.productId,
    q.principalWei.toString(),
    q.genesisGrantSeconds.toString(),
    q.genesisReservationWei.toString(),
    q.floorReservationWei.toString(),
    q.maturityAt,
  ].join(':');
}

export function isLockedQuoteStale(shown: LockedCanaryQuote, atSign: LockedCanaryQuote): boolean {
  return lockedQuoteFingerprint(shown) !== lockedQuoteFingerprint(atSign);
}

/** The Flexible path proven in P3B is the only mainnet-executable product. */
export function mainnetExecutableProductIds(): readonly number[] {
  return V30_2B_FEATURE_ACTIVATION.genesisFlexibleStakingEnabled ? [MAINNET_FLEXIBLE_PRODUCT_ID] : [];
}

export const P3C_EVIDENCE = {
  chainId: BOT_MAINNET_CHAIN_ID,
  block: 21831690,
  verdict: {
    P3C: 'PASS',
    '30D': 'CANARY_READY',
    '90D': 'BLOCKED',
    '180D': 'BLOCKED',
    '365D': 'BLOCKED',
  },
} as const;
