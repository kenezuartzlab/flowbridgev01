import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ upsert: vi.fn(), insert: vi.fn(), report: vi.fn(), recovery: vi.fn() }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: (table: string) => {
  const q = { select: () => q, eq: () => q, gt: () => q, not: () => q, limit: async () => ({data:[],error:null}), upsert: m.upsert, insert: m.insert };
  return q;
} } }));
vi.mock('./settlement.server', () => ({readChainState: vi.fn()}));
vi.mock('./payoutRecovery.server', () => ({reconcileDurablePublications: m.recovery}));
vi.mock('./rewardSolvency.server', () => ({buildRewardSolvencyReport: m.report}));
import { runOpsSweep } from './controlCenter.server';
beforeEach(() => { vi.resetAllMocks(); m.upsert.mockResolvedValue({error:null}); m.insert.mockResolvedValue({error:null}); m.recovery.mockResolvedValue({confirmed:0,unresolved:0}); m.report.mockResolvedValue({settlement:{batchId:'batch',epochId:3,status:'BLOCKED',renewal:{needed:true},checks:[]},rounds:[]}); });
describe('scheduled payout verification alerts', () => {
  it('records actionable schedule renewal alerts and keeps both financial automations off', async () => {
    const summary = await runOpsSweep('cron'); expect(summary.autoFunding).toBe('OFF'); expect(summary.autoSigning).toBe('OFF');
    expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({kind:'SCHEDULE_NEEDS_RENEWAL',dedupe_key:'schedule:batch'}),expect.objectContaining({ignoreDuplicates:true}));
    expect(m.insert).toHaveBeenCalledWith({source:'cron',summary});
  });
  it('does not report success when operator alert persistence fails', async () => {
    m.upsert.mockResolvedValue({error:{message:'unavailable'}}); await expect(runOpsSweep('cron')).rejects.toThrow('Operator alert'); expect(m.insert).not.toHaveBeenCalled();
  });
  it('does not report success when the run record cannot be written', async () => {
    m.insert.mockResolvedValue({error:{message:'unavailable'}}); await expect(runOpsSweep('cron')).rejects.toThrow('Scheduled verification');
  });
});