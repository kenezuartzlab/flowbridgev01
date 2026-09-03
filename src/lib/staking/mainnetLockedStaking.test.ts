import { describe, expect, it } from 'vitest';

import {
  LOCKED_PRODUCT_IDS,
  LOCKED_PRODUCT_LABELS,
  LOCKED_UNAVAILABLE_COPY,
  evaluateLockedExecution,
  isLockedQuoteStale,
  isLockedStakingActivated,
  lockedPhaseCopy,
  lockedQuoteFingerprint,
  type LiveLockedQuote,
  type LockedExecutionGates,
} from './mainnetLockedStaking';

const ONE = 10n ** 18n;
const DAY = 86_400;

/** Live P3D 30D quote reproduced from the accepted mainnet pre-signing gate. */
const quote30 = (over: Partial<LiveLockedQuote> = {}): LiveLockedQuote => ({
  productId: 1,
  principalWei: ONE,
  lockSeconds: 30 * DAY,
  genesisRateBps: 2700,
  genesisSeconds: 30 * DAY,
  genesisReservedWei: 22_191_780_821_917_808n,
  floorRateBps: 800,
  floorReservedWei: 6_575_342_465_753_424n,
  quotedAt: 1_788_395_630,
  ...over,
});

const gates = (over: Partial<LockedExecutionGates> = {}): LockedExecutionGates => ({
  chainId: 677,
  vaultPaused: false,
  emergencyMode: false,
  productActive: true,
  oracle: '0x0000000000000000000000000000000000000000',
  minPrincipalWei: ONE,
  walletBalanceWei: 5n * ONE,
  allowanceWei: ONE,
  treasuryFreeWei: 9_999_999n * ONE,
  genesisYear1RemainingWei: 999_999n * ONE,
  standardYear1RemainingWei: 2_000_000n * ONE,
  // P3D policy is exercised independently of the registry activation flag,
  // which stays false until the user-signed 30D canary open settles.
  activated: true,
  ...over,
});

describe('P3D locked staking activation', () => {
  it('stays deactivated until the user-signed 30D canary open settles', () => {
    expect(isLockedStakingActivated()).toBe(false);
  });

  it('blocks execution while the activation flag is off', () => {
    const r = evaluateLockedExecution(quote30(), gates({ activated: undefined }));
    expect(r.decision).toBe('BLOCKED');
    expect(r.blockers.join(' ')).toMatch(/not activated/i);
  });

  it('labels all four locked products', () => {
    expect(LOCKED_PRODUCT_IDS.map((id) => LOCKED_PRODUCT_LABELS[id])).toEqual([
      '30 Days',
      '90 Days',
      '180 Days',
      '365 Days',
    ]);
  });
});

describe('30D exact allowance and open', () => {
  it('is executable against the live quote and requires no further approval', () => {
    const r = evaluateLockedExecution(quote30(), gates());
    expect(r.decision).toBe('EXECUTABLE');
    expect(r.blockers).toEqual([]);
    expect(r.needsApproval).toBe(false);
    expect(r.exactAllowanceWei).toBe(ONE);
    expect(r.totalReservedWei).toBe(28_767_123_287_671_232n);
    expect(r.genesisCoversTerm).toBe(true);
    expect(r.postGenesisFloorOnly).toBe(false);
    expect(r.maturityAt).toBe(1_788_395_630 + 30 * DAY);
  });

  it('requests an exact — never unlimited — approval when allowance is short', () => {
    const r = evaluateLockedExecution(quote30(), gates({ allowanceWei: 0n }));
    expect(r.needsApproval).toBe(true);
    expect(r.exactAllowanceWei).toBe(ONE);
  });
});

describe('90D per-wallet quota', () => {
  it('blocks a wallet whose live quote returns zero Genesis seconds', () => {
    const r = evaluateLockedExecution(
      quote30({ productId: 2, lockSeconds: 90 * DAY, genesisSeconds: 0, genesisReservedWei: 0n }),
      gates(),
    );
    expect(r.decision).toBe('BLOCKED');
    expect(r.blockers.join(' ')).toMatch(/no Genesis reward-days left/i);
  });

  it('never infers eligibility across wallets — a partial quota yields floor-only tail', () => {
    const r = evaluateLockedExecution(
      quote30({ productId: 2, lockSeconds: 90 * DAY, genesisSeconds: 10 * DAY }),
      gates(),
    );
    expect(r.decision).toBe('EXECUTABLE');
    expect(r.genesisCoversTerm).toBe(false);
    expect(r.postGenesisFloorOnly).toBe(true);
  });
});

describe('180D / 365D Genesis-to-floor-only wording', () => {
  it('separates the Genesis phase from the reserved floor-only phase', () => {
    const copy = lockedPhaseCopy(
      quote30({ productId: 3, lockSeconds: 180 * DAY, genesisRateBps: 4800, genesisSeconds: 90 * DAY, floorRateBps: 1200 }),
    );
    expect(copy.genesis).toContain('48.0% APR');
    expect(copy.genesis).toContain('90 of 180 locked days');
    expect(copy.postGenesis).toContain('12.0% APR reserved floor only');
    expect(copy.postGenesis).toContain('Variable bonus rewards are unavailable');
    expect(copy.reserveNote).toContain('never minted');
    expect(copy.reserveNote).toContain('never compounded');
  });

  it('omits a post-Genesis phase when Genesis covers the full term', () => {
    expect(lockedPhaseCopy(quote30()).postGenesis).toBeNull();
  });

  it('never presents target or hard-cap variable APR as earnings', () => {
    const copy = lockedPhaseCopy(quote30({ productId: 4, lockSeconds: 365 * DAY, genesisSeconds: 90 * DAY }));
    expect(`${copy.genesis}${copy.postGenesis}`).not.toMatch(/target|hard cap|APY|guaranteed/i);
  });
});

describe('capacity, funding and chain gates', () => {
  it('blocks when Genesis Year-1 capacity is short', () => {
    const r = evaluateLockedExecution(quote30(), gates({ genesisYear1RemainingWei: 1n }));
    expect(r.blockers.join(' ')).toMatch(/Genesis reward capacity/i);
  });

  it('blocks when standard Year-1 capacity cannot reserve the floor', () => {
    const r = evaluateLockedExecution(quote30(), gates({ standardYear1RemainingWei: 1n }));
    expect(r.blockers.join(' ')).toMatch(/standard reward capacity/i);
  });

  it('blocks when the pre-funded reserve cannot fund the reservations', () => {
    const r = evaluateLockedExecution(quote30(), gates({ treasuryFreeWei: 1n }));
    expect(r.blockers.join(' ')).toMatch(/reward reserve/i);
  });

  it('blocks a zero floor reservation that would revert on chain', () => {
    const r = evaluateLockedExecution(quote30({ floorReservedWei: 0n }), gates());
    expect(r.blockers.join(' ')).toMatch(/floor obligation rounds to zero/i);
  });

  it('blocks pause, emergency mode, inactive product and the wrong chain', () => {
    expect(evaluateLockedExecution(quote30(), gates({ vaultPaused: true })).decision).toBe('BLOCKED');
    expect(evaluateLockedExecution(quote30(), gates({ emergencyMode: true })).decision).toBe('BLOCKED');
    expect(evaluateLockedExecution(quote30(), gates({ productActive: false })).decision).toBe('BLOCKED');
    expect(evaluateLockedExecution(quote30(), gates({ chainId: 968 })).blockers.join(' ')).toMatch(
      /BOT Mainnet/,
    );
  });

  it('blocks amounts below the live minimum or above the wallet balance', () => {
    expect(
      evaluateLockedExecution(quote30({ principalWei: ONE / 2n }), gates()).blockers.join(' '),
    ).toMatch(/minimum stake/i);
    expect(
      evaluateLockedExecution(quote30(), gates({ walletBalanceWei: 0n })).blockers.join(' '),
    ).toMatch(/balance/i);
  });

  it('blocks an empty amount', () => {
    expect(evaluateLockedExecution(quote30({ principalWei: 0n }), gates()).decision).toBe('BLOCKED');
  });
});

describe('quote freeze', () => {
  it('detects any economic drift between the shown and signed quote', () => {
    const shown = quote30();
    expect(isLockedQuoteStale(shown, quote30())).toBe(false);
    expect(isLockedQuoteStale(shown, quote30({ genesisSeconds: 29 * DAY }))).toBe(true);
    expect(isLockedQuoteStale(shown, quote30({ genesisReservedWei: 1n }))).toBe(true);
    expect(isLockedQuoteStale(shown, quote30({ principalWei: 2n * ONE }))).toBe(true);
    expect(lockedQuoteFingerprint(shown)).toContain('p3d:1:');
  });
});

describe('read failure posture', () => {
  it('has an honest unavailable state instead of an optimistic default', () => {
    expect(LOCKED_UNAVAILABLE_COPY).toMatch(/unavailable/i);
  });
});
