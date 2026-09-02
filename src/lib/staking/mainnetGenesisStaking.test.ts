import { describe, expect, it } from 'vitest';

import {
  MAINNET_EXECUTABLE_PRODUCT_IDS,
  MAINNET_FLEXIBLE_PRODUCT_ID,
  P3B_CANARY_EVIDENCE,
  isMainnetStakingProductExecutable,
  mainnetStakingAddresses,
} from './mainnetGenesisStaking';
import { genesisObligation } from './useMainnetGenesisStake';
import { V30_2B_FEATURE_ACTIVATION } from '@/lib/deploy/v302bCanonicalRegistry';

describe('V30.2B P3B mainnet Flexible Genesis staking policy', () => {
  it('executes the Flexible product only', () => {
    expect(MAINNET_EXECUTABLE_PRODUCT_IDS).toEqual([MAINNET_FLEXIBLE_PRODUCT_ID]);
    expect(isMainnetStakingProductExecutable(0)).toBe(true);
    for (const id of [1, 2, 3, 4, 5, -1, 99]) {
      expect(isMainnetStakingProductExecutable(id)).toBe(false);
    }
  });

  it('keeps the standard / dynamic path disabled', () => {
    expect(V30_2B_FEATURE_ACTIVATION.dynamicStakingEnabled).toBe(false);
    expect(V30_2B_FEATURE_ACTIVATION.oracleConfigured).toBe(false);
    expect(V30_2B_FEATURE_ACTIVATION.stakingPublisherAssigned).toBe(false);
  });

  it('resolves only canonical V30.2B mainnet addresses', () => {
    const a = mainnetStakingAddresses();
    expect(a.token).toBe('0xcaaB50F36252a57529AFeF651fa6B9f9281917fF');
    expect(a.vault).toBe('0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D');
    expect(a.treasury).toBe('0x96552909998F3DbAf5Ff4979dc158508b3442e65');
  });

  it('reproduces the exact on-chain canary Genesis obligation', () => {
    // 1 FLOW at 1800 bps for the full 90-day window, as reserved on chain 677.
    expect(genesisObligation(10n ** 18n, 1800, 7_776_000).toString()).toBe('44383561643835616');
    expect(P3B_CANARY_EVIDENCE.genesisReservedFlow).toBe('0.044383561643835616');
  });

  it('never quotes a reward without principal, rate or window', () => {
    expect(genesisObligation(0n, 1800, 7_776_000)).toBe(0n);
    expect(genesisObligation(10n ** 18n, 0, 7_776_000)).toBe(0n);
    expect(genesisObligation(10n ** 18n, 1800, 0)).toBe(0n);
  });
});
