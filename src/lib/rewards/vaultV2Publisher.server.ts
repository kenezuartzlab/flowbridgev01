import { type Address, type Hex } from 'viem';
import type { AdminContext } from '@/lib/admin/adminGate.server';
import { publisherCalldata, matchesPublisherTransaction, type PublisherBatch, type PublisherIntent } from './vaultV2Publisher';
import { readVaultV2, vaultClient } from './vaultV2Read';
import { VAULT_V2_ABI } from './vaultV2Abi.generated';
import { ingestVaultV2Credit, observeVaultCredit } from './vaultV2Ingestion.server';
type DB=Awaited<typeof import('@/integrations/supabase/client.server')>['supabaseAdmin'];
export async function reviewVaultPublisher(db:DB,actor:AdminContext,batchId:Hex) {
  const [config,result]=await Promise.all([db.from('reward_vault_v2_config').select('*').maybeSingle(),db.from('reward_vault_v2_batches').select('*').eq('batch_id',batchId).maybeSingle()]);
  const c=config.data,b=result.data;
  if(config.error||result.error||!c?.financial_enabled||!c.deployment_verified||!c.cutover_accepted||!c.authorized_by||!c.cutover_at||Date.parse(c.cutover_at)>Date.now()||c.chain_id!==677||!c.contract_address||!c.code_hash||!c.publisher||!b||b.state==='CREDITED')throw new Error('V2 is disabled or deployment/cutover is unverified.');
  if(actor.wallet!==c.publisher||b.publisher!==c.publisher||b.contract_address!==c.contract_address)throw new Error('Only the bound on-chain publisher can sign this batch.');
  const calldata=publisherCalldata(b);
  const alloc=await db.from('reward_economic_award_allocations').select('ledger_id,economic_award_id,user_id,wallet,points,destination').eq('vault_batch_id',batchId);
  if(alloc.error)throw new Error('Batch source, pause, backing or authorized cap changed.');
  const [hash,recon,live,sources]=await Promise.all([
    db.rpc('vault_v2_source_hash',{p_ids:b.source_ids}),
    import('./vaultV2Reconciliation.server').then(m=>m.loadVaultAccountReconciliation(db,(alloc.data??[]).map(x=>x.user_id))),
    readVaultV2(undefined,{enabled:true,chainId:677,address:c.contract_address as Address,codeHash:c.code_hash as Hex,publisher:c.publisher as Address,cutoverVerified:true}),
    db.rpc('vault_v2_canonical_sources',{p_ids:b.source_ids,p_allocated:true}),
  ]);
  if(hash.error||hash.data!==b.snapshot_hash||alloc.error||alloc.data?.length!==b.source_ids.length||!live||live.paused||live.batchCap!==BigInt(c.batch_cap_wei)||live.dailyCap!==BigInt(c.daily_cap_wei)||BigInt(b.total_wei)>live.free||BigInt(b.total_wei)>live.batchCap||BigInt(b.total_wei)>live.dailyRemaining)throw new Error('Batch source, pause, backing or authorized cap changed.');
  const sums=new Map<string,bigint>();
  for(const a of alloc.data??[]) {
    const legacy=!sources.error&&Array.isArray(sources.data)&&sources.data.some(s=>s.id===a.ledger_id&&s.economic_award_id===a.economic_award_id&&s.points===a.points&&s.wallet===a.wallet&&s.user_id===a.user_id&&s.policy_version==='LEGACY_CARRYOVER_V2_20261108'&&['LEGACY_VERIFIED','OWNER_GOODWILL'].includes(s.program_id));
    if(a.destination!=='VAULT_V2'||!b.source_ids.includes(a.ledger_id)||(!legacy&&!recon.some(r=>r.userId===a.user_id&&r.wallet?.toLowerCase()===a.wallet&&['MATCH','EXPLAINED_DIFFERENCE'].includes(r.classification)&&r.eligibleRowIds.includes(a.ledger_id))))throw new Error('Award identity, fence or reconciliation changed.');
    sums.set(a.wallet,(sums.get(a.wallet)??0n)+BigInt(a.points)*10n**18n);
  }
  if(sums.size!==b.wallets.length||b.wallets.some((w,i)=>sums.get(w)!==BigInt(b.amounts_wei[i])))throw new Error('Immutable allocation changed.');
  const rpc=vaultClient();
  if(await rpc.readContract({address:c.contract_address as Address,abi:VAULT_V2_ABI,functionName:'processedBatch',args:[batchId]}))throw new Error('Batch already processed. Resume verification.');
  await rpc.simulateContract({address:c.contract_address as Address,abi:VAULT_V2_ABI,functionName:'creditBatch',args:[batchId,b.wallets as Address[],b.amounts_wei.map(BigInt)],account:actor.wallet as Address});
  const gas=await rpc.estimateContractGas({address:c.contract_address as Address,abi:VAULT_V2_ABI,functionName:'creditBatch',args:[batchId,b.wallets as Address[],b.amounts_wei.map(BigInt)],account:actor.wallet as Address});
  const gasPrice=await rpc.getGasPrice();
  return {batch:b,calldata,gas:gas.toString(),estimatedGasWei:(gas*gasPrice).toString(),liabilities:live.liabilities.toString(),free:live.free.toString(),daily:live.dailyRemaining.toString(),sourceHash:hash.data};
}
export async function acquireVaultPublisher(db:DB,actor:AdminContext,batchId:Hex) {
  const review=await reviewVaultPublisher(db,actor,batchId);const rpc=vaultClient();
  const [nonce,pending,start]=await Promise.all([rpc.getTransactionCount({address:actor.wallet as Address,blockTag:'latest'}),rpc.getTransactionCount({address:actor.wallet as Address,blockTag:'pending'}),rpc.getBlockNumber()]);
  if(nonce!==pending)throw new Error('Publisher has an unresolved transaction.');
  const op=await db.rpc('acquire_vault_v2_signing',{p_batch:batchId,p_actor:actor.userId,p_wallet:actor.wallet,p_nonce:nonce,p_start:Number(start),p_calldata:review.calldata,p_source_hash:review.sourceHash,p_free:review.free as never,p_daily:review.daily as never,p_observed:new Date().toISOString()});
  if(op.error||!op.data)throw new Error('Signing is locked. Resume existing verification.');
  const row=await db.from('reward_vault_v2_signing_attempts').select('*').eq('operation_id',op.data).single();if(row.error)throw new Error('Signing intent readback unavailable. Do not send.');
  return row.data;
}
async function operation(db:DB,actor:AdminContext,id:string) {
  const a=await db.from('reward_vault_v2_signing_attempts').select('*').eq('operation_id',id).single();
  if(a.error||a.data.actor_user_id!==actor.userId||a.data.publisher!==actor.wallet)throw new Error('Reconnect the original bound publisher account.');
  const [b,c]=await Promise.all([db.from('reward_vault_v2_batches').select('*').eq('batch_id',a.data.batch_id).single(),db.from('reward_vault_v2_config').select('*').maybeSingle()]);
  if(b.error||c.error||!c.data?.deployment_verified||!c.data.code_hash||b.data.contract_address!==c.data.contract_address||publisherCalldata(b.data)!==a.data.calldata)throw new Error('Stored deployment or intent mismatch.');
  return {a:a.data,b:b.data,c:c.data};
}
async function transition(db:DB,actor:AdminContext,id:string,phase:string,hash:string|null,evidence:Record<string,unknown>={}) {
  const r=await db.rpc('transition_vault_v2_signing',{p_operation:id,p_actor:actor.userId,p_wallet:actor.wallet,p_phase:phase,p_hash:hash as never,p_evidence:evidence as never});if(r.error)throw new Error('Recovery transition rejected; reservation retained.');
}
/** Blocks behind head at which a consumed publisher nonce is treated as canonically final. */
export const VAULT_NONCE_FINALITY = 12n;
const UNRESOLVED='Signature dismissed or submission not yet visible — confirmation unresolved. Resume verification later; never resend. The lock is released only after the original nonce is canonically consumed without crediting this batch.';
async function recordCandidate(db:DB,actor:AdminContext,id:string,hash:Hex,source:'WALLET_RETURNED'|'MANUAL'|'NONCE_SCAN') {
  const r=await db.rpc('record_vault_v2_hash_candidate',{p_operation:id,p_actor:actor.userId,p_wallet:actor.wallet,p_hash:hash.toLowerCase(),p_source:source});
  if(r.error)throw new Error('Candidate hash could not be journaled; reservation retained.');
}
async function rejectCandidate(db:DB,actor:AdminContext,id:string,hash:string,evidence:Record<string,unknown>) {
  const r=await db.rpc('reject_vault_v2_hash_candidate',{p_operation:id,p_actor:actor.userId,p_wallet:actor.wallet,p_hash:hash,p_evidence:evidence as never});
  if(r.error)throw new Error('Candidate rejection could not be journaled; reservation retained.');
}
/** Observe an authoritative (already identity-verified) hash; never sends. */
async function settle(db:DB,actor:AdminContext,id:string,a:PublisherIntent,b:PublisherBatch&{batch_id:string},codeHash:Hex,hash:Hex,rpc:ReturnType<typeof vaultClient>) {
  const observed=await observeVaultCredit({...b,tx_hash:hash} as never,hash,codeHash,rpc);
  if(observed.state==='REVERTED') {
    const receipt=await rpc.getTransactionReceipt({hash});
    if((await rpc.getBlock({blockNumber:receipt.blockNumber})).hash!==receipt.blockHash)return {state:'PENDING'};
    if(await rpc.readContract({address:b.contract_address as Address,abi:VAULT_V2_ABI,functionName:'processedBatch',args:[b.batch_id as Hex]}))return {state:'MISMATCH',blocker:'Processed batch requires reconciliation.'};
    await transition(db,actor,id,'REVERTED',hash,{verification:'EXACT_CANONICAL_REVERT',blockHash:receipt.blockHash,nonce:String(a.nonce)});
    return {state:'REVERTED',blocker:'Exact transaction reverted. Awards remain reserved; review fresh gates before another deliberate signature.'};
  }
  if(observed.state!=='CONFIRMED')return observed;
  const result=await ingestVaultV2Credit(db,b.batch_id as Hex,hash);
  if(result.state==='CONFIRMED')await transition(db,actor,id,'CREDITED',hash,observed.evidence);
  return result;
}
export async function resumeVaultPublisher(db:DB,actor:AdminContext,id:string,manualHash?:Hex) {
  const {a,b,c}=await operation(db,actor,id);const rpc=vaultClient();
  if(await rpc.getChainId()!==677)throw new Error('Wrong RPC chain.');
  if(a.phase==='CANCELLED')return {state:'RELEASED'};
  if(a.phase==='REVERTED')return {state:'REVERTED',blocker:'Confirmed revert. Reservation retained; review before another deliberate signature.'};
  if(a.phase==='CREDITED'&&a.tx_hash)return ingestVaultV2Credit(db,b.batch_id as Hex,a.tx_hash as Hex);
  const intent=a as PublisherIntent;
  if(a.tx_hash) {
    if(manualHash&&manualHash.toLowerCase()!==a.tx_hash)throw new Error('Authoritative transaction hash is immutable.');
    return settle(db,actor,id,intent,b,c.code_hash as Hex,a.tx_hash as Hex,rpc);
  }
  // Unverified hashes (wallet-returned or typed) are journaled candidates only.
  if(manualHash)await recordCandidate(db,actor,id,manualHash,'MANUAL');
  const list=await db.from('reward_vault_v2_hash_candidates').select('tx_hash,status').eq('operation_id',id).eq('status','CANDIDATE').order('created_at',{ascending:true});
  if(list.error)throw new Error('Candidate journal unavailable; reservation retained.');
  let verified:Hex|undefined;let conflict=false;
  for(const cand of list.data??[]) {
    const tx=await rpc.getTransaction({hash:cand.tx_hash as Hex}).catch(()=>null);
    if(!tx)continue; // not visible (yet, or mistyped): stays a candidate, authorizes nothing
    if(matchesPublisherTransaction(tx,intent,b)){verified=tx.hash;break;}
    const sameNonce=tx.from.toLowerCase()===a.publisher&&tx.nonce===Number(a.nonce);conflict||=sameNonce;
    await rejectCandidate(db,actor,id,cand.tx_hash,{verification:sameNonce?'NONCE_CONFLICT_DIFFERENT_PAYLOAD':'IDENTITY_MISMATCH',from:tx.from.toLowerCase(),nonce:String(tx.nonce),to:tx.to?.toLowerCase()??null,chainId:tx.chainId??null});
  }
  if(!verified) {
    const head=await rpc.getBlockNumber();
    // Bounded canonical scan; older gaps need an explicit hash, never a resend.
    const floor=BigInt(a.start_block),end=head<floor+127n?head:floor+127n;
    for(let n=floor;n<=end;n++) {
      const block=await rpc.getBlock({blockNumber:n,includeTransactions:true});
      const tx=block.transactions.find(t=>typeof t!=='string'&&t.from.toLowerCase()===a.publisher&&t.nonce===Number(a.nonce));
      if(tx&&typeof tx!=='string'){if(matchesPublisherTransaction(tx,intent,b)){await recordCandidate(db,actor,id,tx.hash,'NONCE_SCAN');verified=tx.hash;}else conflict=true;break;}
    }
  }
  if(verified) {
    await transition(db,actor,id,'SUBMITTED',verified.toLowerCase(),{verification:'EXACT_TRANSACTION_IDENTITY',nonce:String(a.nonce),chainId:677,publisher:a.publisher,contract:b.contract_address});
    return settle(db,actor,id,intent,b,c.code_hash as Hex,verified.toLowerCase() as Hex,rpc);
  }
  return resolveConsumedNonce(db,actor,id,intent,b,rpc,conflict);
}
/** Release only when the bound nonce is canonically consumed and the batch is unprocessed: the original can never be mined. */
async function resolveConsumedNonce(db:DB,actor:AdminContext,id:string,a:PublisherIntent,b:PublisherBatch,rpc:ReturnType<typeof vaultClient>,conflict:boolean) {
  const head=await rpc.getBlockNumber();
  if(head<VAULT_NONCE_FINALITY)return {state:'UNKNOWN',blocker:UNRESOLVED};
  const at=head-VAULT_NONCE_FINALITY;
  const block=await rpc.getBlock({blockNumber:at});
  const [confirmedNonce,processed]=await Promise.all([
    rpc.getTransactionCount({address:a.publisher as Address,blockNumber:at}),
    rpc.readContract({address:b.contract_address as Address,abi:VAULT_V2_ABI,functionName:'processedBatch',args:[b.batch_id as Hex],blockNumber:at}),
  ]);
  if((await rpc.getBlock({blockNumber:at})).hash!==block.hash)return {state:'PENDING',blocker:'Chain reorganized during verification. Reservation retained.'};
  if(confirmedNonce<=Number(a.nonce))return {state:'UNKNOWN',blocker:conflict?'The publisher nonce is used by a different transaction that is not yet final. Reservation retained; never resend.':UNRESOLVED};
  if(processed)return {state:'MISMATCH',blocker:'The batch is processed on chain. Supply the exact publisher transaction hash to reconcile; never resend.'};
  await transition(db,actor,id,'CANCELLED',null,{verification:'CANONICAL_NONCE_CONSUMED_UNPROCESSED',nonce:String(a.nonce),confirmedNonce:String(confirmedNonce),processedBatch:'false',blockNumber:at.toString(),blockHash:block.hash});
  return {state:'RELEASED',blocker:'The original nonce is consumed on chain without crediting this batch, so it can never be mined. Awards remain reserved; review fresh gates before any deliberate new signature.'};
}
/** Wallet rejection (4001) is NOT evidence of no broadcast: the intent stays locked as UNKNOWN. */
export async function cancelVaultPublisher(db:DB,actor:AdminContext,id:string) {
  const {a}=await operation(db,actor,id);if(a.tx_hash)throw new Error('Submitted transactions cannot be cancelled here.');
  if(a.phase==='SIGNATURE')await transition(db,actor,id,'UNKNOWN',null,{verification:'WALLET_REPORTED_REJECTION_UNRESOLVED',nonce:String(a.nonce)});
  return {state:'UNKNOWN',blocker:'Signature dismissed; confirmation unresolved — resume verification.'};
}
/** Journal the wallet-returned hash immediately as an unverified candidate; only exact on-chain identity binds it. */
export async function attachVaultPublisherHash(db:DB,actor:AdminContext,id:string,hash:Hex) {
  await operation(db,actor,id);await recordCandidate(db,actor,id,hash,'WALLET_RETURNED');return {state:'SUBMITTED_UNVERIFIED'};
}
