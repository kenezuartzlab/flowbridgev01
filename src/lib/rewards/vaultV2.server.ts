import { VAULT_V2_CONFIG, VAULT_V2_RELEASE } from './vaultV2';
import { type Address, type Hex } from 'viem';
import { readVaultV2 } from './vaultV2Read';

/** View-only. Never calls a reservation RPC, transfers Points or signs. */
export async function vaultV2OpsStatus() {
  const { supabaseAdmin:db } = await import('@/integrations/supabase/client.server');
  const [config,batches,allocations,budgets,attempts] = await Promise.all([
    db.from('reward_vault_v2_config').select('*').maybeSingle(),
    db.from('reward_vault_v2_batches').select('*').order('created_at',{ascending:false}).limit(20),
    db.from('reward_economic_award_allocations').select('destination,points'),
    db.from('reward_budgets').select('program_id,funding_verified,status,total_points,reserved_points'),
    db.from('reward_vault_v2_signing_attempts').select('*').order('created_at',{ascending:false}).limit(50),
  ]);
  if(config.error||batches.error||allocations.error||budgets.error||attempts.error) throw new Error('Vault status unavailable');
  const cfg=config.data;
  const live=cfg?.contract_address && cfg.code_hash && cfg.publisher ? await readVaultV2(undefined,{enabled:false,chainId:677,address:cfg.contract_address as Address,codeHash:cfg.code_hash as Hex,publisher:cfg.publisher as Address,cutoverVerified:cfg.cutover_accepted}).catch(()=>null) : null;
  // Complete count/sum over every canonical source (no first-page truncation).
  const [sources,candidates]=await Promise.all([db.rpc('vault_v2_source_summary'),db.from('reward_vault_v2_hash_candidates').select('operation_id,tx_hash,source,status,created_at').order('created_at',{ascending:false}).limit(50)]);
  if(sources.error||candidates.error) throw new Error('Canonical source review unavailable');
  const summary=Array.isArray(sources.data)?sources.data[0]:sources.data;
  const blockers=[...(!live?['MAINNET_DEPLOYMENT_NOT_VERIFIED']:[]),...(!cfg?.cutover_accepted?['OWNER_FUTURE_CUTOVER_AUTHORIZATION_REQUIRED']:[]),...(!live || live.free<=0n?['VAULT_PREFUNDING_REQUIRED']:[]),...(!live || live.batchCap<=0n?['ADMIN_AUTHORIZED_LIMITS_REQUIRED']:[])];
  const enabled=Boolean(cfg?.financial_enabled&&cfg.deployment_verified&&cfg.cutover_accepted&&cfg.authorized_by&&live&&!live.paused&&live.batchCap>0n&&live.dailyCap>=live.batchCap);
  const carryover=await (await import('./legacyCarryover.server')).reviewLegacyCarryover(db);
  return {release:VAULT_V2_RELEASE,enabled,attempts:attempts.data??[],hashCandidates:candidates.data??[],configuration:config.data??{enabled:false,chain_id:677,contract_address:null,code_hash:null,cutover_at:null},live:live?Object.fromEntries(Object.entries(live).map(([k,v])=>[k,typeof v==='bigint'?v.toString():v])):null,
    carryover,batches:batches.data??[],programs:budgets.data??[],allocatedPoints:(allocations.data??[]).reduce((sum,r)=>sum+r.points,0),
    blockers,review:{scope:'NEW_POST_CUTOVER_AWARDS_ONLY',legacy:'All earlier awards and existing Merkle obligations remain V1; no historical mapping.',sourceCount:Number(summary?.source_count??0),sourcePoints:Number(summary?.source_points??0),cutoverAt:cfg?.cutover_at??null,destinationFence:'IMMUTABLE_EARNING_TIME',sourceProof:'CANONICAL_LEDGER_RESERVATION_BINDING_POLICY_AND_RECONCILIATION',activationSequence:['Owner deploys and prefunds; verifies governance and limits.','Super Admin authorizes a future new-award cutover.','Publisher signs one immutable creditBatch; credits appear after canonical receipt verification.']},
    creditAction:null,sourceConfig:VAULT_V2_CONFIG};
}