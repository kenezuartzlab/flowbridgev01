import {beforeEach,describe,it,expect,vi} from 'vitest';
import {SETTLEMENT_SIGNER} from './settlementPlanner';
const m=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn(),preflight:vi.fn(),recover:vi.fn(),nonce:vi.fn(),verify:vi.fn(),fresh:vi.fn()}));
vi.mock('@/lib/admin/adminGate.server',()=>({requireAdmin:async()=>({ok:true,admin:{wallet:SETTLEMENT_SIGNER.address,userId:'actor',email:'test@example.invalid',role:'super_admin'}})}));
vi.mock('@/integrations/supabase/client.server',()=>({supabaseAdmin:{from:m.from,rpc:m.rpc}}));
vi.mock('@/lib/rewards/settlement.server',()=>({DISTRIBUTOR:'0x'+'1'.repeat(40)}));
vi.mock('@/lib/rewards/publisherReconciliation.server',()=>({publicationPreflight:m.preflight,recoverPublisherHash:m.recover,publicationNonceMatches:m.nonce}));
vi.mock('@/lib/rewards/publicationRecovery.server',()=>({verifyPublicationOnChain:m.verify}));
vi.mock('@/lib/rewards/rewardSolvency.server',()=>({buildRewardSolvencyReport:m.fresh}));
vi.mock('@/lib/rewards/scheduleRenewal.server',()=>({resolveBatchSchedule:async(_admin:unknown,batch:unknown)=>batch}));
import {Route} from '@/routes/api/admin.rewards-publish-verify';
const hash='0x'+'a'.repeat(64),root='0x'+'b'.repeat(64);
let attempt:Record<string,unknown>;
const call=async(method:'POST'|'PATCH'|'PUT',extra:Record<string,unknown>={})=>{
 const handlers=(Route.options as unknown as {server:{handlers:Record<string,(p:{request:Request})=>Promise<Response>>}}).server.handlers;
 return handlers[method]({request:new Request('http://localhost/api',{method,body:JSON.stringify({epochId:3,root,fingerprint:'f',attemptId:'attempt',operationId:'op',...extra})})});
};
beforeEach(()=>{
 vi.resetAllMocks();attempt={id:'attempt',operation_id:'op',sender_nonce:42,tx_hash:null,phase:'AWAITING_WALLET'};
 const batch={id:'batch',epoch_id:3,root,fingerprint:'f',leaves:[{}],total_wei:'1122000000000000000000',claim_start:1,claim_end:2};
 m.from.mockImplementation((table:string)=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='reward_settlement_batches'?batch:attempt})};return q;});
 m.rpc.mockResolvedValue({data:true});m.preflight.mockResolvedValue({epochAvailable:true,latest:42,pending:42,head:100n});m.recover.mockResolvedValue(null);m.nonce.mockResolvedValue(true);m.verify.mockResolvedValue({phase:'BROADCAST_PENDING',checks:[]});
});
describe('durable publisher recovery API',()=>{
 it('missing or expired reviewed batches never acquire a publication lock',async()=>{
  m.from.mockImplementation(()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null})};return q;});
  expect((await call('PUT')).status).toBe(409);expect(m.rpc).not.toHaveBeenCalled();
 });
 it('expired stored windows fail server validation before acquiring a lock',async()=>{
  m.fresh.mockResolvedValue({settlement:{status:'BLOCKED',reason:'STORED_CLAIM_WINDOW',fingerprint:'f',root,tx:null}});
  expect((await call('PUT')).status).toBe(409);expect(m.rpc).not.toHaveBeenCalled();
 });
 it('apparently ready but altered calldata cannot acquire the immutable batch lock',async()=>{
  m.fresh.mockResolvedValue({settlement:{status:'READY_FOR_PUBLISHER_REVIEW',fingerprint:'f',root,epochId:3,simulation:{ok:true},tx:{to:'0x'+'1'.repeat(40),chainId:677,value:'0',data:'0x1234'}}});
  const response=await call('PUT');expect(response.status).toBe(409);expect((await response.json()).error).toContain('payload mismatch');expect(m.rpc).not.toHaveBeenCalled();
 });
 it('4001 with unchanged nonce releases only the pre-broadcast operation',async()=>{
  const r=await call('PATCH',{action:'cancel',cancellation:{code:4001}});expect(await r.json()).toEqual({phase:'CANCELLED',retrySafe:true});expect(m.rpc).toHaveBeenCalledWith('transition_reward_publication',expect.objectContaining({p_operation:'op',p_phase:'CANCELLED',p_retry_safe:true}));
 });
 it('disconnect and provider timeout retain the batch lock',async()=>{
  for(const code of [4900,-32603]){expect(await (await call('PATCH',{action:'cancel',cancellation:{code}})).json()).toEqual({phase:'RECOVERY_REQUIRED',retrySafe:false});}
 });
 it('advanced pending nonce prevents cancellation release',async()=>{
  m.preflight.mockResolvedValue({epochAvailable:true,latest:42,pending:43,head:100n});expect((await (await call('PATCH',{action:'cancel',cancellation:{code:4001}})).json()).retrySafe).toBe(false);
 });
 it('hash-present cancellation cannot release pending transaction',async()=>{
  attempt.tx_hash=hash;expect((await (await call('PATCH',{action:'cancel',cancellation:{code:4001}})).json()).phase).toBe('BROADCAST_PENDING');expect(m.verify).toHaveBeenCalled();expect(m.rpc.mock.calls.some(c=>c[1].p_retry_safe)).toBe(false);
 });
 it('wrong sender nonce stays locked before receipt confirmation',async()=>{
  m.nonce.mockResolvedValue(false);expect((await call('POST',{txHash:hash})).status).toBe(409);expect(m.verify).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
 });
 it('read-only recovered hash confirms through canonical verification',async()=>{
  m.recover.mockResolvedValue(hash);m.verify.mockResolvedValue({phase:'CONFIRMED_VERIFIED',blockHash:root,blockNumber:'101'});expect((await (await call('PATCH',{action:'recover'})).json()).phase).toBe('CONFIRMED_VERIFIED');expect(m.rpc).toHaveBeenCalledWith('confirm_reward_publication',expect.objectContaining({p_hash:hash,p_block:101}));
 });
 it('exact revert permits retry only with reconciled latest and pending nonce',async()=>{
  m.verify.mockResolvedValue({phase:'REVERTED',checks:[]});expect((await (await call('POST',{txHash:hash})).json()).retrySafe).toBe(true);m.preflight.mockResolvedValue({epochAvailable:true,latest:43,pending:44});expect((await (await call('POST',{txHash:hash})).json()).retrySafe).toBe(false);
 });
});