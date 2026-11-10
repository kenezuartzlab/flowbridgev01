import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({user:vi.fn(),rpc:vi.fn(),admin:vi.fn()}));
vi.mock('@/lib/api-auth.server',()=>({getAuthUser:mocks.user,jsonResponse:(body:unknown,status=200)=>new Response(JSON.stringify(body),{status})}));
vi.mock('@/integrations/supabase/client.server',()=>({supabaseAdmin:{rpc:mocks.rpc}}));
vi.mock('@/lib/admin/adminGate.server',()=>({requireAdmin:mocks.admin}));
import {handleAdventure} from '@/routes/api/adventure';
import {handleAdventureAdmin} from '@/routes/api/admin.adventure';
beforeEach(()=>{vi.clearAllMocks();mocks.user.mockResolvedValue({id:'user',emailVerified:true});mocks.rpc.mockResolvedValue({data:{complete:true},error:null});});
describe('Adventure API authority',()=>{
  it('rejects signed-out access before privileged operations',async()=>{mocks.user.mockResolvedValue(null);expect((await handleAdventure(new Request('http://localhost/api/adventure'))).status).toBe(401);expect(mocks.rpc).not.toHaveBeenCalled();});
  it('wallet signature alone or unverified email cannot start',async()=>{mocks.user.mockResolvedValue({id:'user',emailVerified:false});expect((await handleAdventure(new Request('http://localhost/api/adventure'))).status).toBe(403);expect(mocks.rpc).not.toHaveBeenCalled();});
  it('default-OFF rejects before completion',async()=>{mocks.rpc.mockResolvedValue({error:{message:'paused'}});expect((await handleAdventure(new Request('http://localhost/api/adventure'))).status).toBe(403);expect(mocks.rpc).toHaveBeenCalledTimes(1);});
  it('rejects client complete flags, identity overrides and payout instructions',async()=>{for(const body of [{action:'complete',quest:'swap'},{action:'refresh',userId:'other'},{action:'signup_bonus'}]){expect((await handleAdventure(new Request('http://localhost/api/adventure',{method:'POST',body:JSON.stringify(body)}))).status).toBe(400);}expect(mocks.rpc).toHaveBeenCalledTimes(3);});
  it('scopes quiz to validated caller, never supplied wallet or points',async()=>{const res=await handleAdventure(new Request('http://localhost/api/adventure',{method:'POST',body:JSON.stringify({action:'start',topic:'basics'})}));expect(res.status).toBe(200);expect(mocks.rpc).toHaveBeenLastCalledWith('adventure_quiz',{p_user:'user',p_topic:'basics'});});
  it('forbids ordinary accounts configuring Adventure',async()=>{mocks.admin.mockResolvedValue({ok:true,admin:{role:'internal_operator'}});expect((await handleAdventureAdmin(new Request('http://localhost/api/admin/adventure'))).status).toBe(403);expect(mocks.rpc).not.toHaveBeenCalled();});
  it('rejects unauthenticated admin',async()=>{mocks.admin.mockResolvedValue({ok:false,response:new Response(null,{status:401})});expect((await handleAdventureAdmin(new Request('http://localhost/api/admin/adventure'))).status).toBe(401);});
});