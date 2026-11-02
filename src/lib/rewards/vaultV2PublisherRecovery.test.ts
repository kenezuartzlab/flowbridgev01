import {beforeEach,expect,it,vi,type Mock} from 'vitest';
import {publisherCalldata} from './vaultV2Publisher';
const m=vi.hoisted(()=>({client:vi.fn(),observe:vi.fn(),ingest:vi.fn()}));
vi.mock('./vaultV2Read',()=>({vaultClient:m.client,readVaultV2:vi.fn()}));
vi.mock('./vaultV2Ingestion.server',()=>({observeVaultCredit:m.observe,ingestVaultV2Credit:m.ingest}));
import {resumeVaultPublisher,cancelVaultPublisher,attachVaultPublisherHash} from './vaultV2Publisher.server';

const wallet='0x'+'1'.repeat(40),address='0x'+'2'.repeat(40),blockHash='0x'+'c'.repeat(64);
const exact=`0x${'b'.repeat(64)}` as const,wrong=`0x${'d'.repeat(64)}` as const,typo=`0x${'e'.repeat(64)}` as const;
const b={batch_id:'0x'+'a'.repeat(64),snapshot_hash:'source',contract_address:address,publisher:wallet,source_ids:['award'],wallets:[wallet],amounts_wei:['100'],total_wei:'100',state:'RESERVED',tx_hash:null};
const actor={userId:'actor',wallet,role:'internal_operator',email:'private'} as const;
const exactTx=()=>({hash:exact,from:wallet,to:address,input:publisherCalldata(b),value:0n,nonce:7,chainId:677});

type Cand={tx_hash:string;source:string;status:string};
let a:Record<string,unknown>;let cands:Cand[];let phases:string[];let txs:Map<string,unknown>;let scan:unknown[];let nonceAt:number;let processed:boolean;let blockHashes:string[];
let rpc:Record<string,Mock<(...args:unknown[])=>Promise<any>>>;
/** In-memory model of the journal/transition rules enforced in SQL. */
const rpcCall=vi.fn(async(name:string,args:Record<string,any>)=>{
  if(args.p_actor!==a.actor_user_id||args.p_wallet!==a.publisher)return {error:{message:'owner'}};
  if(name==='record_vault_v2_hash_candidate'){if(['CANCELLED','REVERTED','CREDITED'].includes(String(a.phase)))return {error:{message:'final'}};if(!cands.some(c=>c.tx_hash===args.p_hash))cands.push({tx_hash:args.p_hash,source:args.p_source,status:'CANDIDATE'});if(a.phase==='SIGNATURE')a.phase='UNKNOWN';return {data:'cid',error:null};}
  if(name==='reject_vault_v2_hash_candidate'){const c=cands.find(c=>c.tx_hash===args.p_hash&&c.status==='CANDIDATE');if(c){c.status='REJECTED';}return {data:!!c,error:null};}
  if(name==='transition_vault_v2_signing'){
    const {p_phase:phase,p_hash:hash,p_evidence:e}=args;phases.push(phase);
    if(phase==='UNKNOWN'&&(hash||a.tx_hash))return {error:{message:'hash'}};
    if(phase!=='UNKNOWN'&&a.tx_hash&&a.tx_hash!==hash)return {error:{message:'immutable'}};
    if(phase==='CANCELLED'&&(e.verification!=='CANONICAL_NONCE_CONSUMED_UNPROCESSED'||Number(e.confirmedNonce)<=Number(a.nonce)||e.processedBatch!=='false'))return {error:{message:'release'}};
    if(phase==='SUBMITTED'&&(e.verification!=='EXACT_TRANSACTION_IDENTITY'||!cands.some(c=>c.tx_hash===hash&&c.status!=='REJECTED')))return {error:{message:'identity'}};
    if(phase==='SUBMITTED'){cands.find(c=>c.tx_hash===hash)!.status='VERIFIED';}
    a.phase=phase;if(phase!=='UNKNOWN')a.tx_hash=hash;return {data:true,error:null};
  }
  return {error:{message:'unexpected'}};
});
const db={from:(name:string)=>{const chain:any={select:()=>chain,eq:()=>chain,order:async()=>({data:cands.filter(c=>c.status==='CANDIDATE'),error:null}),single:async()=>({data:name.includes('attempts')?{...a}:b,error:null}),maybeSingle:async()=>({data:{deployment_verified:true,code_hash:exact,contract_address:address},error:null})};return chain;},rpc:(n:string,args:Record<string,unknown>)=>rpcCall(n,args)};
const resume=(hash?:`0x${string}`)=>resumeVaultPublisher(db as never,actor,'op',hash);
beforeEach(()=>{
  vi.clearAllMocks();cands=[];phases=[];txs=new Map();scan=[];nonceAt=7;processed=false;blockHashes=[];
  a={operation_id:'op',batch_id:b.batch_id,actor_user_id:'actor',publisher:wallet,nonce:7,start_block:10,calldata:publisherCalldata(b),phase:'SIGNATURE',tx_hash:null};
  rpc={getChainId:vi.fn().mockResolvedValue(677),getBlockNumber:vi.fn().mockResolvedValue(100n),
    getBlock:vi.fn(async(q:any)=>q?.includeTransactions?{hash:blockHash,transactions:q.blockNumber===10n?scan:[]}:{hash:blockHashes.shift()??blockHash,transactions:[]}),
    getTransaction:vi.fn(async(q:any)=>{const t=txs.get(q.hash);if(!t)throw new Error('not found');return t;}),
    getTransactionReceipt:vi.fn().mockResolvedValue({blockNumber:10n,blockHash}),
    readContract:vi.fn(async()=>processed),getTransactionCount:vi.fn(async()=>nonceAt)};
  m.client.mockReturnValue(rpc);m.observe.mockResolvedValue({state:'PENDING'});m.ingest.mockResolvedValue({state:'CONFIRMED'});
});

// Fix B — dismissal is never proof of no broadcast.
it('wallet dismissal keeps the intent locked as UNKNOWN without reading nonce visibility',async()=>{const r=await cancelVaultPublisher(db as never,actor,'op');expect(r.state).toBe('UNKNOWN');expect(r.blocker).toContain('confirmation unresolved');expect(phases).toEqual(['UNKNOWN']);expect(rpc.getTransactionCount).not.toHaveBeenCalled();});
it('stable nonce never releases the intent, however often verification is resumed',async()=>{await cancelVaultPublisher(db as never,actor,'op');for(let i=0;i<3;i++)expect((await resume()).state).toBe('UNKNOWN');expect(phases).not.toContain('CANCELLED');expect(m.ingest).not.toHaveBeenCalled();});
it('delayed broadcast after attempted cancel is recovered once; nothing is resent',async()=>{await cancelVaultPublisher(db as never,actor,'op');expect((await resume()).state).toBe('UNKNOWN');scan=[exactTx()];txs.set(exact,exactTx());expect((await resume()).state).toBe('PENDING');expect(phases).toEqual(['UNKNOWN','SUBMITTED']);expect(a.tx_hash).toBe(exact);expect(cands).toEqual([{tx_hash:exact,source:'NONCE_SCAN',status:'VERIFIED'}]);});
it('release only after the nonce is canonically consumed and the batch is unprocessed',async()=>{nonceAt=8;const r=await resume();expect(r.state).toBe('RELEASED');expect(rpcCall).toHaveBeenCalledWith('transition_vault_v2_signing',expect.objectContaining({p_phase:'CANCELLED',p_evidence:expect.objectContaining({verification:'CANONICAL_NONCE_CONSUMED_UNPROCESSED',nonce:'7',confirmedNonce:'8',processedBatch:'false',blockNumber:'88'})}));expect(rpc.getTransactionCount).toHaveBeenCalledWith(expect.objectContaining({blockNumber:88n}));});
it('consumed nonce with a processed batch stays locked for reconciliation',async()=>{nonceAt=8;processed=true;expect((await resume()).state).toBe('MISMATCH');expect(phases).not.toContain('CANCELLED');});
it('reorg during nonce resolution never releases',async()=>{nonceAt=8;blockHashes=['0x'+'1'.repeat(64),'0x'+'2'.repeat(64)];expect((await resume()).state).toBe('PENDING');expect(phases).not.toContain('CANCELLED');});

// Fix C — candidate hashes.
it('wallet-returned hash is journaled as an unverified candidate only',async()=>{expect((await attachVaultPublisherHash(db as never,actor,'op',exact)).state).toBe('SUBMITTED_UNVERIFIED');expect(cands).toEqual([{tx_hash:exact,source:'WALLET_RETURNED',status:'CANDIDATE'}]);expect(a.tx_hash).toBeNull();expect(phases).toEqual([]);});
it('incorrect candidate is rejected, then the exact verified hash becomes authoritative',async()=>{txs.set(wrong,{...exactTx(),hash:wrong,from:'0x'+'9'.repeat(40),nonce:3});expect((await resume(wrong)).state).toBe('UNKNOWN');expect(cands[0].status).toBe('REJECTED');expect(a.tx_hash).toBeNull();txs.set(exact,exactTx());expect((await resume(exact)).state).toBe('PENDING');expect(a.tx_hash).toBe(exact);expect(cands.map(c=>c.status)).toEqual(['REJECTED','VERIFIED']);expect(m.ingest).not.toHaveBeenCalled();});
it('mistyped or not-visible candidate authorizes nothing and allows a later corrected hash',async()=>{expect((await resume(typo)).state).toBe('UNKNOWN');expect(cands[0].status).toBe('CANDIDATE');expect(phases).toEqual([]);txs.set(exact,exactTx());expect((await resume(exact)).state).toBe('PENDING');expect(a.tx_hash).toBe(exact);});
it('same signer and nonce with a different payload is a nonce conflict, never a submission',async()=>{txs.set(wrong,{...exactTx(),hash:wrong,input:'0x00'});const r=await resume(wrong);expect(r.state).toBe('UNKNOWN');expect(r.blocker).toContain('different transaction');expect(rpcCall).toHaveBeenCalledWith('reject_vault_v2_hash_candidate',expect.objectContaining({p_evidence:expect.objectContaining({verification:'NONCE_CONFLICT_DIFFERENT_PAYLOAD'})}));expect(phases).not.toContain('SUBMITTED');});
it('wrong chain candidate is rejected even with matching payload',async()=>{txs.set(wrong,{...exactTx(),hash:wrong,chainId:968});await resume(wrong);expect(cands[0].status).toBe('REJECTED');expect(a.tx_hash).toBeNull();});
it('nonce scan finding a different payload is a conflict, not an authorization',async()=>{scan=[{...exactTx(),input:'0x00'}];const r=await resume();expect(r.state).toBe('UNKNOWN');expect(phases).toEqual([]);});
it('refresh never changes an authoritative hash',async()=>{txs.set(exact,exactTx());await resume(exact);await expect(resume(wrong)).rejects.toThrow('immutable');expect(a.tx_hash).toBe(exact);expect((await resume(exact)).state).toBe('PENDING');});
it('reorg after verified submission stays submitted and never credits',async()=>{a.tx_hash=exact;a.phase='SUBMITTED';expect((await resume()).state).toBe('PENDING');expect(m.ingest).not.toHaveBeenCalled();expect(phases).toEqual([]);});
it('canonical successful receipt commits exactly through existing ingestion',async()=>{a.tx_hash=exact;a.phase='SUBMITTED';m.observe.mockResolvedValue({state:'CONFIRMED',evidence:{verification:'EXACT_CANONICAL_CREDIT'}});expect((await resume()).state).toBe('CONFIRMED');expect(m.ingest).toHaveBeenCalledWith(db,b.batch_id,exact);expect(phases).toEqual(['CREDITED']);});
it('confirmed revert retains awards but permits deliberate fresh review',async()=>{a.tx_hash=exact;a.phase='SUBMITTED';m.observe.mockResolvedValue({state:'REVERTED'});expect((await resume()).state).toBe('REVERTED');expect(m.ingest).not.toHaveBeenCalled();expect(phases).toEqual(['REVERTED']);});
it('unknown candidate never credits, releases or reaches ingestion',async()=>{m.observe.mockResolvedValue({state:'CONFIRMED',evidence:{}});await attachVaultPublisherHash(db as never,actor,'op',typo);expect((await resume()).state).toBe('UNKNOWN');expect(m.observe).not.toHaveBeenCalled();expect(m.ingest).not.toHaveBeenCalled();expect(phases).toEqual([]);});
it('another account cannot recover the publisher intent',async()=>{a.actor_user_id='other';await expect(resume()).rejects.toThrow('original');expect(m.ingest).not.toHaveBeenCalled();});
it('confirmed operation reload independently rechecks credit and never changes hash',async()=>{a.phase='CREDITED';a.tx_hash=exact;expect((await resume()).state).toBe('CONFIRMED');expect(phases).toEqual([]);expect(m.ingest).toHaveBeenCalledTimes(1);});
