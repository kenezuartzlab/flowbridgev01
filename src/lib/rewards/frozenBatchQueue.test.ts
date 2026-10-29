import { describe, expect, it } from 'vitest';
import type { Hex } from 'viem';
import { prepareSettlementBatch } from './settlementPlanner';
import { MAINNET_PAYOUT_AUDIT } from './rewardFundingPlan';
import { partitionApprovalsForStoredBatch, revalidateImmutableBatch, type ImmutableBatch } from './immutableBatch';
import { PUBLISHER_CONFIG } from './settlementQueue';

const now = 1792549800;
const W = ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222', '0x3333333333333333333333333333333333333333', '0x4444444444444444444444444444444444444444'];
const chain = { epochCount: 4, campaignBudgetWei: 1000000n * 10n ** 18n, totalClaimedWei: 0n, totalReservedWei: 0n, balanceWei: 1000000n * 10n ** 18n, minPublishDelay: 86400, paused: false, nowSec: now };
type Approval = { user_id: string; wallet: string; points: number; confirmed_at: string };
const approval = (i: number, points: number, at: string): Approval => ({ user_id: `u${i}`, wallet: W[i], points, confirmed_at: at });
const build = (approvals: Approval[], prior: Record<string, number> = {}) => prepareSettlementBatch({
  rows: approvals.map(a => ({ userId: a.user_id, wallet: a.wallet, classification: 'MATCH', authoritative: (prior[a.wallet] ?? 0) + a.points, pendingReview: 0, alreadyAllocatedPoints: prior[a.wallet] ?? 0 })),
  fundedPointsAvailable: 1_000_000, chainId: 677, distributor: MAINNET_PAYOUT_AUDIT.address as Hex, chain,
});
const BATCH_CREATED = '2026-10-29T03:00:00.000Z';
const firstCycle = [approval(0, 100, '2026-10-29T02:00:00Z'), approval(1, 50, '2026-10-29T02:10:00Z'), approval(2, 7, '2026-10-29T02:20:00Z')];
function storeFirstCycle(): ImmutableBatch {
  const p = build(firstCycle);
  if (!p.batch?.root) throw new Error('fixture must be eligible');
  return { id: 'round5', epochId: p.epochId, root: p.batch.root, totalWei: p.batch.totalWei, claimStart: now + 2 * 86400, claimEnd: now + 32 * 86400, leaves: p.batch.leaves, fingerprint: p.fingerprint, published: false };
}
const storedRef = (s: ImmutableBatch) => ({ createdAt: BATCH_CREATED, accounts: s.leaves.map(l => l.account) });

describe('prepared round stays frozen while later approvals queue for the next round', () => {
  it('3 wallets approved in one cycle produce exactly one batch with those 3 leaves', () => {
    const s = storeFirstCycle();
    expect(s.leaves.map(l => l.account.toLowerCase()).sort()).toEqual(W.slice(0, 3));
    expect(s.totalWei).toBe((157n * 10n ** 18n).toString());
  });
  it('a later approval no longer blocks the stored batch and is queued, not dropped', () => {
    const s = storeFirstCycle();
    const all = [...firstCycle, approval(3, 25, '2026-10-29T04:00:00Z')];
    // Old behaviour: rebuilding from every open approval changes the leaves -> BLOCKED.
    expect(revalidateImmutableBatch(build(all), s, now, 86400).status).toBe('BLOCKED');
    const { frozen, queuedNext } = partitionApprovalsForStoredBatch(all, storedRef(s));
    expect(queuedNext.map(a => a.wallet)).toEqual([W[3]]);
    const p = revalidateImmutableBatch(build(frozen), s, now, 86400);
    expect(p.reason).toBeNull();
    expect(p.status).toBe('READY_FOR_PUBLISHER_REVIEW');
    expect(p.batch?.root).toBe(s.root);
  });
  it('repeated and concurrent cycles are deterministic and never rewrite the stored root', () => {
    const s = storeFirstCycle();
    const all = [...firstCycle, approval(3, 25, '2026-10-29T04:00:00Z')];
    const results = Array.from({ length: 8 }, () => revalidateImmutableBatch(build(partitionApprovalsForStoredBatch(all, storedRef(s)).frozen), s, now, 86400));
    expect(new Set(results.map(r => r.tx?.data)).size).toBe(1);
    expect(results.every(r => r.status === 'READY_FOR_PUBLISHER_REVIEW' && r.batch?.root === s.root)).toBe(true);
  });
  it('a stored-wallet approval confirmed after batch creation (e.g. wallet change) is queued, never merged', () => {
    const s = storeFirstCycle();
    const late = { ...firstCycle[1], confirmed_at: '2026-10-29T05:00:00Z' };
    const { frozen, queuedNext } = partitionApprovalsForStoredBatch([firstCycle[0], late, firstCycle[2]], storedRef(s));
    expect(queuedNext).toEqual([late]);
    expect(revalidateImmutableBatch(build(frozen), s, now, 86400).status).toBe('BLOCKED'); // fails closed, no partial edit
  });
  it('without a stored batch every confirmed approval is eligible for preparation', () => {
    expect(partitionApprovalsForStoredBatch(firstCycle, null).frozen).toHaveLength(3);
  });
  it('a previously paid allocation is never reallocated', () => {
    const p = build([approval(0, 0, '2026-10-29T02:00:00Z')], { [W[0]]: 100 });
    expect(p.batch?.leaves ?? []).toHaveLength(0);
  });
  it('an expired stored schedule stays blocked and is not regenerated', () => {
    const s = { ...storeFirstCycle(), claimStart: now - 10, claimEnd: now + 86400 };
    const p = revalidateImmutableBatch(build(firstCycle), s, now, 86400);
    expect(p.status).toBe('BLOCKED'); expect(p.tx).toBeNull(); expect(p.claimStart).toBe(now - 10);
  });
  it('published batches cannot be re-submitted and signing stays manual', () => {
    const p = revalidateImmutableBatch(build(firstCycle), { ...storeFirstCycle(), published: true }, now, 86400);
    expect(p.tx).toBeNull();
    expect(PUBLISHER_CONFIG.autonomousSigning).toBe(false);
  });
});
