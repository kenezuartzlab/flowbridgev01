/**
 * FlowBridge V30.1C §4 — canonical Staking v2 product matrix (TypeScript view).
 *
 * This module is a DESCRIPTIVE MIRROR of the on-chain authority:
 * `contracts/production/staking-v2/FlowStakingController.sol` (constructor
 * `_setProduct` lines) and `FlowStakingVaultV2.sol` (GENESIS_MAX_SECONDS).
 * It is never an independent economic authority — src/lib/staking/
 * stakingV2Matrix.parity.test.ts asserts every constant against the contract
 * source, and any drift fails the build gate.
 *
 * Nothing here signs, prepares or executes. All figures are Preview-only until
 * canonical contract settlement exists.
 */

export const STAKING_V2_VERSION = 'v30.1c' as const;

/** Mirror of FlowStakingController / FlowStakingVaultV2 constants. */
export const STAKING_V2_CONSTANTS = {
  BPS: 10_000,
  YEAR_SECONDS: 365 * 86_400,
  EPOCH_SECONDS: 7 * 86_400,
  PRODUCT_COUNT: 5,
  /** FlowStakingVaultV2.GENESIS_MAX_SECONDS — lifetime per wallet, anti-reset. */
  GENESIS_MAX_SECONDS: 90 * 86_400,
  GENESIS_YEAR1_CAP_FLOW: 1_000_000,
  STANDARD_YEAR1_CAP_FLOW: 2_000_000,
  TOTAL_YEAR1_CAP_FLOW: 3_000_000,
} as const;

export interface StakingV2Product {
  id: number;
  key: 'flexible' | 'lock30' | 'lock90' | 'lock180' | 'lock365';
  label: string;
  lockSeconds: number;
  /** null for Flexible (exit anytime). */
  lockDays: number | null;
  genesisAprBps: number;
  floorBps: number;
  targetBps: number;
  hardCapBps: number;
  minPrincipalFlow: number;
}

/** Canonical five-product matrix — MUST match the controller constructor. */
export const STAKING_V2_PRODUCTS: readonly StakingV2Product[] = [
  { id: 0, key: 'flexible', label: 'Flexible', lockSeconds: 0, lockDays: null, genesisAprBps: 1800, floorBps: 0, targetBps: 1000, hardCapBps: 1200, minPrincipalFlow: 1 },
  { id: 1, key: 'lock30', label: '30 Days', lockSeconds: 30 * 86_400, lockDays: 30, genesisAprBps: 2700, floorBps: 800, targetBps: 1400, hardCapBps: 1800, minPrincipalFlow: 1 },
  { id: 2, key: 'lock90', label: '90 Days', lockSeconds: 90 * 86_400, lockDays: 90, genesisAprBps: 3600, floorBps: 1000, targetBps: 1800, hardCapBps: 2400, minPrincipalFlow: 1 },
  { id: 3, key: 'lock180', label: '180 Days', lockSeconds: 180 * 86_400, lockDays: 180, genesisAprBps: 4800, floorBps: 1200, targetBps: 2400, hardCapBps: 3200, minPrincipalFlow: 1 },
  { id: 4, key: 'lock365', label: '365 Days', lockSeconds: 365 * 86_400, lockDays: 365, genesisAprBps: 6000, floorBps: 1500, targetBps: 3000, hardCapBps: 4000, minPrincipalFlow: 1 },
] as const;

export function stakingV2Product(id: number): StakingV2Product | null {
  return STAKING_V2_PRODUCTS.find((p) => p.id === id) ?? null;
}

/** Genesis applies for at most 90 reward-days even on 180D/365D locks. */
export function genesisWindowSeconds(product: StakingV2Product): number {
  const window = product.lockSeconds === 0 ? STAKING_V2_CONSTANTS.GENESIS_MAX_SECONDS : product.lockSeconds;
  return Math.min(window, STAKING_V2_CONSTANTS.GENESIS_MAX_SECONDS);
}

/**
 * Simple-accrual Preview estimate (APR, never APY — v2 has no automatic
 * compounding). Returns FLOW earned over `seconds` at `rateBps`.
 */
export function simpleAccrual(principalFlow: number, rateBps: number, seconds: number): number {
  if (principalFlow <= 0 || rateBps <= 0 || seconds <= 0) return 0;
  return (principalFlow * rateBps * seconds) / (STAKING_V2_CONSTANTS.BPS * STAKING_V2_CONSTANTS.YEAR_SECONDS);
}

/* ------------------------------------------------------------------------ */
/* Readiness — fail-closed, honest states only                               */
/* ------------------------------------------------------------------------ */

export type StakingV2OracleStatus =
  | { kind: 'unconfigured' }
  | { kind: 'stale' }
  | { kind: 'unsafe'; reason: 'low-liquidity' | 'high-deviation' }
  | { kind: 'healthy' };

export interface StakingV2ReadinessInput {
  /** Whether a production reference oracle is configured on this chain. */
  oracleConfigured: boolean;
  oracleStatus?: StakingV2OracleStatus;
  /** Whether the reward reserve holds enough to fund the shown obligations. */
  reserveFunded: boolean;
  /** Remaining Genesis Year-1 capacity in FLOW (null when unknown). */
  genesisCapacityRemainingFlow: number | null;
  /** Remaining Genesis reward-days for this wallet (0–90). */
  walletGenesisDaysRemaining: number | null;
  /** Mainnet promotion state for the v2 contracts. */
  contractsPromoted: boolean;
}

export type StakingV2Availability =
  | 'preview' // candidate only — no canonical settlement exists
  | 'unavailable-oracle'
  | 'unavailable-funding'
  | 'genesis-exhausted'
  | 'live';

/**
 * Fail-closed availability resolver. Without a promoted deployment AND a
 * healthy oracle AND a funded reserve, everything stays Preview; when an
 * oracle is configured but unhealthy the dynamic rate is UNAVAILABLE — the UI
 * must say so instead of inventing a rate.
 */
export function resolveStakingV2Availability(input: StakingV2ReadinessInput): StakingV2Availability {
  if (!input.contractsPromoted) return 'preview';
  if (!input.oracleConfigured) return 'unavailable-oracle';
  const os = input.oracleStatus;
  if (!os || os.kind !== 'healthy') return 'unavailable-oracle';
  if (!input.reserveFunded) return 'unavailable-funding';
  if (input.genesisCapacityRemainingFlow !== null && input.genesisCapacityRemainingFlow <= 0) {
    return 'genesis-exhausted';
  }
  return 'live';
}

/** Honest dynamic-rate label: no production FLOW/USD TWAP exists yet. */
export const STAKING_V2_DYNAMIC_RATE_STATUS =
  'unavailable — no production FLOW/USD reference oracle on BOT Mainnet 677; dynamic standard-rate publication stays fail-closed' as const;
