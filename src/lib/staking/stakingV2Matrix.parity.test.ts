/**
 * V30.1C §4 — parity tests: the TypeScript product matrix is a mirror of the
 * canonical contract constants, never an independent economic authority.
 * Every rate/lock/cap constant is asserted against the production-candidate
 * Solidity source so drift fails the gate.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  STAKING_V2_CONSTANTS,
  STAKING_V2_PRODUCTS,
  genesisWindowSeconds,
  resolveStakingV2Availability,
  simpleAccrual,
  stakingV2Product,
} from './stakingV2Matrix';

const controllerSrc = readFileSync(
  'contracts/production/staking-v2/FlowStakingController.sol',
  'utf8',
);
const vaultSrc = readFileSync('contracts/production/staking-v2/FlowStakingVaultV2.sol', 'utf8');

describe('staking v2 product matrix parity with contract source', () => {
  it('mirrors all five constructor _setProduct lines exactly', () => {
    for (const p of STAKING_V2_PRODUCTS) {
      // _setProduct(0, 0,            1800, 0,    1000, 1200, 1 ether);
      const pattern = new RegExp(
        `_setProduct\\(\\s*${p.id},\\s*${p.lockSeconds === 0 ? '0' : `${p.lockDays} days`},\\s*${p.genesisAprBps},\\s*${p.floorBps},\\s*${p.targetBps},\\s*${p.hardCapBps},`,
      );
      expect(controllerSrc, `product ${p.id} (${p.label}) must match controller constructor`).toMatch(pattern);
    }
  });

  it('mirrors shared economic constants', () => {
    expect(controllerSrc).toContain('GENESIS_MAX_SECONDS = 90 days');
    expect(controllerSrc).toContain('GENESIS_YEAR1_CAP = 1_000_000 ether');
    expect(controllerSrc).toContain('STANDARD_YEAR1_CAP = 2_000_000 ether');
    expect(controllerSrc).toContain('TOTAL_YEAR1_CAP = 3_000_000 ether');
    expect(controllerSrc).toContain('PRODUCT_COUNT = 5');
    expect(controllerSrc).toContain('EPOCH = 7 days');
    expect(vaultSrc).toContain('GENESIS_MAX_SECONDS = 90 days');
    expect(STAKING_V2_CONSTANTS.GENESIS_MAX_SECONDS).toBe(90 * 86_400);
    expect(STAKING_V2_CONSTANTS.EPOCH_SECONDS).toBe(7 * 86_400);
    expect(STAKING_V2_PRODUCTS).toHaveLength(5);
  });

  it('genesis window is capped at 90 reward-days for every product', () => {
    for (const p of STAKING_V2_PRODUCTS) {
      expect(genesisWindowSeconds(p)).toBeLessThanOrEqual(90 * 86_400);
    }
    expect(genesisWindowSeconds(STAKING_V2_PRODUCTS[3]!)).toBe(90 * 86_400); // 180D
    expect(genesisWindowSeconds(STAKING_V2_PRODUCTS[4]!)).toBe(90 * 86_400); // 365D
    expect(genesisWindowSeconds(STAKING_V2_PRODUCTS[1]!)).toBe(30 * 86_400); // 30D < 90
  });

  it('enforces matrix invariants: floor/target within hard cap, flexible has no floor', () => {
    for (const p of STAKING_V2_PRODUCTS) {
      expect(p.targetBps).toBeLessThanOrEqual(p.hardCapBps);
      expect(p.floorBps).toBeLessThanOrEqual(p.hardCapBps);
      if (p.lockSeconds === 0) expect(p.floorBps).toBe(0);
      else expect(p.floorBps).toBeGreaterThan(0);
    }
    expect(stakingV2Product(99)).toBeNull();
  });

  it('simple accrual matches the contract formula (principal * bps * secs / (BPS * YEAR))', () => {
    // 100,000 FLOW at 18% for 30 days (contract test vector).
    const expected = (100_000 * 1800 * 30 * 86_400) / (10_000 * 365 * 86_400);
    expect(simpleAccrual(100_000, 1800, 30 * 86_400)).toBeCloseTo(expected, 10);
    expect(simpleAccrual(0, 1800, 86_400)).toBe(0);
    expect(simpleAccrual(100, 0, 86_400)).toBe(0);
    expect(simpleAccrual(100, 1800, 0)).toBe(0);
  });
});

describe('staking v2 availability resolver (fail-closed)', () => {
  const base = {
    oracleConfigured: true,
    oracleStatus: { kind: 'healthy' } as const,
    reserveFunded: true,
    genesisCapacityRemainingFlow: 500_000,
    walletGenesisDaysRemaining: 90,
    contractsPromoted: true,
  };

  it('stays Preview until contracts are promoted', () => {
    expect(resolveStakingV2Availability({ ...base, contractsPromoted: false })).toBe('preview');
  });

  it('dynamic rate is unavailable without a healthy oracle — never invented', () => {
    expect(resolveStakingV2Availability({ ...base, oracleConfigured: false })).toBe('unavailable-oracle');
    expect(resolveStakingV2Availability({ ...base, oracleStatus: { kind: 'stale' } })).toBe('unavailable-oracle');
    expect(
      resolveStakingV2Availability({ ...base, oracleStatus: { kind: 'unsafe', reason: 'low-liquidity' } }),
    ).toBe('unavailable-oracle');
    expect(
      resolveStakingV2Availability({ ...base, oracleStatus: { kind: 'unsafe', reason: 'high-deviation' } }),
    ).toBe('unavailable-oracle');
  });

  it('funding-insufficient and genesis-exhausted states are distinct', () => {
    expect(resolveStakingV2Availability({ ...base, reserveFunded: false })).toBe('unavailable-funding');
    expect(resolveStakingV2Availability({ ...base, genesisCapacityRemainingFlow: 0 })).toBe('genesis-exhausted');
  });

  it('live only when every gate is satisfied', () => {
    expect(resolveStakingV2Availability(base)).toBe('live');
  });
});
