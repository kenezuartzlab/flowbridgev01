import { describe, expect, it } from 'vitest';

import { BOT_MAINNET_CHAIN_ID, BOT_TESTNET_CHAIN_ID } from './flowRewardsRegistry';
import {
  MAINNET_EPOCH_MANIFESTS,
  findMainnetEntitlement,
  latestMainnetEpochId,
} from './mainnetEpochManifest';
import { merkleClaimLeafHash, prepareMerkleClaim, verifyMerkleProof } from './merkleClaim';

const CANARY = '0x3d8a7fa490f9db09dd8006b74688213ace9c0164';

describe('V30.2B P2E mainnet epoch manifest', () => {
  it('publishes exactly the genesis canary epoch', () => {
    expect(MAINNET_EPOCH_MANIFESTS).toHaveLength(1);
    expect(latestMainnetEpochId()).toBe(1);
    const [m] = MAINNET_EPOCH_MANIFESTS;
    expect(m.chainId).toBe(BOT_MAINNET_CHAIN_ID);
    expect(m.distributor).toBe('0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922');
    expect(m.allocationWei).toBe('1000000000000000000');
  });

  it('resolves the canary entitlement case-insensitively, and only on mainnet', () => {
    expect(findMainnetEntitlement(BOT_MAINNET_CHAIN_ID, CANARY.toUpperCase())).not.toBeNull();
    expect(findMainnetEntitlement(BOT_TESTNET_CHAIN_ID, CANARY)).toBeNull();
    expect(findMainnetEntitlement(BOT_MAINNET_CHAIN_ID, null)).toBeNull();
    expect(
      findMainnetEntitlement(BOT_MAINNET_CHAIN_ID, '0x0000000000000000000000000000000000000001'),
    ).toBeNull();
  });

  it('reproduces the published root from the frozen leaf and proof', () => {
    const match = findMainnetEntitlement(BOT_MAINNET_CHAIN_ID, CANARY)!;
    const leaf = merkleClaimLeafHash({
      chainId: BOT_MAINNET_CHAIN_ID,
      distributor: match.manifest.distributor,
      leaf: match.leaf,
    });
    expect(verifyMerkleProof({ leaf, proof: match.proof, root: match.manifest.root })).toBe(true);
  });

  it('fails closed once the allocation is claimed on chain', () => {
    const match = findMainnetEntitlement(BOT_MAINNET_CHAIN_ID, CANARY)!;
    const epoch = {
      epochId: 1,
      root: match.manifest.root,
      claimStart: match.manifest.claimStart,
      claimEnd: match.manifest.claimEnd,
      cancelled: false,
      released: false,
      distributorBalance: '1000000000000000000000000',
      totalReserved: '1000000000000000000',
    };
    const args = {
      chainId: BOT_MAINNET_CHAIN_ID,
      distributor: match.manifest.distributor,
      epoch,
      leaf: match.leaf,
      proof: match.proof,
      nowSeconds: match.manifest.claimStart + 60,
    };
    expect(prepareMerkleClaim({ ...args, alreadyClaimed: true })).toMatchObject({
      claimable: false,
      reason: 'alreadyClaimed',
    });
    expect(prepareMerkleClaim({ ...args, alreadyClaimed: false })).toMatchObject({ claimable: true });
    expect(
      prepareMerkleClaim({ ...args, alreadyClaimed: false, nowSeconds: match.manifest.claimStart - 1 }),
    ).toMatchObject({ claimable: false, reason: 'claimWindowNotOpen' });
    expect(
      prepareMerkleClaim({ ...args, alreadyClaimed: false, nowSeconds: match.manifest.claimEnd + 1 }),
    ).toMatchObject({ claimable: false, reason: 'claimWindowClosed' });
  });
});
