import { VAULT_V2_CONFIG, VAULT_V2_RELEASE } from './vaultV2';
import { readVaultV2 } from './vaultV2Read';

/** View-only. Never calls a reservation RPC, transfers Points or signs. */
export async function vaultV2OpsStatus() {
  const { supabaseAdmin:db } = await import('@/integrations/supabase/client.server');
  const [config,batches,allocations,budgets] = await Promise.all([
    db.from('reward_vault_v2_config').select('*').maybeSingle(),
    db.from('reward_vault_v2_batches').select('*').order('created_at',{ascending:false}).limit(20),
    db.from('reward_economic_award_allocations').select('destination,points'),
    db.from('reward_budgets').select('program_id,funding_verified,status,total_points,reserved_points'),
  ]);
  if(config.error||batches.error||allocations.error||budgets.error) throw new Error('Vault status unavailable');
  const live=await readVaultV2();
  return {release:VAULT_V2_RELEASE,enabled:false,configuration:config.data??{enabled:false,chain_id:677,contract_address:null,code_hash:null,cutover_at:null},live:live?Object.fromEntries(Object.entries(live).map(([k,v])=>[k,typeof v==='bigint'?v.toString():v])):null,
    batches:batches.data??[],programs:budgets.data??[],allocatedPoints:(allocations.data??[]).reduce((sum,r)=>sum+r.points,0),
    blockers:['MAINNET_DEPLOYMENT_NOT_VERIFIED','OWNER_FINANCIAL_AUTHORIZATION_REQUIRED','LEGACY_AWARD_CUTOVER_NOT_RECONCILED'],
    creditAction:null,sourceConfig:VAULT_V2_CONFIG};
}