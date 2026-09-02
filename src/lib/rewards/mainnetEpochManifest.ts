/**
 * FlowBridge V30.2B P2E — frozen BOT Mainnet 677 reward epoch manifest.
 *
 * This file is the ONLY source of mainnet claim entitlements. It is a verbatim
 * copy of the published genesis canary settlement
 * (`contracts/production/v30-2b-rewards-canary/P2C_PUBLISH_SETTLEMENT.json`):
 * epoch 1, root 0xe5cf2f…6456, allocation 1 FLOW, single leaf, empty proof.
 *
 * Hard rules:
 *  - Entitlements are never derived from FLOW Points, campaign PTS or any
 *    off-chain balance. A wallet with no frozen leaf simply has no claim.
 *  - Amounts here are only ever a claim *candidate*: the distributor verifies
 *    the proof against the on-chain root, and the UI re-verifies locally first.
 *  - Nothing in this module reads, writes or authorizes anything.
 */
import { BOT_MAINNET_CHAIN_ID } from './flowRewardsRegistry';
import type { Hex } from 'viem';

import type { MerkleClaimLeaf } from './merkleClaim';

export interface MainnetEpochManifest {
  chainId: typeof BOT_MAINNET_CHAIN_ID;
  epochId: number;
  campaignId: string;
  distributor: Hex;
  root: Hex;
  /** Base units (wei), decimal string. */
  allocationWei: string;
  claimStart: number;
  claimEnd: number;
  publicationTxHash: Hex;
  entitlements: readonly (MerkleClaimLeaf & { proof: readonly Hex[] })[];
}

export const MAINNET_EPOCH_MANIFESTS: readonly MainnetEpochManifest[] = [
  {
    chainId: BOT_MAINNET_CHAIN_ID,
    epochId: 1,
    campaignId: 'MAINNET_GENESIS_CORE_SWAP_CANARY_V1',
    distributor: '0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922',
    root: '0xe5cf2fb350d37fce3ee74757d19d671d96c69f756f15f3227bdb6d156e8e6456',
    allocationWei: '1000000000000000000',
    claimStart: 1788248562,
    claimEnd: 1790840562,
    publicationTxHash:
      '0x23a134d3b3d6ac7b43d7cf9e616f7725c21e894383612ff394ab3f702f222e63',
    entitlements: [
      {
        epochId: 1,
        index: 0,
        account: '0x3d8a7fa490f9db09dd8006b74688213ace9c0164',
        amount: '1000000000000000000',
        proof: [],
      },
    ],
  },
] as const;

export interface MainnetEntitlementMatch {
  manifest: MainnetEpochManifest;
  leaf: MerkleClaimLeaf;
  proof: readonly Hex[];
}

const norm = (a: string) => a.toLowerCase();

/**
 * Frozen-manifest lookup. Mainnet only; any other chain resolves to nothing so
 * testnet identities can never surface a mainnet entitlement.
 */
export function findMainnetEntitlement(
  chainId: number | null | undefined,
  wallet: string | null | undefined,
): MainnetEntitlementMatch | null {
  if (chainId !== BOT_MAINNET_CHAIN_ID || !wallet) return null;
  for (const manifest of MAINNET_EPOCH_MANIFESTS) {
    const hit = manifest.entitlements.find((e) => norm(e.account) === norm(wallet));
    if (hit) {
      const { proof, ...leaf } = hit;
      return { manifest, leaf, proof };
    }
  }
  return null;
}

/** Latest published mainnet epoch id, or null when nothing is published. */
export function latestMainnetEpochId(): number | null {
  return MAINNET_EPOCH_MANIFESTS.length
    ? Math.max(...MAINNET_EPOCH_MANIFESTS.map((m) => m.epochId))
    : null;
}
