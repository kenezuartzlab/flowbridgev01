import {beforeEach,describe,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),report:vi.fn(),state:vi.fn()}));
vi.mock('@/integrations/supabase/client.server',()=>({supabaseAdmin:{rpc:m.rpc,from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{program_id:'CORE_SWAP',total_points:10,status:'CONFIRMED'}})};return q;}}}));
vi.mock('./settlement.server',()=>({readChainState:m.state}));
vi.mock('./rewardSolvency.server',()=>({buildRewardSolvencyReport:m.report}));
import {confirmFunding} from './controlCenter.server';
const admin={userId:'approver',email:'approver@example.test',wallet:'wallet',role:'super_admin' as const};
beforeEach(()=>{vi.resetAllMocks();m.rpc.mockResolvedValue({data:{outcome:'CONFIRMED'},error:null});m.report.mockResolvedValue({settlement:{status:'READY_FOR_PUBLISHER_REVIEW'}});});
describe('post-commit unsigned distribution preparation',()=>{
 it('prepares only after successful confirmation',async()=>{const r=await confirmFunding(admin,'snapshot','hash');expect(r.distribution).toEqual({status:'READY_FOR_PUBLISHER_REVIEW',prepared:true});expect(m.rpc).toHaveBeenCalledTimes(1);expect(m.report).toHaveBeenCalledTimes(1);});
 it('reports failed distribution checks without repeating committed funding',async()=>{m.report.mockRejectedValue(new Error('unavailable'));const r=await confirmFunding(admin,'snapshot','hash');expect(r.ok).toBe(true);expect(r.distribution?.prepared).toBe(false);expect(m.rpc).toHaveBeenCalledTimes(1);});
 it('does not prepare after stale confirmation',async()=>{m.rpc.mockResolvedValue({data:{outcome:'STALE'},error:null});await confirmFunding(admin,'snapshot','hash');expect(m.report).not.toHaveBeenCalled();});
 it('rejects non-authorized confirmation before any financial call',async()=>{expect((await confirmFunding({...admin,role:'internal_operator'},'snapshot','hash')).ok).toBe(false);expect(m.rpc).not.toHaveBeenCalled();});
});