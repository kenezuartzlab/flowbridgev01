import { encodeFunctionData, type Address, type Hex } from 'viem';
import { canonicalVaultSnapshot, type CanonicalVaultSource } from './vaultV2Allocator';
import { readVaultV2 } from './vaultV2Read';
import { VAULT_V2_ABI } from './vaultV2Abi.generated';
type Admin = Awaited<typeof import('@/integrations/supabase/client.server')>['supabaseAdmin'];

/** Internal future-enabled writer. No browser chooses source IDs, amounts or verification facts. */
export async function reserveVaultV2Awards(db: Admin) {
  const config=await db.from('reward_vault_v2_config').select('*').maybeSingle();
  const cfg=config.data;
  if(config.error||!cfg?.financial_enabled||!cfg.cutover_accepted||!cfg.deployment_verified||!cfg.cutover_at||!cfg.contract_address||!cfg.code_hash||!cfg.publisher) throw new Error('VAULT_V2_DISABLED_OR_UNAUTHORIZED');
  // A prepared batch is immutable. Later earning awards remain unreserved for the next batch.
  const previous=await db.from('reward_vault_v2_batches').select('*').neq('state','CREDITED').order('created_at').limit(1).maybeSingle();
  if(previous.error) throw new Error('BATCH_STATE_UNAVAILABLE');
  if(previous.data) return previous.data;
  const fence=await db.rpc('reward_payout_evidence_hash');
  const sources=await db.rpc('vault_v2_source_rows');
  if(fence.error||sources.error||!fence.data) throw new Error('CANONICAL_SOURCES_UNAVAILABLE');
  if(!sources.data?.length) return null;
  const {buildRewardSolvencyReport}=await import('./rewardSolvency.server');
  // canonical reconciliation without batch writes (the report carries private server facts separately).
  const {loadVaultAccountReconciliation}=await import('./vaultV2Reconciliation.server');
  const recon=await loadVaultAccountReconciliation(db);
  void buildRewardSolvencyReport; // never invoke settlement preparation from V2.
  const valid=sources.data.filter(r=>recon.some(a=>a.userId===r.user_id && a.eligibleRowIds.includes(r.id)));
  // SQL sources intentionally do not expose user IDs: reconcile by row membership.
  const rows=(valid.length?valid:sources.data.filter(r=>recon.some(a=>a.eligibleRowIds.includes(r.id) && ['MATCH','EXPLAINED_DIFFERENCE'].includes(a.classification)))) as CanonicalVaultSource[];
  if(!rows.length) return null;
  const live=await readVaultV2(undefined,{enabled:true,chainId:677,address:cfg.contract_address as Address,codeHash:cfg.code_hash as Hex,publisher:cfg.publisher as Address,cutoverVerified:true});
  if(!live||live.paused||live.batchCap!==BigInt(cfg.batch_cap_wei)||live.dailyCap!==BigInt(cfg.daily_cap_wei)) throw new Error('LIVE_DEPLOYMENT_OR_CAP_MISMATCH');
  const snapshot=canonicalVaultSnapshot(rows,cfg.cutover_at,live.free,live.batchCap,live.dailyCap);
  const hash=await db.rpc('vault_v2_source_hash',{p_ids:snapshot.sourceIds});
  if(hash.error||!hash.data) throw new Error('SOURCE_HASH_UNAVAILABLE');
  const reserved=await db.rpc('reserve_vault_v2_new_awards',{p_batch:snapshot.batchId,p_ids:snapshot.sourceIds,p_hash:hash.data,p_wallets:snapshot.wallets,p_amounts:snapshot.amounts.map(String),p_total:snapshot.total.toString() as never,p_evidence:fence.data,p_reconciliation:recon as never,p_free:live.free.toString() as never,p_observed:new Date().toISOString(),p_block:Number(live.blockNumber),p_block_hash:live.blockHash});
  if(reserved.error) throw new Error('ATOMIC_RESERVATION_REJECTED');
  return {batch_id:reserved.data,calldata:encodeFunctionData({abi:VAULT_V2_ABI,functionName:'creditBatch',args:[snapshot.batchId,snapshot.wallets,snapshot.amounts]}),publisher:cfg.publisher,contract_address:cfg.contract_address};
}