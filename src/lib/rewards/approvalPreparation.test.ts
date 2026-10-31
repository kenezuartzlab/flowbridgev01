import { describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ report: vi.fn(), confirmed: false, writes: [] as string[] }));
vi.mock('./rewardSolvency.server', () => ({ buildRewardSolvencyReport: m.report }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: (table: string) => {
  let operation = 'read';
  const q: any = { select: () => q, eq: () => q, or: () => q, not: () => q, update: () => { operation = 'update'; return q; },
    insert: async () => { m.writes.push(table); return { error: null }; },
    maybeSingle: async () => ({ data: { status: 'APPROVED', evidence_hash: 'hash', points: 25, user_id: 'recipient', wallet: '0x1111111111111111111111111111111111111111' } }),
    then: (resolve: (v: unknown) => unknown) => {
      if (operation === 'update') { m.confirmed = true; m.writes.push(table); }
      return Promise.resolve({ data: operation === 'update' ? [{ id: 'approval' }] : [], error: null }).then(resolve);
    } };
  return q;
} } }));
import { confirmApproved } from './approvalQueue.server';
describe('approval preparation ordering', () => {
  it('manual confirmation prepares only after commit, from all confirmed rows', async () => {
    m.confirmed = false; m.writes = [];
    m.report.mockImplementation(async (opts) => {
      if (opts?.persistBatch !== false && !m.confirmed) throw new Error('premature snapshot');
      return { distributor: { live: { freeFlow: 1000, paused: false } }, settlement: {
        status: m.confirmed ? 'READY_FOR_PUBLISHER_REVIEW' : 'BLOCKED', claimStartIso: null, claimEndIso: null,
        accountRows: [{ userId: 'recipient', wallet: '0x1111111111111111111111111111111111111111', classification: 'MATCH', authoritative: 25, pendingReview: 0, alreadyAllocatedPoints: 0, fundedByProgram: { SIGNUP_BONUS: 25 }, routineFundedByProgram: { SIGNUP_BONUS: 25 } }],
      } };
    });
    const r = await confirmApproved({ userId: 'operator', email: 'test@example.invalid', role: 'super_admin' }, 'approval', 'hash');
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);
    expect(r.distribution.prepared).toBe(true);
    expect(m.report.mock.calls.map(c => c[0])).toEqual([{ persistBatch: false }, undefined]);
    expect(m.writes).toEqual(['reward_payout_approvals', 'admin_audit_events']);
  });
});