import { describe, expect, it } from 'vitest';
import { keccak256, toBytes, getAddress } from 'viem';
import { assessGovernance, isChecksumAddress, illustrateFees, DECISIONS, launchGate, FIXED_PROTOCOL_TARGETS, type SafeFacts } from './launchReadiness';
import { reviewBnbSwap } from './executionReviewPolicy';

const k = (s: string) => keccak256(toBytes(s)).slice(2);
const A = getAddress('0x' + '11'.repeat(20)), B = getAddress('0x' + '22'.repeat(20));
const o = [getAddress('0x' + 'a1'.repeat(20)), getAddress('0x' + 'b2'.repeat(20)), getAddress('0x' + 'c3'.repeat(20))];
const safe = (address: string, p: Partial<SafeFacts> = {}): SafeFacts => ({ address, chainId: 56, hasCode: true, owners: o, threshold: 2, ...p });

describe('governance readiness (synthetic addresses, never real roles)', () => {
  it('NOT_CONFIGURED without owner-provided addresses', () => {
    expect(assessGovernance(null, null, k)).toEqual({ status: 'NOT_CONFIGURED', reasons: ['NOT_PROVIDED'], canConfigureRoles: false });
  });
  it('checksum validation', () => {
    expect(isChecksumAddress(A, k)).toBe(true);
    expect(isChecksumAddress(FIXED_PROTOCOL_TARGETS.USDT, k)).toBe(true);
    expect(isChecksumAddress('0x55D398326f99059fF775485246999027B3197955', k)).toBe(false);
  });
  it('rejects protocol targets, same address, no code, wrong chain, 1-of-n', () => {
    const r = assessGovernance(safe(FIXED_PROTOCOL_TARGETS.WBNB, { threshold: 1, hasCode: false, chainId: 1 }), safe(FIXED_PROTOCOL_TARGETS.WBNB), k);
    expect(r.status).toBe('INVALID');
    for (const x of ['PROTOCOL_TARGET', 'THRESHOLD_TOO_LOW', 'NO_CODE', 'WRONG_CHAIN', 'GUARDIAN_EQUALS_TREASURY']) expect(r.reasons).toContain(x);
  });
  it('distinct valid Safes are only READY_FOR_HUMAN_REVIEW, never role config', () => {
    const r = assessGovernance(safe(A), safe(B, { owners: [o[0]!, o[1]!] }), k);
    expect(r).toEqual({ status: 'READY_FOR_HUMAN_REVIEW', reasons: [], canConfigureRoles: false });
  });
});

describe('fee illustration', () => {
  it('0/5/10 bps on 1000 USDT gross, none chosen', () => {
    const g = 1000n * 10n ** 18n;
    const f = illustrateFees(g);
    expect(f.map((x) => x.fee)).toEqual([0n, 5n * 10n ** 17n, 10n ** 18n]);
    expect(f.every((x) => x.chosen === false && x.fee + x.userNet === g)).toBe(true);
  });
});

describe('decisions & gate', () => {
  it('D-01..D-05 all pending', () => {
    expect(DECISIONS.map((d) => d.id)).toEqual(['D-01', 'D-02', 'D-03', 'D-04', 'D-05']);
    expect(DECISIONS.every((d) => d.status === 'OWNER_DECISION_PENDING' && d.decidedBy === null)).toBe(true);
  });
  it('gate is never GO even if every input is satisfied', () => {
    const g = launchGate({ governance: 'READY_FOR_HUMAN_REVIEW', humanReviewSignoffs: 2, decisionsOpen: 0, deviceTestsPassed: true, dependencyHighOpen: false, slitherHighOpen: 0 });
    expect(g.go).toBe(false);
    expect(g.blockers).toEqual(['LAUNCH_HOLD', 'EXECUTION_DISABLED']);
  });
  it('current state lists every blocker', () => {
    const g = launchGate({ governance: 'NOT_CONFIGURED', humanReviewSignoffs: 0, decisionsOpen: 5, deviceTestsPassed: false, dependencyHighOpen: true, slitherHighOpen: 6 });
    expect(g.blockers).toHaveLength(8);
  });
});

describe('user-approved min output & stale-context rejection', () => {
  const ctx = { chainId: 56, account: A, tokenIn: 'WBNB' as const, tokenOut: 'USDT' as const, poolFee: 500, amountIn: 10n ** 17n };
  const quote = { ...ctx, source: 'PANCAKE_V3_QUOTER' as const, quotedNetOut: 60n * 10n ** 18n, quotedAtSec: 1000, quoteBlock: 100 };
  const base = { quote, current: ctx, nowSec: 1005, currentBlock: 101, approvedMinNetOut: 59_800_000_000_000_000_000n, slippageBps: 50 };
  it('never signable', () => expect(reviewBnbSwap(base).canSign).toBe(false));
  it('requires user approved min', () => expect(reviewBnbSwap({ ...base, approvedMinNetOut: null }).reasons).toContain('MIN_NET_NOT_APPROVED'));
  for (const [name, cur] of [
    ['network', { ...ctx, chainId: 1 }], ['account', { ...ctx, account: B }], ['tier', { ...ctx, poolFee: 2500 }], ['amount', { ...ctx, amountIn: 2n * 10n ** 17n }],
  ] as const) it(`rejects ${name} change`, () => expect(reviewBnbSwap({ ...base, current: cur }).reasons).toContain('CONTEXT_CHANGED'));
  it('rejects stale quote', () => expect(reviewBnbSwap({ ...base, nowSec: 2000 }).reasons).toContain('QUOTE_STALE_TIME'));
});
