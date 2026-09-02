/**
 * FlowBridge V30.2B P1 — CANONICAL MAINNET CONTRACT REGISTRY (BOT Mainnet 677).
 *
 * Single source of truth for which economic contracts the production
 * application may select on BOT Mainnet. Fail-closed by construction:
 *
 *  - Only the six verified V30.2B addresses below are canonically selectable.
 *  - Every superseded V30.1 / V30.2A address is permanently recorded for audit
 *    history, and can never resolve as canonical (`isSupersededAddress`).
 *  - Lifecycle is a strict ladder: DEPLOYED_VERIFIED → FUNDED_READY →
 *    FEATURE_ACTIVE. FUNDED_READY means live funding has been reconciled on
 *    chain; it does NOT enable any user-facing execution path.
 *  - Feature activation is a separate, all-false switchboard. No claim, stake
 *    or reward-publication transaction may be prepared while it stays false.
 *  - Router v3 stays the live swap router, Router V4 stays unpromoted, and the
 *    official BOT Bridge stays direct. This module never touches them.
 *
 * Nothing here signs, broadcasts, funds or activates anything.
 */
import { BOT_MAINNET_CHAIN_ID, BOT_TESTNET_CHAIN_ID } from '@/lib/network/canonicalNetworks';

export type Hex = `0x${string}`;

/** Strict lifecycle ladder for a canonical mainnet contract. */
export type CanonicalLifecycleState = 'DEPLOYED_VERIFIED' | 'FUNDED_READY' | 'FEATURE_ACTIVE';

export const CANONICAL_LIFECYCLE_ORDER: readonly CanonicalLifecycleState[] = [
  'DEPLOYED_VERIFIED',
  'FUNDED_READY',
  'FEATURE_ACTIVE',
] as const;

export type CanonicalContractId =
  | 'FlowToken'
  | 'FlowRewardsMerkleDistributor'
  | 'FlowBridgeActivityRegistry'
  | 'FlowStakingRewardTreasury'
  | 'FlowStakingController'
  | 'FlowStakingVaultV2';

export interface CanonicalContractEntry {
  contractId: CanonicalContractId;
  /** Redeploy stage that produced this address. */
  stage: 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6';
  chainId: typeof BOT_MAINNET_CHAIN_ID;
  address: Hex;
  lifecycle: CanonicalLifecycleState;
  /** Public source verification on the BOT explorer. */
  sourceVerified: true;
  /** Live-reconciled FLOW balance in whole FLOW (18 decimals assumed). */
  fundedFlow: string;
  /** True once an end-user feature reads/writes this contract in production. */
  featureActive: boolean;
}

/** The only mainnet economic addresses the app may select. */
export const V30_2B_CANONICAL_CONTRACTS: readonly CanonicalContractEntry[] = [
  {
    contractId: 'FlowToken',
    stage: 'R1',
    chainId: BOT_MAINNET_CHAIN_ID,
    address: '0xcaaB50F36252a57529AFeF651fa6B9f9281917fF',
    lifecycle: 'FUNDED_READY',
    sourceVerified: true,
    fundedFlow: '1000000000',
    featureActive: false,
  },
  {
    contractId: 'FlowRewardsMerkleDistributor',
    stage: 'R2',
    chainId: BOT_MAINNET_CHAIN_ID,
    address: '0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922',
    // V30.2B P2E: genesis canary epoch 1 published (root
    // 0xe5cf2f…6456) and claimed on chain, so the user-facing claim surface
    // reads this contract in production.
    lifecycle: 'FEATURE_ACTIVE',
    sourceVerified: true,
    fundedFlow: '1000000',
    featureActive: true,
  },
  {
    contractId: 'FlowBridgeActivityRegistry',
    stage: 'R3',
    chainId: BOT_MAINNET_CHAIN_ID,
    address: '0x86590b7C8A2Ad9a1dAD8183Eaf627AE4B7Ff3814',
    lifecycle: 'DEPLOYED_VERIFIED',
    sourceVerified: true,
    fundedFlow: '0',
    featureActive: false,
  },
  {
    contractId: 'FlowStakingRewardTreasury',
    stage: 'R4',
    chainId: BOT_MAINNET_CHAIN_ID,
    address: '0x96552909998F3DbAf5Ff4979dc158508b3442e65',
    lifecycle: 'FUNDED_READY',
    sourceVerified: true,
    fundedFlow: '10000000',
    featureActive: false,
  },
  {
    contractId: 'FlowStakingController',
    stage: 'R5',
    chainId: BOT_MAINNET_CHAIN_ID,
    address: '0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF',
    lifecycle: 'DEPLOYED_VERIFIED',
    sourceVerified: true,
    fundedFlow: '0',
    featureActive: false,
  },
  {
    contractId: 'FlowStakingVaultV2',
    stage: 'R6',
    chainId: BOT_MAINNET_CHAIN_ID,
    address: '0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D',
    lifecycle: 'DEPLOYED_VERIFIED',
    sourceVerified: true,
    fundedFlow: '0',
    featureActive: false,
  },
] as const;

/**
 * Superseded mainnet addresses (V30.1 stack + the V30.2A FlowToken candidate).
 * Preserved for deployment/audit history only — never canonically selectable.
 */
export const SUPERSEDED_MAINNET_ADDRESSES: readonly {
  contractId: string;
  address: Hex;
  supersededBy: CanonicalContractId;
  generation: 'V30.1' | 'V30.2A';
}[] = [
  {
    contractId: 'FlowToken',
    address: '0x535dDDA826142AC42cE288154e9595f080940aE9',
    supersededBy: 'FlowToken',
    generation: 'V30.1',
  },
  {
    contractId: 'FlowRewardsMerkleDistributor',
    address: '0x3824681c3560A63e1c9ceDABBfcAB2691c5673FB',
    supersededBy: 'FlowRewardsMerkleDistributor',
    generation: 'V30.1',
  },
  {
    contractId: 'FlowBridgeActivityRegistry',
    address: '0xa80d8740f378989F649ca14C54e4B4a42E68753c',
    supersededBy: 'FlowBridgeActivityRegistry',
    generation: 'V30.1',
  },
  {
    contractId: 'FlowStakingRewardTreasury',
    address: '0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e',
    supersededBy: 'FlowStakingRewardTreasury',
    generation: 'V30.1',
  },
  {
    contractId: 'FlowStakingController',
    address: '0x5095ecc7226AD6dEceE99846Bc83363cA41b52bf',
    supersededBy: 'FlowStakingController',
    generation: 'V30.1',
  },
  {
    contractId: 'FlowStakingVaultV2',
    address: '0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8',
    supersededBy: 'FlowStakingVaultV2',
    generation: 'V30.1',
  },
  {
    contractId: 'FlowToken',
    address: '0x123E64D074FD5d66DBd4BD62Dc4e71da7101DB63',
    supersededBy: 'FlowToken',
    generation: 'V30.2A',
  },
] as const;

/**
 * Feature activation switchboard. Every flag is false in P1 — the registry
 * migration is address selection only, never activation.
 */
export const V30_2B_FEATURE_ACTIVATION = {
  rewardClaimsEnabled: false,
  stakingExecutionEnabled: false,
  dynamicStakingEnabled: false,
  oracleConfigured: false,
  stakingPublisherAssigned: false,
  rewardRootPublished: false,
  /** Untouched pre-existing swap/bridge posture, restated for the matrix. */
  routerV3Live: true,
  routerV4Promoted: false,
  officialBridgeDirect: true,
} as const;

export type V30_2BFeatureFlag = keyof typeof V30_2B_FEATURE_ACTIVATION;

const norm = (a: string) => a.toLowerCase();

export function getCanonicalContract(id: CanonicalContractId): CanonicalContractEntry {
  const entry = V30_2B_CANONICAL_CONTRACTS.find((c) => c.contractId === id);
  if (!entry) throw new Error(`no canonical V30.2B contract for ${id}`);
  return entry;
}

/** Canonical address resolution. Only mainnet 677 resolves here. */
export function resolveCanonicalAddress(
  chainId: number,
  id: CanonicalContractId,
): Hex | null {
  if (chainId !== BOT_MAINNET_CHAIN_ID) return null;
  return getCanonicalContract(id).address;
}

export function isSupersededAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  return SUPERSEDED_MAINNET_ADDRESSES.some((s) => norm(s.address) === norm(address));
}

/** True only for one of the six verified V30.2B mainnet addresses. */
export function isCanonicalMainnetAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  return V30_2B_CANONICAL_CONTRACTS.some((c) => norm(c.address) === norm(address));
}

/**
 * Fail-closed selection guard used by any consumer that wants a mainnet
 * economic address. Superseded and unknown addresses are rejected.
 */
export function assertCanonicalSelection(address: string): Hex {
  if (isSupersededAddress(address)) {
    throw new Error(`superseded mainnet address may never be selected: ${address}`);
  }
  if (!isCanonicalMainnetAddress(address)) {
    throw new Error(`address is not part of the V30.2B canonical registry: ${address}`);
  }
  return address as Hex;
}

export interface ActivationMatrixRow {
  contractId: CanonicalContractId;
  address: Hex;
  lifecycle: CanonicalLifecycleState;
  /** Feature flags that must all be true before this contract can execute. */
  requiredFlags: readonly V30_2BFeatureFlag[];
  featureActive: false;
}

export function activationMatrix(): readonly ActivationMatrixRow[] {
  const flags: Record<CanonicalContractId, readonly V30_2BFeatureFlag[]> = {
    FlowToken: [],
    FlowRewardsMerkleDistributor: ['rewardClaimsEnabled', 'rewardRootPublished'],
    FlowBridgeActivityRegistry: [],
    FlowStakingRewardTreasury: ['stakingExecutionEnabled'],
    FlowStakingController: ['stakingExecutionEnabled', 'stakingPublisherAssigned'],
    FlowStakingVaultV2: ['stakingExecutionEnabled'],
  };
  return V30_2B_CANONICAL_CONTRACTS.map((c) => ({
    contractId: c.contractId,
    address: c.address,
    lifecycle: c.lifecycle,
    requiredFlags: flags[c.contractId],
    featureActive: c.featureActive,
  }));
}

/** No mainnet economic transaction may be prepared while any gate is closed. */
export function canPrepareMainnetEconomicAction(
  action: 'CLAIM_FLOW' | 'STAKE_FLOW' | 'UNSTAKE_FLOW',
): boolean {
  if (action === 'CLAIM_FLOW') {
    return (
      V30_2B_FEATURE_ACTIVATION.rewardClaimsEnabled &&
      V30_2B_FEATURE_ACTIVATION.rewardRootPublished
    );
  }
  return V30_2B_FEATURE_ACTIVATION.stakingExecutionEnabled;
}

/** Chain ids this registry accepts. 968 is testnet-only; 1024 never resolves. */
export const REGISTRY_ALLOWED_CHAIN_IDS: readonly number[] = [
  BOT_MAINNET_CHAIN_ID,
  BOT_TESTNET_CHAIN_ID,
] as const;
