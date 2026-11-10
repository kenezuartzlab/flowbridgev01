import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ snapshot: vi.fn() }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: {} }));
vi.mock('./settlement.server', () => ({ getPublishedRoundsCached:m.snapshot, DISTRIBUTOR:'0x'+'1'.repeat(40) }));
import { Route } from '@/routes/api/public/reward-rounds';
const handler = (Route.options as unknown as {server:{handlers:{GET:(a:{request:Request})=>Promise<Response>}}}).server.handlers.GET;
const wallet='0x'+'2'.repeat(40);
beforeEach(()=>{vi.resetAllMocks();});
it('invalid wallet cannot trigger discovery',async()=>{
  expect((await handler({request:new Request('https://flowbridge.space/api/public/reward-rounds?wallet=bad')})).status).toBe(400);
  expect(m.snapshot).not.toHaveBeenCalled();
});
it('unverified snapshots expose no claimability',async()=>{
  m.snapshot.mockResolvedValue({live:null,found:[]});
  expect((await handler({request:new Request(`https://flowbridge.space/api/public/reward-rounds?wallet=${wallet}`)})).status).toBe(503);
});
it('serves only matching verified leaves through the shared read-only snapshot',async()=>{
  m.snapshot.mockResolvedValue({live:{epochCount:4},found:[{verification:{complete:true},source:'BUILDER',batch:{epochId:4,root:'root',totalWei:'1',claimStart:1,claimEnd:2,leaves:[{account:wallet,index:0,amount:'1',proof:[]},{account:'0x'+'3'.repeat(40),amount:'7'}]}},{verification:{complete:false},batch:{leaves:[{account:wallet,amount:'100'}]}}]});
  const body=await (await handler({request:new Request(`https://flowbridge.space/api/public/reward-rounds?wallet=${wallet}`)})).json();
  expect(body.rounds).toHaveLength(1);expect(body.rounds[0].leaf.account).toBe(wallet);expect(body.rounds[0].leaf.amount).toBe('1');
});