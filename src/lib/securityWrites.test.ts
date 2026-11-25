import { beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),gate:vi.fn(),create:vi.fn(),vote:vi.fn(),write:vi.fn(),bind:vi.fn()}));
vi.mock('@/lib/api-auth.server',()=>({getAuthUser:m.auth,unauthorized:()=>Response.json({error:'Unauthorized'},{status:401}),jsonResponse:(body:unknown,status=200)=>Response.json(body,{status})}));
vi.mock('@/lib/admin/adminGate.server',()=>({requireAdmin:m.gate}));
vi.mock('@/lib/flowbridge-db.server',()=>({createProposal:m.create,upvoteProposal:m.vote,getProposals:async()=>[],bindUserWallet:m.bind}));
vi.mock('@/lib/appConfig.server',()=>({writeSetting:m.write,readAllSettings:async()=>({}),buildPublicConfig:async()=>({})}));
import {Route as proposals} from '@/routes/api/proposals';
import {Route as votes} from '@/routes/api/proposals.$id.vote';
import {Route as settings} from '@/routes/api/admin.settings';
type Handler=(args:{request:Request;params?:{id:string}})=>Promise<Response>;
function handler(route:{options:unknown},method:string){return (route.options as {server:{handlers:Record<string,Handler>}}).server.handlers[method];}
const request=(body:unknown={})=>new Request('http://localhost/api',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue({id:'account',emailVerified:true});m.create.mockResolvedValue({id:'proposal'});m.vote.mockResolvedValue({proposal:{id:'proposal',votes:1},alreadyVoted:false});});
// Proposal/contribution writes were permanently retired (owner directive; see communityRetired).
// Former auth/validation expectations are stale: every caller, authenticated or not, must get 410 and nothing may write.
describe('retired community proposal writes',()=>{
  const states=[['unauthenticated',null],['verified account',{id:'account',emailVerified:true}]] as const;
  for(const [label,user] of states){
    it(`proposal submissions are retired for ${label} callers and never write`,async()=>{m.auth.mockResolvedValue(user);for(const body of [{category:'Feature',text:'Valid',author:'spoofed'},{category:'Feature',text:'x'.repeat(1001)}]){expect((await handler(proposals,'POST')({request:request(body)})).status).toBe(410);}expect(m.create).not.toHaveBeenCalled();});
    it(`proposal votes are retired for ${label} callers and never increment`,async()=>{m.auth.mockResolvedValue(user);expect((await handler(votes,'POST')({request:request({userId:'attacker'}),params:{id:'proposal'}})).status).toBe(410);expect(m.vote).not.toHaveBeenCalled();});
  }
  it('proposal reads are retired too',async()=>{expect((await handler(proposals,'GET')({request:new Request('http://localhost/api')})).status).toBe(410);});
});
describe('site settings authorization',()=>{
  it('ordinary operators cannot change fees or rewards',async()=>{m.gate.mockResolvedValue({ok:true,admin:{role:'internal_operator'}});expect((await handler(settings,'PUT')({request:request({fees:{}})})).status).toBe(403);expect(m.write).not.toHaveBeenCalled();});
  it('anonymous direct requests cannot change settings',async()=>{m.gate.mockResolvedValue({ok:false,response:Response.json({error:'Unauthorized'},{status:401})});expect((await handler(settings,'PUT')({request:request({})})).status).toBe(401);expect(m.write).not.toHaveBeenCalled();});
  it('authorized settings changes pass the authenticated actor to audited storage',async()=>{const admin={role:'super_admin',userId:'account'};m.gate.mockResolvedValue({ok:true,admin});const flags={showBanners:true,maintenanceNotice:''};expect((await handler(settings,'PUT')({request:request({flags})})).status).toBe(200);expect(m.write).toHaveBeenCalledExactlyOnceWith('flags',flags,admin);});
});