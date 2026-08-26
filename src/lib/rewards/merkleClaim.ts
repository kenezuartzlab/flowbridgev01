/**
 * FlowBridge V30.1B.2 — canonical Merkle claim encoding + fail-closed claim
 * preparation for the budgeted epoch distributor.
 *
 * The leaf encoding here is a byte-exact mirror of
 * `FlowRewardsMerkleDistributor.leafHash`:
 *
 *   keccak256(keccak256(abi.encode(chainId, distributor, epochId, index, account, amount)))
 *
 * Binding chainId and the distributor address means a manifest can never be
 * replayed on another chain or another deployment. OpenZeppelin's commutative
 * `_hashPair` (sorted keccak of the two 32-byte words) is used for parent nodes.
 *
 * Nothing here is monetary authority on its own: the contract verifies the proof
 * against a published root, and no browser-supplied amount is ever trusted.
 */
import { encodeAbiParameters, keccak256, type Hex } from 'viem';

import { allowsMerkleProofClaims } from './flowRewardsModel';

export interface MerkleClaimLeaf {
  epochId: number;
  index: number;
  account: Hex;
  /** FLOW base units, decimal string (never a float). */
  amount: string;
}

export function merkleClaimLeafHash(args: {
  chainId: number;
  distributor: Hex;
  leaf: MerkleClaimLeaf;
}): Hex {
  const encoded = encodeAbiParameters(
    [
      { type: 'uint256' },
      { type: 'address' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'address' },
      { type: 'uint256' },
    ],
    [
      BigInt(args.chainId),
      args.distributor,
      BigInt(args.leaf.epochId),
      BigInt(args.leaf.index),
      args.leaf.account,
      BigInt(args.leaf.amount),
    ],
  );
  return keccak256(keccak256(encoded));
}

/** OpenZeppelin MerkleProof commutative pair hash. */
export function hashPair(a: Hex, b: Hex): Hex {
  const [x, y] = BigInt(a) < BigInt(b) ? [a, b] : [b, a];
  return keccak256(`0x${x.slice(2)}${y.slice(2)}` as Hex);
}

/** Recompute a root from a leaf + proof, exactly as the contract does. */
export function processProof(leaf: Hex, proof: readonly Hex[]): Hex {
  return proof.reduce<Hex>((computed, sibling) => hashPair(computed, sibling), leaf);
}

export function verifyMerkleProof(args: { leaf: Hex; proof: readonly Hex[]; root: Hex }): boolean {
  return processProof(args.leaf, args.proof).toLowerCase() === args.root.toLowerCase();
}

/** claim(uint256,uint256,address,uint256,bytes32[]) */
export const MERKLE_DISTRIBUTOR_CLAIM_ABI = [
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'epochId', type: 'uint256' },
      { name: 'index', type: 'uint256' },
      { name: 'account', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'proof', type: 'bytes32[]' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'freeBalance',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalReserved',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'totalClaimed',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'isClaimed',
    stateMutability: 'view',
    inputs: [{ type: 'uint256' }, { type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
] as const;

export type MerkleClaimBlockedReason =
  | 'modelNotCanonicalForChain'
  | 'distributorNotDeployed'
  | 'noPublishedEpoch'
  | 'noAllocationForAccount'
  | 'claimWindowNotOpen'
  | 'claimWindowClosed'
  | 'alreadyClaimed'
  | 'epochNotLive'
  | 'proofInvalid'
  | 'distributorUnderfunded';

export const MERKLE_CLAIM_BLOCKED_COPY: Record<MerkleClaimBlockedReason, string> = {
  modelNotCanonicalForChain: 'FLOW claims on this network do not use the epoch distributor.',
  distributorNotDeployed: 'Mainnet reward distributor pending promotion — no claim exists yet.',
  noPublishedEpoch: 'No reward epoch has been published yet.',
  noAllocationForAccount: 'This wallet has no allocation in the current reward epoch.',
  claimWindowNotOpen: 'The claim window for this epoch has not opened yet.',
  claimWindowClosed: 'The claim window for this epoch has closed.',
  alreadyClaimed: 'This allocation has already been claimed on-chain.',
  epochNotLive: 'This reward epoch is no longer live.',
  proofInvalid: 'The reward proof does not match the published epoch root.',
  distributorUnderfunded: 'The distributor is not funded for this allocation.',
};

export interface PublishedEpochState {
  epochId: number;
  root: Hex;
  /** Unix seconds. */
  claimStart: number;
  claimEnd: number;
  cancelled: boolean;
  released: boolean;
  /** Distributor FLOW balance and live reservation, base units as strings. */
  distributorBalance: string;
  totalReserved: string;
}

export type MerkleClaimPreparation =
  | { claimable: false; reason: MerkleClaimBlockedReason; message: string }
  | {
      claimable: true;
      chainId: number;
      distributor: Hex;
      epochId: number;
      index: number;
      account: Hex;
      amount: string;
      proof: readonly Hex[];
      claimEnd: number;
    };

function blocked(reason: MerkleClaimBlockedReason): MerkleClaimPreparation {
  return { claimable: false, reason, message: MERKLE_CLAIM_BLOCKED_COPY[reason] };
}

/**
 * Fail-closed preparation. Every unknown or missing input blocks the claim; a
 * preparation is only returned when the published epoch, the proof and the
 * distributor's funded reservation all agree.
 */
export function prepareMerkleClaim(args: {
  chainId: number;
  distributor: Hex | null;
  epoch: PublishedEpochState | null;
  leaf: MerkleClaimLeaf | null;
  proof: readonly Hex[] | null;
  alreadyClaimed: boolean;
  nowSeconds: number;
}): MerkleClaimPreparation {
  if (!allowsMerkleProofClaims(args.chainId)) return blocked('modelNotCanonicalForChain');
  if (!args.distributor) return blocked('distributorNotDeployed');
  if (!args.epoch) return blocked('noPublishedEpoch');
  if (args.epoch.cancelled || args.epoch.released) return blocked('epochNotLive');
  if (!args.leaf || !args.proof) return blocked('noAllocationForAccount');
  if (BigInt(args.leaf.amount) <= 0n) return blocked('noAllocationForAccount');
  if (args.alreadyClaimed) return blocked('alreadyClaimed');
  if (args.nowSeconds < args.epoch.claimStart) return blocked('claimWindowNotOpen');
  if (args.nowSeconds > args.epoch.claimEnd) return blocked('claimWindowClosed');

  const leafHash = merkleClaimLeafHash({
    chainId: args.chainId,
    distributor: args.distributor,
    leaf: args.leaf,
  });
  if (!verifyMerkleProof({ leaf: leafHash, proof: args.proof, root: args.epoch.root })) {
    return blocked('proofInvalid');
  }

  // The reservation must actually be funded, and it must cover this allocation.
  const balance = BigInt(args.epoch.distributorBalance);
  const reserved = BigInt(args.epoch.totalReserved);
  const amount = BigInt(args.leaf.amount);
  if (balance < reserved || reserved < amount) return blocked('distributorUnderfunded');

  return {
    claimable: true,
    chainId: args.chainId,
    distributor: args.distributor,
    epochId: args.leaf.epochId,
    index: args.leaf.index,
    account: args.leaf.account,
    amount: args.leaf.amount,
    proof: args.proof,
    claimEnd: args.epoch.claimEnd,
  };
}
