import { describe, expect, it } from 'vitest';

import {
  merkleClaimLeafHash,
  hashPair,
  prepareMerkleClaim,
  verifyMerkleProof,
  type PublishedEpochState,
} from './merkleClaim';
import { BOT_MAINNET_CHAIN_ID, BOT_TESTNET_CHAIN_ID } from './flowRewardsRegistry';

const DISTRIBUTOR = '0x0000000000000000000000000000000000009999' as const;
const ACCOUNT = '0x0000000000000000000000000000000000001111' as const;

const epoch = (over: Partial<PublishedEpochState> = {}): PublishedEpochState => ({
  epochId: 1,
  root: '0x' + '11'.repeat(32) as `0x${string}`,
  claimStart: 1_000,
  claimEnd: 2_000,
  cancelled: false,
  released: false,
  distributorBalance: (100n * 10n ** 18n).toString(),
  totalReserved: (100n * 10n ** 18n).toString(),
  ...over,
});

describe('V30.1B.2 canonical Merkle leaf encoding', () => {
  it('matches the on-chain leafHash vector produced by the Solidity suite', () => {
    // Vector printed by contracts/production/rewards-distributor/test — chainId
    // 31337, distributor 0x2e234DAe75C793f67A35089C9d99245E1C58470b, epoch 7,
    // index 3, account 0x1111, amount 1234e18.
    const leaf = merkleClaimLeafHash({
      chainId: 31337,
      distributor: '0x2e234DAe75C793f67A35089C9d99245E1C58470b',
      leaf: { epochId: 7, index: 3, account: ACCOUNT, amount: (1234n * 10n ** 18n).toString() },
    });
    expect(leaf).toBe('0x696610ea9cce3712b103eb45726d15e483b1a43d599caf0f1cb17c76b7b0d7c3');
  });

  it('binds chain id and distributor so a manifest cannot be replayed', () => {
    const base = { epochId: 1, index: 0, account: ACCOUNT, amount: '1' };
    const a = merkleClaimLeafHash({ chainId: 677, distributor: DISTRIBUTOR, leaf: base });
    const b = merkleClaimLeafHash({ chainId: 968, distributor: DISTRIBUTOR, leaf: base });
    const c = merkleClaimLeafHash({
      chainId: 677,
      distributor: '0x0000000000000000000000000000000000008888',
      leaf: base,
    });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('verifies a two-leaf proof with commutative pair hashing', () => {
    const l0 = merkleClaimLeafHash({
      chainId: 677,
      distributor: DISTRIBUTOR,
      leaf: { epochId: 1, index: 0, account: ACCOUNT, amount: '5' },
    });
    const l1 = merkleClaimLeafHash({
      chainId: 677,
      distributor: DISTRIBUTOR,
      leaf: { epochId: 1, index: 1, account: DISTRIBUTOR, amount: '6' },
    });
    const root = hashPair(l0, l1);
    expect(verifyMerkleProof({ leaf: l0, proof: [l1], root })).toBe(true);
    expect(verifyMerkleProof({ leaf: l0, proof: [l0], root })).toBe(false);
  });
});

describe('V30.1B.2 fail-closed claim preparation', () => {
  const amount = (10n * 10n ** 18n).toString();
  const leaf = { epochId: 1, index: 0, account: ACCOUNT, amount };
  const leafHash = merkleClaimLeafHash({ chainId: BOT_MAINNET_CHAIN_ID, distributor: DISTRIBUTOR, leaf });
  const sibling = ('0x' + '22'.repeat(32)) as `0x${string}`;
  const root = hashPair(leafHash, sibling);

  const ok = () =>
    prepareMerkleClaim({
      chainId: BOT_MAINNET_CHAIN_ID,
      distributor: DISTRIBUTOR,
      epoch: epoch({ root }),
      leaf,
      proof: [sibling],
      alreadyClaimed: false,
      nowSeconds: 1_500,
    });

  it('prepares only when epoch, proof and funded reservation all agree', () => {
    const prep = ok();
    expect(prep.claimable).toBe(true);
    if (prep.claimable) {
      expect(prep.amount).toBe(amount);
      expect(prep.account).toBe(ACCOUNT);
      expect(prep.proof).toEqual([sibling]);
    }
  });

  it('refuses the EIP-712 testnet chain — the epoch model is mainnet-canonical only', () => {
    const prep = prepareMerkleClaim({
      chainId: BOT_TESTNET_CHAIN_ID,
      distributor: DISTRIBUTOR,
      epoch: epoch({ root }),
      leaf,
      proof: [sibling],
      alreadyClaimed: false,
      nowSeconds: 1_500,
    });
    expect(prep).toMatchObject({ claimable: false, reason: 'modelNotCanonicalForChain' });
  });

  it.each([
    ['distributorNotDeployed', { distributor: null }],
    ['noPublishedEpoch', { epoch: null }],
    ['noAllocationForAccount', { leaf: null }],
    ['alreadyClaimed', { alreadyClaimed: true }],
    ['claimWindowNotOpen', { nowSeconds: 500 }],
    ['claimWindowClosed', { nowSeconds: 5_000 }],
    ['epochNotLive', { epoch: epoch({ root, cancelled: true }) }],
    ['proofInvalid', { proof: [sibling, sibling] }],
    ['distributorUnderfunded', { epoch: epoch({ root, distributorBalance: '1' }) }],
  ] as const)('blocks with %s', (reason, over) => {
    const prep = prepareMerkleClaim({
      chainId: BOT_MAINNET_CHAIN_ID,
      distributor: DISTRIBUTOR,
      epoch: epoch({ root }),
      leaf,
      proof: [sibling],
      alreadyClaimed: false,
      nowSeconds: 1_500,
      ...(over as any),
    });
    expect(prep).toMatchObject({ claimable: false, reason });
  });

  it('never treats a browser amount as authority: a tampered amount fails proof verification', () => {
    const prep = prepareMerkleClaim({
      chainId: BOT_MAINNET_CHAIN_ID,
      distributor: DISTRIBUTOR,
      epoch: epoch({ root }),
      leaf: { ...leaf, amount: (999n * 10n ** 18n).toString() },
      proof: [sibling],
      alreadyClaimed: false,
      nowSeconds: 1_500,
    });
    expect(prep).toMatchObject({ claimable: false, reason: 'proofInvalid' });
  });
});
