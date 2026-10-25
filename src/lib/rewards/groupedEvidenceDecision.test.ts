import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),report:vi.fn()}));
vi.mock('@/integrations/supabase/client.server',()=>({supabaseAdmin:{rpc:m.rpc}}));
vi.mock('./settlement.server',()=>({readChainState:vi.fn()}));
vi.mock('./rewardSolvency.server',()=>({buildRewardSolvencyReport:m.report}));
import {groupedEvidenceReview} from './controlCenter.server';
const actor={userId:'reviewer',email:'reviewer@example.invalid',wallet:'fixture-wallet',role:'super_admin' as const};
beforeEach(()=>{vi.resetAllMocks();m.rpc.mockResolvedValue({data:'APPROVED',error:null});m.report.mockResolvedValue({settlement:{status:'BLOCKED',renewal:{needed:true,ready:true}}});});
describe('group decision recalculation without financial actions',()=>{
 it('recalculates eligibility and proposes a schedule without approving renewal',async()=>{const r=await groupedEvidenceReview(actor,{action:'APPROVED',groupId:'group'});expect(r.ok).toBe(true);expect('recalculation' in r && r.recalculation?.renewal).toEqual({needed:true,ready:true});expect(m.report).toHaveBeenCalledTimes(1);expect(m.rpc).toHaveBeenCalledTimes(1);expect(m.rpc.mock.calls[0][0]).toBe('decide_reward_evidence_group');});
 it('rejects operators before any decision RPC',async()=>{expect((await groupedEvidenceReview({...actor,role:'internal_operator'},{action:'APPROVED',groupId:'group'})).ok).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
 it('never recalculates after a failed independent approval',async()=>{m.rpc.mockResolvedValue({data:null,error:{message:'same proposer'}});expect((await groupedEvidenceReview(actor,{action:'APPROVED',groupId:'group'})).ok).toBe(false);expect(m.report).not.toHaveBeenCalled();});
 it('does not repeat a committed decision when read-only preparation fails',async()=>{m.report.mockRejectedValue(new Error('RPC unavailable'));const r=await groupedEvidenceReview(actor,{action:'APPROVED',groupId:'group'});expect(r.ok).toBe(true);expect('recalculation' in r && r.recalculation?.status).toBe('CHECKS_UNAVAILABLE');expect(m.rpc).toHaveBeenCalledTimes(1);});
});