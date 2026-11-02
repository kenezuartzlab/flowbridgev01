import {createFileRoute} from '@tanstack/react-router';
export const Route=createFileRoute('/api/rewards/vault-v2')({server:{handlers:{GET:async({request})=>{
  const {getAuthUser,jsonResponse,unauthorized}=await import('@/lib/api-auth.server');
  const user=await getAuthUser(request);if(!user)return unauthorized();
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const config=await db.from('reward_vault_v2_config').select('*').maybeSingle();
  if(config.error)return jsonResponse({error:'Vault configuration unavailable'},503);
  const cfg=config.data;
  if(!cfg?.financial_enabled||!cfg.cutover_accepted||!cfg.deployment_verified||!cfg.contract_address||!cfg.code_hash||!cfg.publisher)return jsonResponse({enabled:false});
  return jsonResponse({enabled:true,chainId:677,address:cfg.contract_address,codeHash:cfg.code_hash,publisher:cfg.publisher,cutoverVerified:true});
}}}});