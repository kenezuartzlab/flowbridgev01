import { describe, expect, it } from 'vitest';
import { prepareSettlementBatch } from './settlementPlanner';
import type { Hex } from 'viem';
import { MAINNET_PAYOUT_AUDIT } from './rewardFundingPlan';
import { integerWei, revalidateImmutableBatch, type ImmutableBatch } from './immutableBatch';
const now = 1792549800;
const run = (points = 1122, time = now) => prepareSettlementBatch({
  rows: [{ userId: 'test', wallet: '0xce42b27d5e5b8c2545ddabea204d776e658d9dd5', classification: 'MATCH', authoritative: points, pendingReview: 0, alreadyAllocatedPoints: 0 }],
  fundedPointsAvailable: 2000, chainId: 677, distributor: MAINNET_PAYOUT_AUDIT.address as Hex,
  chain: { epochCount: 2, campaignBudgetWei: 1000000n * 10n ** 18n, totalClaimedWei: 0n, totalReservedWei: 0n, balanceWei: 1000000n * 10n ** 18n, minPublishDelay: 86400, paused: false, nowSec: time },
});
function stored(): ImmutableBatch {
  const p = run();
  if (!p.batch?.root) throw new Error('Fixture must be eligible');
  return { id: 'unchanged', epochId: 3, root: p.batch.root, totalWei: p.batch.totalWei, claimStart: now + 3 * 86400, claimEnd: now + 33 * 86400, leaves: p.batch.leaves, fingerprint: p.fingerprint, published: false };
}
describe('immutable reviewed batch', () => {
  it('refresh and reconnect keep the stored identity and schedule despite hourly fingerprint drift', () => {
    const s = stored(); const c = run(1122, now + 3600);
    expect(c.fingerprint).not.toBe(s.fingerprint);
    const p = revalidateImmutableBatch(c,s,now + 3600,86400);
    expect(p.status).toBe('READY_FOR_PUBLISHER_REVIEW'); expect(p.fingerprint).toBe(s.fingerprint);
    expect(p.claimStart).toBe(s.claimStart); expect(p.batch?.totalWei).toBe('1122000000000000000000');
  });
  it('expired stored review cannot be repaired by generating a new window', () => {
    const s = {...stored(),claimStart:1792512000,claimEnd:1795104000};
    const p = revalidateImmutableBatch(run(),s,now,86400);
    expect(p.status).toBe('BLOCKED');expect(p.tx).toBeNull();expect(p.reason).toContain('STORED_CLAIM_WINDOW'); expect(s.claimStart).toBe(1792512000);
  });
  it('stale allocation, including the 74 unfunded points, cannot enter the stored 1122 batch', () => {
    const p = revalidateImmutableBatch(run(1196),stored(),now,86400);
    expect(p.status).toBe('BLOCKED');expect(p.tx).toBeNull();expect(p.reason).toContain('IMMUTABLE_ALLOCATION');
  });
  it('successful re-review of unchanged valid eligibility is deterministic across simultaneous callers', () => {
    const s=stored();const results=Array.from({length:8},()=>revalidateImmutableBatch(run(),s,now,86400));
    expect(results.every(p=>p.status==='READY_FOR_PUBLISHER_REVIEW')).toBe(true);
    expect(new Set(results.map(p=>p.tx?.data)).size).toBe(1);expect(s.id).toBe('unchanged');
  });
  it('published stored batches cannot reopen wallet submission', () => {
    expect(revalidateImmutableBatch(run(),{...stored(),published:true},now,86400).tx).toBeNull();
  });
  it('expands JSON exponent allocations exactly instead of turning 1122 FLOW into 1 wei', () => {
    expect(integerWei(1.122e21)).toBe('1122000000000000000000');
    expect(integerWei('1122000000000000000000')).toBe('1122000000000000000000');
    expect(()=>integerWei('1.5')).toThrow();
  });
});