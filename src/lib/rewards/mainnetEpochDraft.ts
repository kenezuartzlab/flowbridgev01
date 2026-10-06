/**
 * FlowBridge V32.2 — funded BOT Mainnet 10 FLOW canary allocation that is
 * PREPARED but NOT YET PUBLISHED on chain.
 *
 * Deliberately separate from `mainnetEpochManifest.ts`, which only ever carries
 * roots that were actually published on chain. Nothing in this module can
 * produce a claim: the claim hook reports this state as "not published" and
 * never prepares a transaction from it. Once the Root Publisher signs
 * `publishEpoch`, this entry is promoted into the frozen manifest together with
 * the real publication transaction hash.
 *
 * The two ledger rows behind this allocation were reserved from the CORE_SWAP
 * budget by the server-only `reserve_reward_budget()` RPC (10 FLOW, 5 + 5), so
 * every FLOW here is backed before it is ever offered.
 */
import type { Hex } from 'viem';

import { BOT_MAINNET_CHAIN_ID } from './flowRewardsRegistry';
import type { MerkleClaimLeaf } from './merkleClaim';

export interface MainnetEpochDraft {
  chainId: typeof BOT_MAINNET_CHAIN_ID;
  /** The epoch id this root binds to. `publishEpoch` assigns it as ++epochCount. */
  epochId: number;
  campaignId: string;
  distributor: Hex;
  /** Single-leaf allocation: the root IS the leaf hash and the proof is empty. */
  root: Hex;
  /** Base units (wei), decimal string. */
  allocationWei: string;
  /** Unix seconds. */
  claimStart: number;
  claimEnd: number;
  /** `publishEpoch` reverts unless it is signed before this unix second. */
  signBefore: number;
  programId: 'CORE_SWAP';
  /** Null until the publication transaction actually lands. */
  publicationTxHash: Hex | null;
  preparedAt: string;
  entitlements: readonly (MerkleClaimLeaf & { proof: readonly Hex[] })[];
}

export const MAINNET_EPOCH_DRAFTS: readonly MainnetEpochDraft[] = [
  {
    chainId: BOT_MAINNET_CHAIN_ID,
    epochId: 2,
    campaignId: 'MAINNET_CORE_SWAP_CANARY_V2_FUNDED_10_FLOW',
    distributor: '0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922',
    root: '0x21c416d3a1dc9da9b7bab9d4d97668598713e5419b0d7fb3aa055705f090c860',
    allocationWei: '10000000000000000000',
    claimStart: 1791463369,
    claimEnd: 1794055369,
    signBefore: 1791376969,
    programId: 'CORE_SWAP',
    publicationTxHash: '0x98cd9d8689f0cf36476f1947a4468efb1a7bfececce4c9b745b98866f9d288fe',
    preparedAt: '2026-10-06T12:24:52.415Z',
    entitlements: [
      {
        epochId: 2,
        index: 0,
        account: '0x628e237b73C5a37EF3968527563FA1a26b32BB97',
        amount: '10000000000000000000',
        proof: [],
      },
    ],
  },
] as const;

export interface MainnetDraftEntitlementMatch {
  draft: MainnetEpochDraft;
  leaf: MerkleClaimLeaf;
  proof: readonly Hex[];
}

const norm = (a: string) => a.toLowerCase();

/**
 * Draft lookup. Mainnet only, and only used to explain a not-yet-claimable
 * allocation — it is never an authority for a claim transaction.
 */
export function findMainnetDraftEntitlement(
  chainId: number | null | undefined,
  wallet: string | null | undefined,
): MainnetDraftEntitlementMatch | null {
  if (chainId !== BOT_MAINNET_CHAIN_ID || !wallet) return null;
  for (const draft of MAINNET_EPOCH_DRAFTS) {
    const hit = draft.entitlements.find((e) => norm(e.account) === norm(wallet));
    if (hit) {
      const { proof, ...leaf } = hit;
      return { draft, leaf, proof };
    }
  }
  return null;
}

/** Whole FLOW a draft allocation pays, for honest copy only. */
export function draftFlowLabel(draft: MainnetEpochDraft): string {
  const wei = BigInt(draft.allocationWei);
  const whole = wei / 10n ** 18n;
  return whole > 0n ? whole.toLocaleString('en-US') : '0';
}
