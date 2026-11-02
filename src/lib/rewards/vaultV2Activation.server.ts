import type { Address } from 'viem';
import { verifiedVaultDeployment } from './vaultV2Ingestion.server';
import type { AdminContext } from '@/lib/admin/adminGate.server';
/** Only the authenticated Super Admin's explicit future cutover command reaches this writer. */
export async function authorizeVaultCutover(actor: AdminContext, input: {address:Address;cutoverAt:string}) {
  if(actor.role!=='super_admin') throw new Error('SUPER_ADMIN_REQUIRED');
  if(!Number.isFinite(Date.parse(input.cutoverAt)) || Date.parse(input.cutoverAt)<=Date.now()) throw new Error('FUTURE_CUTOVER_REQUIRED');
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const state=await db.rpc('reward_payout_evidence_hash');
  // Code hash and publisher are derived from the frozen artifact and approved identity, never from input.
  const evidence=await verifiedVaultDeployment(input.address);
  if(state.error||!state.data) throw new Error('LEGACY_STATE_UNAVAILABLE');
  const committed=await db.rpc('authorize_vault_v2_cutover',{p_actor:actor.userId,p_wallet:actor.wallet,p_cutover:input.cutoverAt,p_contract:input.address.toLowerCase(),p_code:evidence.codeHash,p_publisher:evidence.publisher,p_batch_cap:evidence.batchCapWei as never,p_daily_cap:evidence.dailyCapWei as never,p_evidence:evidence as never,p_state_hash:state.data});
  if(committed.error) throw new Error('CUTOVER_AUTHORIZATION_REJECTED');
  return {authorized:committed.data,cutoverAt:input.cutoverAt};
}