import {describe,it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>({gate:vi.fn(),from:vi.fn()}));
vi.mock('@/lib/admin/adminGate.server',()=>({requireAdmin:mocks.gate}));
vi.mock('@/integrations/supabase/client.server',()=>({supabaseAdmin:{from:mocks.from}}));
vi.mock('@/lib/rewards/settlement.server',()=>({DISTRIBUTOR:'0x'+'1'.repeat(40)}));
import {Route} from '@/routes/api/admin.rewards-publish-verify';
import {SETTLEMENT_SIGNER} from './settlementPlanner';
const post=(request:Request)=>(Route.options as unknown as {server:{handlers:{POST:(p:{request:Request})=>Promise<Response>}}}).server.handlers.POST({request});
beforeEach(()=>vi.resetAllMocks());
describe('publisher server authorization',()=>{
 it('rejects signed-out callers before database access',async()=>{mocks.gate.mockResolvedValue({ok:false,response:new Response('Unauthorized',{status:401})});expect((await post(new Request('http://localhost/api',{method:'POST'}))).status).toBe(401);expect(mocks.from).not.toHaveBeenCalled();});
 it('rejects absent/wrong bound-wallet context before storage access',async()=>{mocks.gate.mockResolvedValue({ok:false,response:new Response('Forbidden',{status:403})});expect((await post(new Request('http://localhost/api',{method:'POST',headers:{'x-wallet-address':SETTLEMENT_SIGNER.address}}))).status).toBe(403);expect(mocks.from).not.toHaveBeenCalled();});
 it('an approved operator cannot impersonate publisher with request body',async()=>{mocks.gate.mockResolvedValue({ok:true,admin:{wallet:'0x'+'2'.repeat(40)}});expect((await post(new Request('http://localhost/api',{method:'POST',body:JSON.stringify({publisher:SETTLEMENT_SIGNER.address})}))).status).toBe(403);expect(mocks.from).not.toHaveBeenCalled();});
 it('rejects edits or verification writes against historical epochs 1 and 2',async()=>{mocks.gate.mockResolvedValue({ok:true,admin:{wallet:SETTLEMENT_SIGNER.address}});for(const epochId of [1,2])expect((await post(new Request('http://localhost/api',{method:'POST',body:JSON.stringify({epochId,root:'0x'+'a'.repeat(64),fingerprint:'f'})}))).status).toBe(400);expect(mocks.from).not.toHaveBeenCalled();});
});
