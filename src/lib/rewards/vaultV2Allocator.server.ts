import { encodeFunctionData, type Address, type Hex } from 'viem';
import { canonicalVaultSnapshot, selectBoundedVaultSources, type CanonicalVaultSource } from './vaultV2Allocator';
import { readVaultV2 } from './vaultV2Read';
import { VAULT_V2_ABI } from './vaultV2Abi.generated';
import type { VaultAccountReconciliation } from './vaultV2Reconciliation.server';
type Admin = Awaited<typeof import('@/integrations/supabase/client.server')>['supabaseAdmin'];

/** One prepare call scans at most maxPages keyset pages; beyond that it returns a continuation, never "no eligible". */
export const VAULT_SOURCE_SCAN = { pageSize: 500, maxPages: 20 } as const;
export type VaultSourceRow = CanonicalVaultSource & { user_id: string };
export type VaultContinuation = { continuation: { after: string; scannedRows: number } };

const full = (rows: CanonicalVaultSource[], max: bigint) => {
  const s = selectBoundedVaultSources(rows, max);
  return s.length === 1000 || s.reduce((a, r) => a + BigInt(r.points) * 10n ** 18n, 0n) === max;
};

/**
 * Deterministic id-ordered keyset scan over canonical sources. Each page reconciles only its new candidate
 * accounts (full ledger history each) and keeps only reconciled-eligible rows, so excluded rows can never starve
 * later eligible ones. Stops once a bounded batch is full, the sources end, or the scan bound is reached.
 */
export async function scanEligibleVaultSources(db: Admin, maxWei: bigint, after: string | null = null, load?: (db: Admin, ids: string[]) => Promise<VaultAccountReconciliation[]>) {
  const reconcile = load ?? (await import('./vaultV2Reconciliation.server')).loadVaultAccountReconciliation;
  const recon = new Map<string, VaultAccountReconciliation>();
  const eligible: VaultSourceRow[] = [];
  let cursor = after, scanned = 0;
  for (let page = 0; page < VAULT_SOURCE_SCAN.maxPages; page++) {
    const r = await db.rpc('vault_v2_source_rows_scan', { p_after: cursor as never, p_ids: null as never, p_limit: VAULT_SOURCE_SCAN.pageSize });
    if (r.error || !Array.isArray(r.data)) throw new Error('CANONICAL_SOURCES_UNAVAILABLE');
    const rows = r.data as VaultSourceRow[];
    if (rows.some((x, i) => (i ? x.id <= rows[i - 1].id : !!cursor && x.id <= cursor))) throw new Error('NON_DETERMINISTIC_SOURCE_ORDER');
    scanned += rows.length;
    const missing = [...new Set(rows.filter(x => !['LEGACY_VERIFIED','OWNER_GOODWILL'].includes(x.program_id)).map(x => x.user_id))].filter(u => !recon.has(u));
    if (missing.length) for (const a of await reconcile(db, missing)) recon.set(a.userId, a);
    if (missing.some(u => !recon.has(u))) throw new Error('COMPLETE_RECONCILIATION_REQUIRED');
    for (const x of rows) {
      // SQL proves the explicit immutable legacy budget, exact partial amount and current binding.
      // Goodwill stays a distinct source; never promote the original ledger to VERIFIED.
      if (['LEGACY_VERIFIED','OWNER_GOODWILL'].includes(x.program_id) && x.policy_version === 'LEGACY_CARRYOVER_V2_20261108') { eligible.push(x); continue; }
      const a = recon.get(x.user_id);
      if (a && ['MATCH', 'EXPLAINED_DIFFERENCE'].includes(a.classification) && a.eligibleRowIds.includes(x.id) && a.wallet?.toLowerCase() === x.wallet.toLowerCase()) eligible.push(x);
    }
    if (rows.length < VAULT_SOURCE_SCAN.pageSize) return { eligible, recon, scanned, continuation: null };
    cursor = rows[rows.length - 1].id;
    if (full(eligible, maxWei)) return { eligible, recon, scanned, continuation: null };
  }
  return { eligible, recon, scanned, continuation: cursor };
}

/** Internal future-enabled writer. No browser chooses source IDs, amounts or verification facts. */
export async function reserveVaultV2Awards(db: Admin, after?: string) {
  const config=await db.from('reward_vault_v2_config').select('*').maybeSingle();
  const cfg=config.data;
  if(config.error||!cfg?.financial_enabled||!cfg.cutover_accepted||!cfg.deployment_verified||!cfg.cutover_at||!cfg.contract_address||!cfg.code_hash||!cfg.publisher) throw new Error('VAULT_V2_DISABLED_OR_UNAUTHORIZED');
  // A prepared batch is immutable. Later earning awards remain unreserved for the next batch.
  const previous=await db.from('reward_vault_v2_batches').select('*').neq('state','CREDITED').order('created_at').limit(1).maybeSingle();
  if(previous.error) throw new Error('BATCH_STATE_UNAVAILABLE');
  if(previous.data) return previous.data;
  const fence=await db.rpc('reward_payout_evidence_hash');
  if(fence.error||!fence.data) throw new Error('CANONICAL_SOURCES_UNAVAILABLE');
  const readLive=async()=>{
    const live=await readVaultV2(undefined,{enabled:true,chainId:677,address:cfg.contract_address as Address,codeHash:cfg.code_hash as Hex,publisher:cfg.publisher as Address,cutoverVerified:true});
    if(!live||live.paused||live.batchCap!==BigInt(cfg.batch_cap_wei)||live.dailyCap!==BigInt(cfg.daily_cap_wei)) throw new Error('LIVE_DEPLOYMENT_OR_CAP_MISMATCH');
    return {live,max:[live.free,live.batchCap,live.dailyRemaining].reduce((a,b)=>a<b?a:b)};
  };
  const scan=await scanEligibleVaultSources(db,(await readLive()).max,after??null);
  // Fresh canonical backing immediately before the atomic reservation (scan may take several pages).
  const {live,max}=await readLive();
  const selected=selectBoundedVaultSources(scan.eligible,max) as VaultSourceRow[];
  if(!selected.length) return scan.continuation?({continuation:{after:scan.continuation,scannedRows:scan.scanned}} satisfies VaultContinuation):null;
  const snapshot=canonicalVaultSnapshot(selected,cfg.cutover_at,live.free,live.batchCap,live.dailyRemaining);
  const users=new Set(selected.map(r=>r.user_id));
  const recon=[...scan.recon.values()].filter(a=>users.has(a.userId));
  const hash=await db.rpc('vault_v2_source_hash',{p_ids:snapshot.sourceIds});
  if(hash.error||!hash.data) throw new Error('SOURCE_HASH_UNAVAILABLE');
  const reserved=await db.rpc('reserve_vault_v2_new_awards',{p_batch:snapshot.batchId,p_ids:snapshot.sourceIds,p_hash:hash.data,p_wallets:snapshot.wallets,p_amounts:snapshot.amounts.map(String),p_total:snapshot.total.toString() as never,p_evidence:fence.data,p_reconciliation:recon as never,p_free:live.free.toString() as never,p_observed:new Date().toISOString(),p_block:Number(live.blockNumber),p_block_hash:live.blockHash});
  if(reserved.error) throw new Error('ATOMIC_RESERVATION_REJECTED');
  return {batch_id:reserved.data,calldata:encodeFunctionData({abi:VAULT_V2_ABI,functionName:'creditBatch',args:[snapshot.batchId,snapshot.wallets,snapshot.amounts]}),publisher:cfg.publisher,contract_address:cfg.contract_address};
}
