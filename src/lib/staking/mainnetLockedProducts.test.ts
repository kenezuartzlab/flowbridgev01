import { describe, expect, it } from 'vitest';
import {
  LOCKED_PRODUCT_IDS,
  LOCKED_PRODUCT_TERMS,
  VAULT_GENESIS_MAX_SECONDS,
  computeFloorObligationWei,
  computeGenesisGrantSeconds,
  computeGenesisObligationWei,
  hasPostGenesisDependency,
  isLockedProductId,
  isLockedProductPubliclyExecutable,
  isLockedQuoteStale,
  mainnetExecutableProductIds,
  prepareLockedCanaryQuote,
  type LockedCanaryLiveState,
  type LockedProductId,
} from './mainnetLockedProducts';
import { isMainnetStakingProductExecutable } from './mainnetGenesisStaking';

const ONE = 10n ** 18n;
const FULL_QUOTA = VAULT_GENESIS_MAX_SECONDS;

const healthy = (over: Partial<LockedCanaryLiveState> = {}): LockedCanaryLiveState => ({
  chainId: 677,
  vaultPaused: false,
  emergencyMode: false,
  productActive: true,
  oracle: '0x0000000000000000000000000000000000000000',
  epochRoleGrantedToController: false,
  publisherRoleGranted: false,
  walletBalanceWei: 10n * ONE,
  walletGenesisQuotaRemainingSeconds: FULL_QUOTA,
  treasuryFreeWei: 9_999_999n * ONE,
  genesisYear1RemainingWei: 999_999n * ONE,
  standardYear1RemainingWei: 2_000_000n * ONE,
  openLockedPositionCount: 0,
  blockTimestamp: 1_788_357_632,
  ...over,
});

describe('P3C locked product identity', () => {
  it('recognises exactly productIds 1-4 as locked', () => {
    expect([0, 1, 2, 3, 4, 5].filter(isLockedProductId)).toEqual([1, 2, 3, 4]);
    expect(LOCKED_PRODUCT_IDS).toEqual([1, 2, 3, 4]);
  });

  it('pins live lock durations, Genesis APR, floor and minimum principal', () => {
    expect(LOCKED_PRODUCT_TERMS[1]).toMatchObject({ lockSeconds: 2_592_000, genesisAprBps: 2700, floorBps: 800 });
    expect(LOCKED_PRODUCT_TERMS[2]).toMatchObject({ lockSeconds: 7_776_000, genesisAprBps: 3600, floorBps: 1000 });
    expect(LOCKED_PRODUCT_TERMS[3]).toMatchObject({ lockSeconds: 15_552_000, genesisAprBps: 4800, floorBps: 1200 });
    expect(LOCKED_PRODUCT_TERMS[4]).toMatchObject({ lockSeconds: 31_536_000, genesisAprBps: 6000, floorBps: 1500 });
    for (const id of LOCKED_PRODUCT_IDS) expect(LOCKED_PRODUCT_TERMS[id].minPrincipalWei).toBe(ONE);
  });

  it('never makes a locked product publicly executable', () => {
    for (const id of LOCKED_PRODUCT_IDS) {
      expect(isLockedProductPubliclyExecutable(id)).toBe(false);
      expect(isMainnetStakingProductExecutable(id)).toBe(false);
    }
  });

  it('keeps the P3B Flexible path as the only mainnet-executable product', () => {
    expect(mainnetExecutableProductIds()).toEqual([0]);
    expect(isMainnetStakingProductExecutable(0)).toBe(true);
  });
});

describe('P3C reservation arithmetic mirrors deployed integer math', () => {
  it('reproduces the live 30D obligations at 1 FLOW exactly', () => {
    const grant = computeGenesisGrantSeconds(2_592_000, FULL_QUOTA);
    expect(grant).toBe(2_592_000n);
    expect(computeGenesisObligationWei(ONE, 2700, grant)).toBe(22_191_780_821_917_808n);
    expect(computeFloorObligationWei(ONE, 800, 2_592_000)).toBe(6_575_342_465_753_424n);
  });

  it('clamps the Genesis grant to 90 days for 180D and 365D', () => {
    expect(computeGenesisGrantSeconds(15_552_000, FULL_QUOTA)).toBe(VAULT_GENESIS_MAX_SECONDS);
    expect(computeGenesisGrantSeconds(31_536_000, FULL_QUOTA)).toBe(VAULT_GENESIS_MAX_SECONDS);
  });

  it('clamps the Genesis grant to the wallet lifetime quota', () => {
    expect(computeGenesisGrantSeconds(7_776_000, 7_774_776n)).toBe(7_774_776n);
    expect(computeGenesisObligationWei(ONE, 3600, 7_774_776n)).toBe(88_753_150_684_931_506n);
  });

  it('yields zero floor obligation for a flexible-style zero lock', () => {
    expect(computeFloorObligationWei(ONE, 0, 0)).toBe(0n);
  });
});

describe('P3C post-Genesis dependency cannot drift', () => {
  it('marks 180D and 365D as post-Genesis dependent, 30D and 90D as not', () => {
    expect(hasPostGenesisDependency(1)).toBe(false);
    expect(hasPostGenesisDependency(2)).toBe(false);
    expect(hasPostGenesisDependency(3)).toBe(true);
    expect(hasPostGenesisDependency(4)).toBe(true);
  });

  it('blocks 180D and 365D even under otherwise perfect live state', () => {
    for (const id of [3, 4] as LockedProductId[]) {
      const q = prepareLockedCanaryQuote(id, ONE, healthy());
      expect(q.decision).toBe('BLOCKED');
      expect(q.postGenesisDependency).toBe(true);
      expect(q.blockers.some((b) => b.includes('outlives the 90-day Genesis window'))).toBe(true);
    }
  });
});

describe('P3C canary quote preparation', () => {
  it('classifies 30D CANARY_READY with exact allowance and maturity', () => {
    const live = healthy();
    const q = prepareLockedCanaryQuote(1, ONE, live);
    expect(q.decision).toBe('CANARY_READY');
    expect(q.blockers).toEqual([]);
    expect(q.exactAllowanceWei).toBe(ONE);
    expect(q.maturityAt).toBe(live.blockTimestamp + 2_592_000);
    expect(q.earliestWithdrawalAt).toBe(q.maturityAt);
    expect(q.genesisCoversFullTerm).toBe(true);
    expect(q.totalEntryReservationWei).toBe(q.genesisReservationWei + q.floorReservationWei);
  });

  it('classifies 90D CANARY_READY only with full remaining Genesis quota', () => {
    expect(prepareLockedCanaryQuote(2, ONE, healthy()).decision).toBe('CANARY_READY');
    const short = prepareLockedCanaryQuote(2, ONE, healthy({ walletGenesisQuotaRemainingSeconds: 7_774_776n }));
    expect(short.decision).toBe('BLOCKED');
    expect(short.blockers.some((b) => b.includes('lifetime Genesis quota'))).toBe(true);
  });

  it('blocks on insufficient reserve capacity', () => {
    expect(prepareLockedCanaryQuote(1, ONE, healthy({ treasuryFreeWei: 0n })).blockers)
      .toContain('total entry reservation exceeds funded reward treasury free balance');
    expect(prepareLockedCanaryQuote(1, ONE, healthy({ standardYear1RemainingWei: 0n })).blockers)
      .toContain('floor obligation exceeds remaining standard Year-1 capacity');
    expect(prepareLockedCanaryQuote(1, ONE, healthy({ genesisYear1RemainingWei: 0n })).blockers)
      .toContain('genesis obligation exceeds remaining Genesis Year-1 capacity');
  });

  it('blocks on wrong network, paused, emergency and inactive product', () => {
    expect(prepareLockedCanaryQuote(1, ONE, healthy({ chainId: 968 })).decision).toBe('BLOCKED');
    expect(prepareLockedCanaryQuote(1, ONE, healthy({ vaultPaused: true })).decision).toBe('BLOCKED');
    expect(prepareLockedCanaryQuote(1, ONE, healthy({ emergencyMode: true })).decision).toBe('BLOCKED');
    expect(prepareLockedCanaryQuote(1, ONE, healthy({ productActive: false })).decision).toBe('BLOCKED');
  });

  it('blocks when an oracle or privileged staking role appears', () => {
    expect(prepareLockedCanaryQuote(1, ONE, healthy({ oracle: '0x00000000000000000000000000000000000000aa' })).blockers)
      .toContain('oracle is configured — P3C forbids oracle-dependent execution');
    expect(prepareLockedCanaryQuote(1, ONE, healthy({ epochRoleGrantedToController: true })).decision).toBe('BLOCKED');
    expect(prepareLockedCanaryQuote(1, ONE, healthy({ publisherRoleGranted: true })).decision).toBe('BLOCKED');
  });

  it('allows only one locked canary at a time and never sub-minimum principal', () => {
    expect(prepareLockedCanaryQuote(1, ONE, healthy({ openLockedPositionCount: 1 })).blockers)
      .toContain('a locked canary position is already open — only one at a time');
    expect(prepareLockedCanaryQuote(1, ONE / 2n, healthy()).blockers)
      .toContain('principal below the live minimum principal');
    expect(prepareLockedCanaryQuote(1, 5n * ONE, healthy({ walletBalanceWei: ONE })).blockers)
      .toContain('wallet FLOW balance below the canary principal');
  });

  it('detects term drift between prepare and sign', () => {
    const shown = prepareLockedCanaryQuote(1, ONE, healthy());
    const same = prepareLockedCanaryQuote(1, ONE, healthy());
    const drifted = prepareLockedCanaryQuote(1, ONE, healthy({ blockTimestamp: 1_788_357_999 }));
    expect(isLockedQuoteStale(shown, same)).toBe(false);
    expect(isLockedQuoteStale(shown, drifted)).toBe(true);
  });
});
