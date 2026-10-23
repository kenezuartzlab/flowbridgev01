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
describe('community write authentication',()=>{
  it('unauthenticated submissions cannot write',async()=>{m.auth.mockResolvedValue(null);expect((await handler(proposals,'POST')({request:request({category:'Feature',text:'Valid'})})).status).toBe(401);expect(m.create).not.toHaveBeenCalled();});
  it('authenticated submissions use anonymous public authorship',async()=>{expect((await handler(proposals,'POST')({request:request({category:'Feature',text:'Valid',author:'spoofed'})})).status).toBe(201);expect(m.create).toHaveBeenCalledWith('Feature','Valid','Anonymous Supporter');});
  it('oversized input never writes',async()=>{expect((await handler(proposals,'POST')({request:request({category:'Feature',text:'x'.repeat(1001)})})).status).toBe(400);expect(m.create).not.toHaveBeenCalled();});
  it('unauthenticated votes never increment',async()=>{m.auth.mockResolvedValue(null);expect((await handler(votes,'POST')({request:request(),params:{id:'proposal'}})).status).toBe(401);expect(m.vote).not.toHaveBeenCalled();});
  it('votes use only the authenticated account identity',async()=>{expect((await handler(votes,'POST')({request:request({userId:'attacker'}),params:{id:'proposal'}})).status).toBe(200);expect(m.vote).toHaveBeenCalledWith('proposal','account');});
});
describe('site settings authorization',()=>{
  it('ordinary operators cannot change fees or rewards',async()=>{m.gate.mockResolvedValue({ok:true,admin:{role:'internal_operator'}});expect((await handler(settings,'PUT')({request:request({fees:{}})})).status).toBe(403);expect(m.write).not.toHaveBeenCalled();});
  it('anonymous direct requests cannot change settings',async()=>{m.gate.mockResolvedValue({ok:false,response:Response.json({error:'Unauthorized'},{status:401})});expect((await handler(settings,'PUT')({request:request({})})).status).toBe(401);expect(m.write).not.toHaveBeenCalled();});
  it('authorized settings changes pass the authenticated actor to audited storage',async()=>{const admin={role:'super_admin',userId:'account'};m.gate.mockResolvedValue({ok:true,admin});const flags={showBanners:true,maintenanceNotice:''};expect((await handler(settings,'PUT')({request:request({flags})})).status).toBe(200);expect(m.write).toHaveBeenCalledExactlyOnceWith('flags',flags,admin);});
});