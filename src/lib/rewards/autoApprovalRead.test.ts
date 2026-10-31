import { describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('./approvalQueue.server', () => ({ loadQueueState: m.load }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: (table: string) => {
  const q: any = { select: () => q, eq: () => q, gte: () => q, is: () => q,
    maybeSingle: async () => ({ data: { enabled: true, suspended: false, acceptance_confirmed: true, policy_revision: 2, updated_by: 'operator' } }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve) };
  return q;
} } }));
import { readAutomation } from './autoApproval.server';
describe('read-only automatic approval planning', () => {
  it('never persists a partial snapshot while reading the next approval plan', async () => {
    m.load.mockImplementation(async (_ignore, opts) => {
      if (opts?.persistBatch !== false) throw new Error('Read attempted to freeze a batch');
      return { routineQueue: { candidates: [], excluded: [] }, report: { distributor: { live: { freeFlow: 1000, paused: false } } } };
    });
    const r = await readAutomation();
    expect(m.load).toHaveBeenCalledWith(undefined, { persistBatch: false });
    expect(r.pendingBatch.wallets).toBe(0);
    expect(r.wouldApprove).toEqual([]);
  });
});