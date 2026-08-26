/**
 * FlowBridge V30.1B.2 — canonical rewards-distribution architecture decision.
 *
 * Exactly one model is canonical for BOT Mainnet 677: the budgeted
 * Merkle/epoch distributor (`contracts/FlowRewardsMerkleDistributor.sol`). It
 * was selected over cumulative EIP-712 because a published epoch reserves its
 * whole allocation in canonical contract state BEFORE any user relies on it, so
 * solvency is enforced by the contract instead of by trusted server behaviour.
 *
 * The cumulative EIP-712 distributor remains historical BOT Testnet 968
 * infrastructure. It is never selectable on mainnet and never promoted.
 *
 * This module is pure and descriptive. It holds no addresses, signs nothing and
 * authorizes nothing.
 */
import { BOT_MAINNET_CHAIN_ID, BOT_TESTNET_CHAIN_ID } from './flowRewardsRegistry';

export type FlowRewardsModel = 'BUDGETED_MERKLE_EPOCH' | 'CUMULATIVE_EIP712';

export const CANONICAL_MAINNET_REWARDS_MODEL: FlowRewardsModel = 'BUDGETED_MERKLE_EPOCH';

export interface RewardsModelRecord {
  chainId: number;
  model: FlowRewardsModel;
  /** Canonical for this chain's future/production claims. */
  canonical: boolean;
  /** Historical/testnet-only infrastructure that must never be promoted. */
  historical: boolean;
  contractId: string;
  note: string;
}

export const FLOW_REWARDS_MODELS: readonly RewardsModelRecord[] = [
  {
    chainId: BOT_MAINNET_CHAIN_ID,
    model: 'BUDGETED_MERKLE_EPOCH',
    canonical: true,
    historical: false,
    contractId: 'FlowRewardsMerkleDistributor',
    note: 'Single canonical mainnet reward authority. Not deployed; address stays null until a promotion gate.',
  },
  {
    chainId: BOT_TESTNET_CHAIN_ID,
    model: 'CUMULATIVE_EIP712',
    canonical: false,
    historical: true,
    contractId: 'FlowRewardsDistributor',
    note: 'Historical testnet distributor. Live testnet authorizations stay testnet claims and never migrate to mainnet.',
  },
] as const;

export function getFlowRewardsModel(chainId: number | null | undefined): RewardsModelRecord | null {
  if (typeof chainId !== 'number' || !Number.isInteger(chainId)) return null;
  return FLOW_REWARDS_MODELS.find((m) => m.chainId === chainId) ?? null;
}

/** Fail-closed: only chains explicitly recorded as EIP-712 may use signer claims. */
export function allowsSignerAuthorizedClaims(chainId: number | null | undefined): boolean {
  return getFlowRewardsModel(chainId)?.model === 'CUMULATIVE_EIP712';
}

/** Fail-closed: only chains explicitly recorded as Merkle may use proof claims. */
export function allowsMerkleProofClaims(chainId: number | null | undefined): boolean {
  return getFlowRewardsModel(chainId)?.model === 'BUDGETED_MERKLE_EPOCH';
}

/**
 * Reasoning kept next to the decision so no later surface re-litigates it from
 * chat history or UI copy.
 */
export const REWARDS_MODEL_DECISION = {
  chosen: 'BUDGETED_MERKLE_EPOCH',
  rejected: 'CUMULATIVE_EIP712',
  reasons: [
    'Epoch publication reserves the full allocation on-chain and reverts unless the distributor balance already covers totalReserved + allocation.',
    'Privileged recovery is bounded by freeBalance = balance - totalReserved, so reserved obligations are unreachable by an admin.',
    'A publisher cannot exceed the manager-approved campaignBudget, separating budget authority from entitlement publication.',
    'Making cumulative EIP-712 solvent would require per-authorization on-chain reservations plus an extra write for every issued authorization — more operational writes and more complexity than a published root.',
    'Bitmap claim tracking makes replay impossible, and the leaf commits the recipient so a third-party submitter cannot redirect a payout.',
  ],
} as const;
