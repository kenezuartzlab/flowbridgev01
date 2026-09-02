/**
 * FlowBridge V30.2B P2F — rewards security regression (read-only, pure).
 *
 * Adversarial coverage for the live BOT Mainnet claim path: every wrong
 * account, amount, epoch, index, proof, network, stale root, already-claimed
 * leaf, closed/unopened window and paused/cancelled epoch must fail closed.
 */
import { describe, expect, it } from 'vitest';
import type { Hex } from 'viem';

import {
  MAINNET_EPOCH_MANIFESTS,
  findMainnetEntitlement,
} from './mainnetEpochManifest';
import {
  merkleClaimLeafHash,
  prepareMerkleClaim,
  verifyMerkleProof,
  type MerkleClaimLeaf,
  type PublishedEpochState,
} from './merkleClaim';
import { BOT_MAINNET_CHAIN_ID, BOT_TESTNET_CHAIN_ID } from './flowRewardsRegistry';

const manifest = MAINNET_EPOCH_MANIFESTS[0];
const entitlement = manifest.entitlements[0];
const distributor = manifest.distributor;
const leaf: MerkleClaimLeaf = {
  epochId: entitlement.epochId,
  index: entitlement.index,
  account: entitlement.account,
  amount: entitlement.amount,
};
const NOW = manifest.claimStart + 60;

const liveEpoch: PublishedEpochState = {
  epochId: manifest.epochId,
  root: manifest.root,
  claimStart: manifest.claimStart,
  claimEnd: manifest.claimEnd,
  cancelled: false,
  released: false,
  distributorBalance: '1000000000000000000000000',
  totalReserved: manifest.allocationWei,
};

const prep = (over: Partial<Parameters<typeof prepareMerkleClaim>[0]> = {}) =>
  prepareMerkleClaim({
    chainId: BOT_MAINNET_CHAIN_ID,
    distributor,
    epoch: liveEpoch,
    leaf,
    proof: entitlement.proof,
    alreadyClaimed: false,
    nowSeconds: NOW,
    ...over,
  });

describe('P2F: mainnet claim happy path is exactly the frozen leaf', () => {
  it('prepares only the manifest account/amount/epoch/index', () => {
    const p = prep();
    expect(p.claimable).toBe(true);
    if (!p.claimable) return;
    expect(p.account).toBe(entitlement.account);
    expect(p.amount).toBe(manifest.allocationWei);
    expect(p.epochId).toBe(1);
    expect(p.index).toBe(0);
    expect(p.distributor).toBe(distributor);
  });

  it('the frozen proof reproduces the published on-chain root', () => {
    const hash = merkleClaimLeafHash({ chainId: BOT_MAINNET_CHAIN_ID, distributor, leaf });
    expect(verifyMerkleProof({ leaf: hash, proof: entitlement.proof, root: manifest.root })).toBe(true);
  });
});

describe('P2F: claim integrity fails closed', () => {
  it('wrong account', () => {
    const p = prep({ leaf: { ...leaf, account: '0x000000000000000000000000000000000000dEaD' } });
    expect(p).toMatchObject({ claimable: false, reason: 'proofInvalid' });
  });

  it('inflated amount', () => {
    const p = prep({ leaf: { ...leaf, amount: '2000000000000000000' } });
    expect(p).toMatchObject({ claimable: false, reason: 'proofInvalid' });
  });

  it('wrong epoch id', () => {
    expect(prep({ leaf: { ...leaf, epochId: 2 } })).toMatchObject({ reason: 'proofInvalid' });
  });

  it('wrong leaf index', () => {
    expect(prep({ leaf: { ...leaf, index: 1 } })).toMatchObject({ reason: 'proofInvalid' });
  });

  it('forged proof', () => {
    const forged = ['0x'.padEnd(66, 'a')] as unknown as readonly Hex[];
    expect(prep({ proof: forged })).toMatchObject({ reason: 'proofInvalid' });
  });

  it('stale / substituted on-chain root', () => {
    const stale = { ...liveEpoch, root: ('0x' + '11'.repeat(32)) as Hex };
    expect(prep({ epoch: stale })).toMatchObject({ reason: 'proofInvalid' });
  });

  it('already-claimed leaf cannot be replayed', () => {
    expect(prep({ alreadyClaimed: true })).toMatchObject({ reason: 'alreadyClaimed' });
  });

  it('window not open yet', () => {
    expect(prep({ nowSeconds: manifest.claimStart - 1 })).toMatchObject({ reason: 'claimWindowNotOpen' });
  });

  it('window closed', () => {
    expect(prep({ nowSeconds: manifest.claimEnd + 1 })).toMatchObject({ reason: 'claimWindowClosed' });
  });

  it('cancelled or released epoch', () => {
    expect(prep({ epoch: { ...liveEpoch, cancelled: true } })).toMatchObject({ reason: 'epochNotLive' });
    expect(prep({ epoch: { ...liveEpoch, released: true } })).toMatchObject({ reason: 'epochNotLive' });
  });

  it('unfunded / under-reserved distributor', () => {
    expect(prep({ epoch: { ...liveEpoch, distributorBalance: '0' } })).toMatchObject({
      reason: 'distributorUnderfunded',
    });
    expect(prep({ epoch: { ...liveEpoch, totalReserved: '0' } })).toMatchObject({
      reason: 'distributorUnderfunded',
    });
  });

  it('missing epoch read (RPC failure) blocks', () => {
    expect(prep({ epoch: null })).toMatchObject({ reason: 'noPublishedEpoch' });
  });

  it('unresolved distributor blocks', () => {
    expect(prep({ distributor: null })).toMatchObject({ reason: 'distributorNotDeployed' });
  });
});

describe('P2F: network separation', () => {
  it('testnet chain id can never prepare a mainnet merkle claim', () => {
    expect(prep({ chainId: BOT_TESTNET_CHAIN_ID })).toMatchObject({
      claimable: false,
      reason: 'modelNotCanonicalForChain',
    });
  });

  it('legacy chain 1024 fails closed', () => {
    expect(prep({ chainId: 1024 })).toMatchObject({ claimable: false });
  });

  it('mainnet entitlements are invisible on any other chain', () => {
    expect(findMainnetEntitlement(BOT_TESTNET_CHAIN_ID, entitlement.account)).toBeNull();
    expect(findMainnetEntitlement(1024, entitlement.account)).toBeNull();
    expect(findMainnetEntitlement(BOT_MAINNET_CHAIN_ID, entitlement.account)).not.toBeNull();
  });

  it('an unlisted wallet has no entitlement at all', () => {
    expect(findMainnetEntitlement(BOT_MAINNET_CHAIN_ID, '0x000000000000000000000000000000000000dEaD')).toBeNull();
  });

  it('leaf hash is bound to chain id and distributor', () => {
    const a = merkleClaimLeafHash({ chainId: BOT_MAINNET_CHAIN_ID, distributor, leaf });
    const b = merkleClaimLeafHash({ chainId: BOT_TESTNET_CHAIN_ID, distributor, leaf });
    const c = merkleClaimLeafHash({
      chainId: BOT_MAINNET_CHAIN_ID,
      distributor: '0x000000000000000000000000000000000000dEaD',
      leaf,
    });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('P2F: no economic drift in the frozen manifest', () => {
  it('single epoch, single 1 FLOW leaf, allocation == leaf sum', () => {
    expect(MAINNET_EPOCH_MANIFESTS).toHaveLength(1);
    expect(manifest.entitlements).toHaveLength(1);
    expect(manifest.allocationWei).toBe('1000000000000000000');
    const sum = manifest.entitlements.reduce((t, e) => t + BigInt(e.amount), 0n);
    expect(sum.toString()).toBe(manifest.allocationWei);
  });

  it('distributor is the canonical R2 address', () => {
    expect(distributor).toBe('0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922');
  });
});
