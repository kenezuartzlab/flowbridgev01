import type { Address } from 'viem';
import { verifiedVaultDeployment } from './vaultV2Ingestion.server';
import { compareVaultSettings, type VaultSettingsInput } from './vaultV2Settings';
import type { AdminContext } from '@/lib/admin/adminGate.server';

type Db = Awaited<typeof import('@/integrations/supabase/client.server')>['supabaseAdmin'];

/** Latest Super Admin owner/publisher approval synced from live chain for this vault, if any. */
async function latestApproval(db: Db, address: string) {
  const r = await db.from('reward_vault_v2_identity_approvals').select('owner,publisher').eq('contract_address', address.toLowerCase()).order('id', { ascending: false }).limit(1).maybeSingle();
  if (r.error) throw new Error('APPROVALS_UNAVAILABLE');
  return r.data;
}

/** Only the authenticated Super Admin's explicit future cutover command reaches this writer. */
export async function authorizeVaultCutover(actor: AdminContext, input: {address:Address;cutoverAt:string}) {
  if(actor.role!=='super_admin') throw new Error('SUPER_ADMIN_REQUIRED');
  if(!Number.isFinite(Date.parse(input.cutoverAt)) || Date.parse(input.cutoverAt)<=Date.now()) throw new Error('FUTURE_CUTOVER_REQUIRED');
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const state=await db.rpc('reward_payout_evidence_hash');
  // Code hash and publisher are derived from the frozen artifact and approved identity, never from input.
  const evidence=await verifiedVaultDeployment(input.address,undefined,await latestApproval(db,input.address));
  if(state.error||!state.data) throw new Error('LEGACY_STATE_UNAVAILABLE');
  const committed=await db.rpc('authorize_vault_v2_cutover',{p_actor:actor.userId,p_wallet:actor.wallet,p_cutover:input.cutoverAt,p_contract:input.address.toLowerCase(),p_code:evidence.codeHash,p_publisher:evidence.publisher,p_batch_cap:evidence.batchCapWei as never,p_daily_cap:evidence.dailyCapWei as never,p_evidence:evidence as never,p_state_hash:state.data});
  if(committed.error) throw new Error('CUTOVER_AUTHORIZATION_REJECTED');
  return {authorized:committed.data,cutoverAt:input.cutoverAt};
}

/**
 * Super Admin settings update: the entered owner, publisher and limits must equal live on-chain state
 * of the frozen vault exactly. Nothing is signed or sent; on any mismatch nothing is saved.
 */
export async function syncVaultSettings(actor: AdminContext, input: VaultSettingsInput) {
  if(actor.role!=='super_admin') throw new Error('SUPER_ADMIN_REQUIRED');
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const evidence=await verifiedVaultDeployment(input.address,undefined,{owner:input.owner,publisher:input.publisher});
  const mismatches=compareVaultSettings(input,evidence);
  if(mismatches.length) return {saved:false as const,mismatches};
  const r=await db.rpc('sync_vault_v2_settings',{p_actor:actor.userId,p_wallet:actor.wallet,p_contract:evidence.contract,p_owner:evidence.owner,p_publisher:evidence.publisher,p_batch_cap:evidence.batchCapWei as never,p_daily_cap:evidence.dailyCapWei as never,p_evidence:evidence as never});
  if(r.error) throw new Error(r.error.message.includes('open batches')?'Resolve open batches before changing the publisher.':'Settings could not be saved. Nothing changed.');
  return {saved:true as const,mismatches:[] as string[]};
}
