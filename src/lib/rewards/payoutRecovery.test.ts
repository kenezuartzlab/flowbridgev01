import {beforeEach,describe,expect,it,vi} from 'vitest';
import {SETTLEMENT_SIGNER} from './settlementPlanner';
const m=vi.hoisted(()=>({from:vi.fn(),rpc:vi.fn(),verify:vi.fn(),nonce:vi.fn(),recover:vi.fn()}));
vi.mock('./scheduleRenewal.server',()=>({resolveBatchSchedule:async(_a:unknown,b:unknown)=>b}));
vi.mock('./publisherReconciliation.server',()=>({publicationClient:()=>({getBlockNumber:async()=>100n}),publicationNonceMatches:m.nonce,recoverPublisherHash:m.recover}));
vi.mock('./publicationRecovery.server',()=>({verifyPublicationOnChain:m.verify}));
import {reconcileDurablePublications} from './payoutRecovery.server';
const hash='0x'+'a'.repeat(64),block='0x'+'b'.repeat(64);
beforeEach(()=>{
 vi.resetAllMocks();const attempt={id:'attempt',operation_id:'op',operator_id:'actor',batch_id:'batch',root:block,fingerprint:'fingerprint',sender:SETTLEMENT_SIGNER.address,sender_nonce:42,tx_hash:null};
 const batch={id:'batch',epoch_id:3,root:block,fingerprint:'fingerprint',total_wei:'1122000000000000000000',claim_start:200000,claim_end:2792000,leaves:[]};
 m.from.mockImplementation((table:string)=>{const q={select:()=>q,eq:()=>q,neq:()=>q,limit:async()=>({data:[attempt]}),single:async()=>({data:batch})};return q;});
 m.rpc.mockResolvedValue({data:true});m.nonce.mockResolvedValue(true);m.recover.mockResolvedValue(hash);m.verify.mockResolvedValue({phase:'CONFIRMED_VERIFIED',blockHash:block,blockNumber:'101'});
});
describe('interrupted-session background reconciliation',()=>{
 it('mined but unrecorded publication recovers exact hash then uses atomic system confirmation',async()=>{const r=await reconcileDurablePublications({from:m.from,rpc:m.rpc} as never);expect(r).toEqual({confirmed:1,unresolved:0});expect(m.rpc).toHaveBeenCalledWith('reconcile_reward_publication',{p_attempt:'attempt',p_operation:'op',p_hash:hash,p_block_hash:block,p_block:101});});
 it('unknown broadcasts stay locked without writes or cancellation',async()=>{m.recover.mockResolvedValue(null);expect(await reconcileDurablePublications({from:m.from,rpc:m.rpc} as never)).toEqual({confirmed:0,unresolved:1});expect(m.rpc).not.toHaveBeenCalled();});
 it('wrong nonce never records a confirmation',async()=>{m.nonce.mockResolvedValue(false);await reconcileDurablePublications({from:m.from,rpc:m.rpc} as never);expect(m.verify).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();});
 it('delayed or reverted receipts never unlock through the background path',async()=>{for(const phase of ['BROADCAST_PENDING','REVERTED','CONFIRMED_MISMATCH']){m.verify.mockResolvedValue({phase});expect((await reconcileDurablePublications({from:m.from,rpc:m.rpc} as never)).unresolved).toBe(1);}expect(m.rpc).not.toHaveBeenCalled();});
});