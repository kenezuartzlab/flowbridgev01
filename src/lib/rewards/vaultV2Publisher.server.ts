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
  const [hash,alloc,recon,live]=await Promise.all([
    db.rpc('vault_v2_source_hash',{p_ids:b.source_ids}),
    db.from('reward_economic_award_allocations').select('ledger_id,economic_award_id,user_id,wallet,points,destination').eq('vault_batch_id',batchId),
    import('./vaultV2Reconciliation.server').then(m=>m.loadVaultAccountReconciliation(db)),
    readVaultV2(undefined,{enabled:true,chainId:677,address:c.contract_address as Address,codeHash:c.code_hash as Hex,publisher:c.publisher as Address,cutoverVerified:true}),
  ]);
  if(hash.error||hash.data!==b.snapshot_hash||alloc.error||alloc.data?.length!==b.source_ids.length||!live||live.paused||live.batchCap!==BigInt(c.batch_cap_wei)||live.dailyCap!==BigInt(c.daily_cap_wei)||BigInt(b.total_wei)>live.free||BigInt(b.total_wei)>live.batchCap||BigInt(b.total_wei)>live.dailyRemaining)throw new Error('Batch source, pause, backing or authorized cap changed.');
  const sums=new Map<string,bigint>();
  for(const a of alloc.data??[]) {
    if(a.destination!=='VAULT_V2'||!b.source_ids.includes(a.ledger_id)||!recon.some(r=>r.userId===a.user_id&&r.wallet?.toLowerCase()===a.wallet&&['MATCH','EXPLAINED_DIFFERENCE'].includes(r.classification)&&r.eligibleRowIds.includes(a.ledger_id)))throw new Error('Award identity, fence or reconciliation changed.');
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
export async function resumeVaultPublisher(db:DB,actor:AdminContext,id:string,manualHash?:Hex) {
  const {a,b,c}=await operation(db,actor,id);const rpc=vaultClient();
  if(await rpc.getChainId()!==677)throw new Error('Wrong RPC chain.');
  let hash=(a.tx_hash??manualHash) as Hex|undefined;
  if(a.tx_hash&&manualHash&&a.tx_hash!==manualHash)throw new Error('Original transaction hash is immutable.');
  if(!hash) {
    const head=await rpc.getBlockNumber();
    // Bounded canonical scan; older gaps need explicit hash, never resend on timeout.
    const floor=BigInt(a.start_block),end=head<floor+127n?head:floor+127n;
    for(let n=floor;n<=end;n++) {
      const block=await rpc.getBlock({blockNumber:n,includeTransactions:true});
      const tx=block.transactions.find(t=>typeof t!=='string'&&t.from.toLowerCase()===a.publisher&&t.nonce===Number(a.nonce));
      if(tx&&typeof tx!=='string') {if(!matchesPublisherTransaction(tx,a as PublisherIntent,b))throw new Error('Publisher nonce used by a different transaction; no resend.');hash=tx.hash;break;}
    }
  }
  if(!hash)return {state:'UNKNOWN',blocker:'Submission unknown. Resume later or reconcile the wallet transaction hash. Never resend.'};
  let tx;try{tx=await rpc.getTransaction({hash});}catch{return {state:'PENDING',blocker:'Transaction not yet visible. Reservation retained.'};}
  if(!matchesPublisherTransaction(tx,a as PublisherIntent,b))throw new Error('Hash does not match the original publisher nonce and immutable batch.');
  await transition(db,actor,id,'SUBMITTED',hash,{verification:'EXACT_TRANSACTION_IDENTITY',nonce:String(a.nonce)});
  const observed=await observeVaultCredit({...b,tx_hash:hash},hash,c.code_hash as Hex,rpc);
  if(observed.state==='REVERTED') {
    // observe already proved exact identity and canonical confirmed receipt.
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
export async function cancelVaultPublisher(db:DB,actor:AdminContext,id:string) {
  const {a}=await operation(db,actor,id);if(a.tx_hash)throw new Error('Submitted transactions cannot be cancelled here.');
  const rpc=vaultClient();const [nonce,pending]=await Promise.all([rpc.getTransactionCount({address:a.publisher as Address,blockTag:'latest'}),rpc.getTransactionCount({address:a.publisher as Address,blockTag:'pending'})]);
  if(nonce!==Number(a.nonce)||pending!==nonce)throw new Error('Nonce changed. Resume verification, never resend.');
  await transition(db,actor,id,'CANCELLED',null,{verification:'EXPLICIT_4001_NO_SEND',nonce:String(nonce)});
  return {state:'CANCELLED'};
}
/** Store the returned hash immediately; RPC visibility is NOT required for journaling. */
export async function attachVaultPublisherHash(db:DB,actor:AdminContext,id:string,hash:Hex) {
  await operation(db,actor,id);await transition(db,actor,id,'SUBMITTED',hash,{verification:'WALLET_RETURNED_HASH_UNVERIFIED'});return {state:'SUBMITTED'};
}
