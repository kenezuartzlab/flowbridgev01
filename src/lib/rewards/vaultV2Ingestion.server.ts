import { decodeFunctionData, encodeFunctionData, keccak256, parseAbi, type Address, type Hex } from 'viem';
import { VAULT_V2_OWNER_EOA_EXCEPTION, VAULT_V2_APPROVED_IDENTITY, verifyVaultIdentity } from './vaultV2Identity';
const identityAbi=parseAbi(['function decimals() view returns(uint8)','function getOwners() view returns(address[])','function getThreshold() view returns(uint256)']);
import { VAULT_V2_ABI } from './vaultV2Abi.generated';
import { vaultClient, readVaultV2 } from './vaultV2Read';
import { verifyVaultCredit } from './vaultV2CreditVerification';
import { vaultFlowToken } from './vaultV2';

type Admin = Awaited<typeof import('@/integrations/supabase/client.server')>['supabaseAdmin'];
export type VaultCreditBatch = { batch_id: string; snapshot_hash: string; contract_address: string; publisher: string; source_ids: string[]; wallets: string[]; amounts_wei: string[]; total_wei: string | number; tx_hash: string | null };
export type CreditOutcome = { state: 'CONFIRMED' | 'PENDING' | 'REVERTED' | 'MISMATCH'; evidence?: Record<string, unknown>; blocker?: string };

/** No signer or send method: unknown/reverted/reorg outcomes never free source reservations. */
export async function observeVaultCredit(batch: VaultCreditBatch, hash: Hex, codeHash: Hex, c = vaultClient()): Promise<CreditOutcome> {
  if (batch.tx_hash && batch.tx_hash.toLowerCase() !== hash.toLowerCase()) return { state: 'MISMATCH' };
  if (await c.getChainId() !== 677) throw new Error('WRONG_RPC_CHAIN');
  let tx; let receipt;
  try { [tx,receipt] = await Promise.all([c.getTransaction({hash}),c.getTransactionReceipt({hash})]); }
  catch { return {state:'PENDING'}; }
  const contract=batch.contract_address as Address;
  const [block,head,code] = await Promise.all([c.getBlock({blockNumber:receipt.blockNumber}),c.getBlockNumber(),c.getCode({address:contract,blockNumber:receipt.blockNumber})]);
  if (head-receipt.blockNumber<2n || block.hash!==receipt.blockHash) return {state:'PENDING'};
  if (tx.hash!==hash || receipt.transactionHash!==hash || tx.blockHash!==receipt.blockHash || !code || code==='0x' || keccak256(code)!==codeHash) return {state:'MISMATCH'};
  const amounts=batch.amounts_wei.map(BigInt);
  const expected=encodeFunctionData({abi:VAULT_V2_ABI,functionName:'creditBatch',args:[batch.batch_id as Hex,batch.wallets as Address[],amounts]});
  if(tx.from.toLowerCase()!==batch.publisher.toLowerCase() || tx.to?.toLowerCase()!==contract.toLowerCase() || tx.input.toLowerCase()!==expected.toLowerCase() || tx.value!==0n) return {state:'MISMATCH'};
  // Exact failed call is known, but stays reserved; no automatic retry or replacement hash.
  if(receipt.status==='reverted') return {state:'REVERTED'};
  const at={address:contract,abi:VAULT_V2_ABI,blockNumber:receipt.blockNumber};
  const [processed,flow] = await Promise.all([c.readContract({...at,functionName:'processedBatch',args:[batch.batch_id as Hex]}),c.readContract({...at,functionName:'flow'})]);
  if(String(flow).toLowerCase()!==vaultFlowToken()?.toLowerCase()) return {state:'MISMATCH'};
  const valid=verifyVaultCredit({chainId:677,contract,publisher:batch.publisher as Address,batchId:batch.batch_id as Hex,wallets:batch.wallets as Address[],amounts,tx,receipt,canonicalBlockHash:block.hash as Hex,head,processed:Boolean(processed)});
  if(!valid) return {state:'MISMATCH'};
  // Re-read canonical block after all RPC evidence, not just before it.
  if((await c.getBlock({blockNumber:receipt.blockNumber})).hash!==receipt.blockHash) return {state:'PENDING'};
  const call=decodeFunctionData({abi:VAULT_V2_ABI,data:tx.input});
  return {state:'CONFIRMED',evidence:{verification:'EXACT_CANONICAL_CREDIT',chainId:677,contract,codeHash,publisher:batch.publisher,transactionHash:hash,blockNumber:receipt.blockNumber.toString(),blockHash:receipt.blockHash,headNumber:head.toString(),snapshotHash:batch.snapshot_hash,sourceIds:batch.source_ids,method:call.functionName,logs:receipt.logs.filter(l=>l.address.toLowerCase()===contract.toLowerCase()).map(l=>({address:l.address,data:l.data,topics:l.topics,logIndex:l.logIndex}))}};
}

export async function ingestVaultV2Credit(db: Admin, batchId: Hex, hash: Hex) {
  const [config,result] = await Promise.all([db.from('reward_vault_v2_config').select('*').maybeSingle(),db.from('reward_vault_v2_batches').select('*').eq('batch_id',batchId).maybeSingle()]);
  if(config.error||result.error||!config.data?.deployment_verified||!config.data.code_hash||!result.data) throw new Error('VERIFIED_STORED_BATCH_REQUIRED');
  const b=result.data;
  if(b.contract_address!==config.data.contract_address) throw new Error('DEPLOYMENT_CHANGED');
  const intent=await db.from('reward_vault_v2_signing_attempts').select('nonce,publisher,calldata,tx_hash').eq('batch_id',batchId).not('phase','in','(CANCELLED,REVERTED)').maybeSingle();
  if(intent.error)throw new Error('SIGNING_INTENT_UNAVAILABLE');
  if(intent.data){
    // Candidate hashes are never authoritative: resume_signing must first bind the exact on-chain identity.
    if(!intent.data.tx_hash)return {state:'PENDING' as const,blocker:'Resume signing verification first; candidate hashes are not authoritative.'};
    if(intent.data.tx_hash!==hash)throw new Error('SIGNING_NONCE_OR_PAYLOAD_MISMATCH');
    const tx=await vaultClient().getTransaction({hash}).catch(()=>null);
    if(!tx)return {state:'PENDING' as const};
    if(tx.nonce!==Number(intent.data.nonce)||tx.from.toLowerCase()!==intent.data.publisher||tx.input!==intent.data.calldata||tx.chainId!==677)throw new Error('SIGNING_NONCE_OR_PAYLOAD_MISMATCH');
  }
  const allocations=await db.from('reward_economic_award_allocations').select('ledger_id,economic_award_id,wallet,points').eq('vault_batch_id',batchId);
  if(allocations.error || allocations.data?.length!==b.source_ids.length || b.source_ids.some(id=>!allocations.data?.some(a=>a.ledger_id===id))) throw new Error('SOURCE_SNAPSHOT_MISMATCH');
  const sums=new Map<string,bigint>();
  for(const a of allocations.data??[]) sums.set(a.wallet,(sums.get(a.wallet)??0n)+BigInt(a.points)*10n**18n);
  if(b.wallets.some((w,i)=>sums.get(w)!==BigInt(b.amounts_wei[i]??'0')) || sums.size!==b.wallets.length) throw new Error('SOURCE_AMOUNTS_MISMATCH');
  const observed=await observeVaultCredit(b,hash,config.data.code_hash as Hex);
  if(observed.state!=='CONFIRMED' || !observed.evidence) return observed;
  const e=observed.evidence;
  const commit=await db.rpc('confirm_vault_v2_credit',{p_batch:batchId,p_hash:hash,p_snapshot:b.snapshot_hash,p_block:Number(e.blockNumber),p_block_hash:String(e.blockHash),p_head:Number(e.headNumber),p_evidence:e as never});
  if(commit.error) throw new Error('CREDIT_COMMIT_REQUIRES_RECONCILIATION');
  return {state:'CONFIRMED' as const,newlyConfirmed:commit.data};
}

/**
 * Read-only deployment evidence for the future explicitly authorized cutover. The expected runtime is
 * derived from the frozen artifact with all FLOW immutables patched; the code hash is computed from the
 * actual deployed code. Token runtime, Safe owners/threshold and publisher are all read at one canonical block.
 */
export async function verifiedVaultDeployment(address: Address, c = vaultClient()) {
  const A=VAULT_V2_APPROVED_IDENTITY;
  const chainId=await c.getChainId();
  if(chainId!==677) throw new Error('WRONG_RPC_CHAIN');
  const block=await c.getBlock();
  const at={blockNumber:block.number};
  const v=(functionName:'flow'|'owner'|'pendingOwner'|'publisher')=>c.readContract({address,abi:VAULT_V2_ABI,functionName,...at}) as Promise<string>;
  const [vaultCode,vaultFlow,vaultOwner,vaultPendingOwner,vaultPublisher]=await Promise.all([c.getCode({address,...at}),v('flow'),v('owner'),v('pendingOwner'),v('publisher')]);
  const isException=address.toLowerCase()===VAULT_V2_OWNER_EOA_EXCEPTION.vault&&vaultOwner.toLowerCase()===VAULT_V2_OWNER_EOA_EXCEPTION.owner;
  const [flowCode,flowDecimals,ownerCode,publisherCode,safeOwners,safeThreshold]=await Promise.all([
    c.getCode({address:A.flow as Address,...at}),
    c.readContract({address:A.flow as Address,abi:identityAbi,functionName:'decimals',...at}),
    c.getCode({address:vaultOwner as Address,...at}),
    c.getCode({address:vaultPublisher as Address,...at}),
    isException?Promise.resolve([] as readonly string[]):c.readContract({address:vaultOwner as Address,abi:identityAbi,functionName:'getOwners',...at}),
    isException?Promise.resolve(0n):c.readContract({address:vaultOwner as Address,abi:identityAbi,functionName:'getThreshold',...at}),
  ]);
  const after=await c.getBlock({blockNumber:block.number});
  const identity=verifyVaultIdentity({chainId,blockNumber:block.number,blockHash:block.hash as Hex,blockHashAfter:after.hash as Hex,vaultCode,flowCode,flowDecimals:Number(flowDecimals),vaultFlow,vaultOwner,vaultPendingOwner,vaultPublisher,ownerCode,publisherCode,safeOwners,safeThreshold,vaultAddress:address});
  const live=await readVaultV2(undefined,{enabled:false,chainId:677,address,codeHash:identity.codeHash,publisher:A.publisher as Address,cutoverVerified:false});
  if(!live || live.free<=0n || live.batchCap<=0n || live.dailyCap<live.batchCap) throw new Error('DEPLOYMENT_PREFUNDING_OR_CAPS_MISSING');
  if(identity.ownerException) return {verification:'FROZEN_RUNTIME_CANONICAL_TOKEN_OWNER_EOA_EXCEPTION',chainId:677,contract:address.toLowerCase(),codeHash:identity.codeHash,flow:identity.flow,owner:identity.owner,ownerSafeOwners:[] as string[],ownerSafeThreshold:'0',publisher:identity.publisher,identityBlockNumber:block.number.toString(),identityBlockHash:block.hash,freeWei:live.free.toString(),batchCapWei:live.batchCap.toString(),dailyCapWei:live.dailyCap.toString(),blockNumber:live.blockNumber.toString(),blockHash:live.blockHash};
  return {verification:'FROZEN_RUNTIME_CANONICAL_TOKEN_APPROVED_SAFE',chainId:677,contract:address.toLowerCase(),codeHash:identity.codeHash,flow:identity.flow,owner:identity.owner,ownerSafeOwners:[...A.ownerSafeOwners],ownerSafeThreshold:A.ownerSafeThreshold.toString(),publisher:identity.publisher,identityBlockNumber:block.number.toString(),identityBlockHash:block.hash,freeWei:live.free.toString(),batchCapWei:live.batchCap.toString(),dailyCapWei:live.dailyCap.toString(),blockNumber:live.blockNumber.toString(),blockHash:live.blockHash};
}
