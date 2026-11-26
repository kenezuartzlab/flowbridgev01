import { describe, expect, it } from 'vitest';
import { keccak256, toBytes, getAddress } from 'viem';
import { assessGovernance, developmentReadiness, isChecksumAddress, illustrateFees, DECISIONS, launchGate, FIXED_PROTOCOL_TARGETS, OWNER_INPUT_CHECKLIST, OWNER_INPUT_STATUS, type SafeFacts } from './launchReadiness';
import { reviewBnbSwap } from './executionReviewPolicy';

const k = (s: string) => keccak256(toBytes(s)).slice(2);
const A = getAddress('0x' + '11'.repeat(20)), B = getAddress('0x' + '22'.repeat(20));
const o = [getAddress('0x' + 'a1'.repeat(20)), getAddress('0x' + 'b2'.repeat(20)), getAddress('0x' + 'c3'.repeat(20))];
const safe = (address: string, p: Partial<SafeFacts> = {}): SafeFacts => ({ address, chainId: 56, hasCode: true, owners: o, threshold: 2, observedAtBlock: 135_800_000, evidence: 'READ_ONLY_CHAIN56_RPC', ...p });

describe('owner-input-deferred development readiness', () => {
  it('passes non-executable development while launch and execution stay disabled', () => {
    expect(developmentReadiness()).toEqual({ status: 'PASS_FOR_NON_EXECUTABLE_DEVELOPMENT', ownerInput: 'GUARDIAN_AND_TREASURY_DEFERRED_BY_OWNER', launch: 'HOLD', executionEnabled: false, financialActionsAuthorized: false });
  });
  it('requests two Safes, fees/consent, pause/recovery, review limits and final hash date only later', () => {
    expect(OWNER_INPUT_CHECKLIST.map((item) => item.id)).toEqual(['OI-01', 'OI-02', 'OI-03', 'OI-04', 'OI-05']);
    expect(OWNER_INPUT_CHECKLIST.every((item) => item.status === OWNER_INPUT_STATUS)).toBe(true);
    expect(OWNER_INPUT_CHECKLIST[0]!.proposal).toContain('Prefer 2-of-3');
    expect(JSON.stringify(OWNER_INPUT_CHECKLIST)).not.toMatch(/private key|recovery phrase collection\./i);
  });
});

describe('governance readiness (synthetic addresses, never real roles)', () => {
  it('defers missing owner addresses without treating placeholders as ready', () => {
    expect(assessGovernance(null, null, k)).toEqual({ status: 'NOT_CONFIGURED', reasons: ['GUARDIAN_AND_TREASURY_DEFERRED_BY_OWNER'], canConfigureRoles: false });
    expect(assessGovernance(safe('0x' + '00'.repeat(20)), safe(B), k).status).toBe('INVALID');
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
  it('requires read-only observation provenance, valid unique owners and a valid block', () => {
    const badOwners = assessGovernance(safe(A, { owners: [o[0]!, o[0]!], threshold: 2 }), safe(B), k);
    expect(badOwners.reasons).toContain('INVALID_OWNER');
    const noObservation = assessGovernance(safe(A, { observedAtBlock: 0 }), safe(B), k);
    expect(noObservation.reasons).toContain('UNVERIFIED_CHAIN_OBSERVATION');
  });
  it('distinct valid 2-of-3 Safe facts are only READY_FOR_HUMAN_REVIEW, never role config', () => {
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
