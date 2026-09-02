import { describe, expect, it } from 'vitest';
import {
  CANONICAL_LIFECYCLE_ORDER,
  SUPERSEDED_MAINNET_ADDRESSES,
  V30_2B_CANONICAL_CONTRACTS,
  V30_2B_FEATURE_ACTIVATION,
  activationMatrix,
  assertCanonicalSelection,
  canPrepareMainnetEconomicAction,
  getCanonicalContract,
  isCanonicalMainnetAddress,
  isSupersededAddress,
  resolveCanonicalAddress,
} from './v302bCanonicalRegistry';
import {
  BOT_MAINNET_CHAIN_ID,
  BOT_TESTNET_CHAIN_ID,
  UNVERIFIED_LEGACY_BOT_IDENTIFIER,
} from '@/lib/network/canonicalNetworks';

describe('V30.2B canonical mainnet registry', () => {
  it('exposes exactly the six verified V30.2B contracts on 677', () => {
    expect(V30_2B_CANONICAL_CONTRACTS).toHaveLength(6);
    for (const c of V30_2B_CANONICAL_CONTRACTS) {
      expect(c.chainId).toBe(BOT_MAINNET_CHAIN_ID);
      expect(c.sourceVerified).toBe(true);
      expect(c.featureActive).toBe(false);
      expect(CANONICAL_LIFECYCLE_ORDER).toContain(c.lifecycle);
    }
    expect(V30_2B_CANONICAL_CONTRACTS.map((c) => c.address)).toEqual([
      '0xcaaB50F36252a57529AFeF651fa6B9f9281917fF',
      '0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922',
      '0x86590b7C8A2Ad9a1dAD8183Eaf627AE4B7Ff3814',
      '0x96552909998F3DbAf5Ff4979dc158508b3442e65',
      '0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF',
      '0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D',
    ]);
  });

  it('reports FUNDED_READY only for live-funded contracts and never FEATURE_ACTIVE', () => {
    const byId = Object.fromEntries(V30_2B_CANONICAL_CONTRACTS.map((c) => [c.contractId, c]));
    expect(byId.FlowToken.lifecycle).toBe('FUNDED_READY');
    expect(byId.FlowRewardsMerkleDistributor.lifecycle).toBe('FUNDED_READY');
    expect(byId.FlowStakingRewardTreasury.lifecycle).toBe('FUNDED_READY');
    expect(byId.FlowStakingRewardTreasury.fundedFlow).toBe('10000000');
    expect(byId.FlowRewardsMerkleDistributor.fundedFlow).toBe('1000000');
    expect(V30_2B_CANONICAL_CONTRACTS.some((c) => c.lifecycle === 'FEATURE_ACTIVE')).toBe(false);
  });

  it('never lets a superseded V30.1/V30.2A address resolve as canonical', () => {
    expect(SUPERSEDED_MAINNET_ADDRESSES.length).toBeGreaterThanOrEqual(7);
    for (const s of SUPERSEDED_MAINNET_ADDRESSES) {
      expect(isSupersededAddress(s.address)).toBe(true);
      expect(isSupersededAddress(s.address.toLowerCase())).toBe(true);
      expect(isCanonicalMainnetAddress(s.address)).toBe(false);
      expect(() => assertCanonicalSelection(s.address)).toThrow(/superseded/);
    }
  });

  it('rejects unknown addresses and accepts canonical ones case-insensitively', () => {
    expect(() => assertCanonicalSelection('0x0000000000000000000000000000000000000001')).toThrow();
    const addr = getCanonicalContract('FlowStakingVaultV2').address;
    expect(assertCanonicalSelection(addr.toLowerCase())).toBe(addr.toLowerCase());
  });

  it('resolves canonical addresses only on mainnet 677 (no 968/1024 contamination)', () => {
    expect(resolveCanonicalAddress(BOT_MAINNET_CHAIN_ID, 'FlowToken')).toBe(
      '0xcaaB50F36252a57529AFeF651fa6B9f9281917fF',
    );
    expect(resolveCanonicalAddress(BOT_TESTNET_CHAIN_ID, 'FlowToken')).toBeNull();
    expect(resolveCanonicalAddress(UNVERIFIED_LEGACY_BOT_IDENTIFIER, 'FlowToken')).toBeNull();
    expect(resolveCanonicalAddress(1, 'FlowStakingController')).toBeNull();
  });

  it('activates only the reward claim path and keeps staking disabled', () => {
    expect(V30_2B_FEATURE_ACTIVATION.rewardClaimsEnabled).toBe(true);
    expect(V30_2B_FEATURE_ACTIVATION.stakingExecutionEnabled).toBe(false);
    expect(V30_2B_FEATURE_ACTIVATION.dynamicStakingEnabled).toBe(false);
    expect(V30_2B_FEATURE_ACTIVATION.oracleConfigured).toBe(false);
    expect(V30_2B_FEATURE_ACTIVATION.stakingPublisherAssigned).toBe(false);
    expect(V30_2B_FEATURE_ACTIVATION.rewardRootPublished).toBe(true);
  });

  it('preserves the swap/bridge posture untouched', () => {
    expect(V30_2B_FEATURE_ACTIVATION.routerV3Live).toBe(true);
    expect(V30_2B_FEATURE_ACTIVATION.routerV4Promoted).toBe(false);
    expect(V30_2B_FEATURE_ACTIVATION.officialBridgeDirect).toBe(true);
  });

  it('allows only claim preparation on mainnet; staking stays blocked', () => {
    expect(canPrepareMainnetEconomicAction('CLAIM_FLOW')).toBe(true);
    expect(canPrepareMainnetEconomicAction('STAKE_FLOW')).toBe(false);
    expect(canPrepareMainnetEconomicAction('UNSTAKE_FLOW')).toBe(false);
  });

  it('publishes an activation matrix where only the rewards distributor is active', () => {
    const rows = activationMatrix();
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      const isRewards = row.contractId === 'FlowRewardsMerkleDistributor';
      expect(row.featureActive).toBe(isRewards);
      expect(row.lifecycle === 'FEATURE_ACTIVE').toBe(isRewards);
      for (const flag of row.requiredFlags) {
        expect(V30_2B_FEATURE_ACTIVATION[flag]).toBe(isRewards);
      }
    }
  });
});
