import { describe, expect, it } from 'vitest';
import type { Hex } from 'viem';
import { merkleClaimLeafHash } from './merkleClaim';
import { evaluateRound, runSequentialClaims, summarizeRounds, type EpochRead, type ClaimablePreparation } from './mainnetClaimRounds';
import type { MainnetEntitlementMatch } from './mainnetEpochManifest';

const CHAIN = 677;
const DIST = '0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922' as Hex;
const ME = '0x1111111111111111111111111111111111111111' as Hex;
const NOW = 2_000_000_000;
const E18 = 10n ** 18n;

function ent(epochId: number, flow: bigint, opts: { root?: Hex; account?: Hex } = {}): MainnetEntitlementMatch {
  const leaf = { epochId, index: 0, account: opts.account ?? ME, amount: (flow * E18).toString() };
  const root = opts.root ?? merkleClaimLeafHash({ chainId: CHAIN, distributor: DIST, leaf });
  return {
    manifest: { chainId: CHAIN, epochId, campaignId: `R${epochId}`, distributor: DIST, root, allocationWei: leaf.amount, claimStart: 0, claimEnd: 0, publicationTxHash: null, entitlements: [] },
    leaf,
    proof: [],
  } as unknown as MainnetEntitlementMatch;
}
const live = (e: MainnetEntitlementMatch, w: Partial<EpochRead> = {}): EpochRead => ({
  root: e.manifest.root, claimStart: NOW - 100, claimEnd: NOW + 1000, cancelled: false, released: false, claimed: false, ...w,
});
const ev = (e: MainnetEntitlementMatch, read: EpochRead | null, o: { paused?: boolean; reserved?: bigint; epochCount?: bigint } = {}) =>
  evaluateRound({
    chainId: CHAIN, distributor: DIST, entitlement: e, epochCount: o.epochCount ?? 10n, paused: o.paused ?? false, read,
    distributorBalance: (10_000n * E18).toString(), totalReserved: ((o.reserved ?? 5_000n) * E18).toString(),
    nowSeconds: NOW, publicClaimsOpen: true, lastHistoricalEpoch: 2,
  });

describe('multi-round claim selection', () => {
  it('oldest expired does not hide a newer claimable round', () => {
    const a = ent(3, 100n), b = ent(4, 50n);
    const s = summarizeRounds([ev(a, live(a, { claimStart: NOW - 9000, claimEnd: NOW - 10 })), ev(b, live(b))]);
    expect(s.claimable.map((p) => p.epochId)).toEqual([4]);
    expect(s.totalClaimableWei).toBe((50n * E18).toString());
    expect(s.history[0].status).toBe('EXPIRED');
  });
  it('oldest not yet open does not hide a newer open round', () => {
    const a = ent(3, 100n), b = ent(4, 50n);
    const s = summarizeRounds([ev(a, live(a, { claimStart: NOW + 50 })), ev(b, live(b))]);
    expect(s.active[0].epochId).toBe(4);
    expect(s.active[1].status).toBe('OPENS_LATER');
    expect(s.totalClaimableWei).toBe((50n * E18).toString());
  });
  it('already claimed + open sums only the open round; all claimed sums zero', () => {
    const a = ent(3, 100n), b = ent(4, 50n);
    expect(summarizeRounds([ev(a, live(a, { claimed: true })), ev(b, live(b))]).totalClaimableWei).toBe((50n * E18).toString());
    const all = summarizeRounds([ev(a, live(a, { claimed: true })), ev(b, live(b, { claimed: true }))]);
    expect(all.totalClaimableWei).toBe('0');
    expect(all.history).toHaveLength(2);
  });
  it('two open rounds sum both, soonest deadline first', () => {
    const a = ent(3, 100n), b = ent(4, 50n);
    const s = summarizeRounds([ev(a, live(a, { claimEnd: NOW + 5000 })), ev(b, live(b, { claimEnd: NOW + 200 }))]);
    expect(s.claimable.map((p) => p.epochId)).toEqual([4, 3]);
    expect(s.totalClaimableWei).toBe((150n * E18).toString());
  });
  it('root mismatch, paused, failed read and unpublished never become claimable', () => {
    const a = ent(4, 50n);
    expect(ev(a, live(a, { root: ('0x' + '9'.repeat(64)) as Hex })).status).toBe('ROOT_MISMATCH');
    expect(ev(a, live(a), { paused: true }).status).toBe('PAUSED');
    expect(ev(a, null).status).toBe('READ_FAILED');
    expect(ev(a, live(a), { epochCount: 3n }).status).toBe('NOT_PUBLISHED');
  });
  it('a proof for another wallet does not verify against this root', () => {
    const mine = ent(4, 50n);
    const forged = ent(4, 50n, { account: '0x2222222222222222222222222222222222222222' as Hex, root: mine.manifest.root });
    expect(ev(forged, live(forged)).status).toBe('BLOCKED');
  });
  it('underfunded reservation blocks the claim', () => {
    const a = ent(4, 50n);
    expect(ev(a, live(a), { reserved: 10n }).status).toBe('BLOCKED');
  });
  it('duplicate proofs for the same leaf count once', () => {
    const a = ent(4, 50n);
    const r = ev(a, live(a));
    expect(summarizeRounds([r, r]).totalClaimableWei).toBe((50n * E18).toString());
  });
});

const prep = (epochId: number): ClaimablePreparation => ({
  claimable: true, chainId: CHAIN, distributor: DIST, epochId, index: 0, account: ME, amount: '1', proof: [], claimEnd: NOW,
});

describe('sequential claiming', () => {
  it('next signature only after prior receipt success and claimed re-read', async () => {
    const log: string[] = [];
    const claimed = new Set<number>();
    const out = await runSequentialClaims([prep(3), prep(4)], {
      preflight: async () => undefined,
      readClaimed: async (p) => claimed.has(p.epochId),
      send: async (p) => { log.push(`send${p.epochId}`); return `0x${p.epochId}`; },
      waitReceipt: async (h) => { log.push(`receipt${h}`); claimed.add(Number(h.slice(2))); return 'success'; },
    });
    expect(log).toEqual(['send3', 'receipt0x3', 'send4', 'receipt0x4']);
    expect(out.map((r) => r.outcome)).toEqual(['claimed', 'claimed']);
  });
  it('rejection stops the run; remaining round is not sent', async () => {
    let sends = 0;
    const out = await runSequentialClaims([prep(3), prep(4)], {
      preflight: async () => undefined,
      readClaimed: async () => false,
      send: async () => { sends++; throw new Error('User rejected'); },
      waitReceipt: async () => 'success',
    });
    expect(sends).toBe(1);
    expect(out).toEqual([{ epochId: 3, outcome: 'rejected', error: 'User rejected' }]);
  });
  it('revert is reported as failed, never claimed', async () => {
    const out = await runSequentialClaims([prep(4)], {
      preflight: async () => undefined, readClaimed: async () => false, send: async () => '0xa', waitReceipt: async () => 'reverted',
    });
    expect(out[0].outcome).toBe('reverted');
  });
  it('success receipt without on-chain claimed state is unconfirmed', async () => {
    const out = await runSequentialClaims([prep(4)], {
      preflight: async () => undefined, readClaimed: async () => false, send: async () => '0xa', waitReceipt: async () => 'success',
    });
    expect(out[0].outcome).toBe('unconfirmed');
  });
  it('wrong wallet or chain in preflight stops before signing', async () => {
    let sent = false;
    const out = await runSequentialClaims([prep(4)], {
      preflight: async () => { throw new Error('Connect 0x1111…1111'); },
      readClaimed: async () => false, send: async () => { sent = true; return '0x'; }, waitReceipt: async () => 'success',
    });
    expect(sent).toBe(false);
    expect(out[0].outcome).toBe('rejected');
  });
  it('partial completion: retry skips already-claimed round', async () => {
    const out = await runSequentialClaims([prep(3), prep(4)], {
      preflight: async () => undefined,
      readClaimed: async (p) => p.epochId === 3 || out4,
      send: async () => '0x4', waitReceipt: async () => { out4 = true; return 'success'; },
    });
    expect(out.map((r) => r.outcome)).toEqual(['skipped', 'claimed']);
  });
});
let out4 = false;
