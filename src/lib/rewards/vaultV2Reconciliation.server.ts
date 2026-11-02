import { reconcileAll, OWNER_REVIEW_DECISIONS, type ReconLedgerRow } from './historicalReconciliation';
type Admin = Awaited<typeof import('@/integrations/supabase/client.server')>['supabaseAdmin'];
export async function loadVaultAccountReconciliation(db: Admin) {
  const [profiles,ledger]=await Promise.all([db.from('profiles').select('id,created_at,flow_points,points_self,points_referral_signup,wallet_address').limit(10000),db.from('flow_points_ledger').select('*').limit(50000)]);
  if(profiles.error||ledger.error||profiles.data?.length===10000||ledger.data?.length===50000) throw new Error('COMPLETE_RECONCILIATION_REQUIRED');
  const byUser=new Map<string,ReconLedgerRow[]>();
  for(const l of ledger.data??[]) {
    const md=(l.metadata??{}) as Record<string,unknown>;
    const row:ReconLedgerRow={id:l.id,reason:l.reason,points:l.points,chainId:l.chain_id,createdAt:l.created_at,evidenceKey:l.activity_key??(l.tx_hash?`${l.tx_hash.toLowerCase()}:${l.source_log_index??''}`:null),verifiedUsd:l.verified_usd==null?null:Number(l.verified_usd),dayKey:l.day_key,refereeId:typeof md.refereeId==='string'?md.refereeId:null,reservationId:l.reservation_id,fundingState:l.funding_state,provenanceState:l.provenance_state};
    byUser.set(l.user_id,[...(byUser.get(l.user_id)??[]),row]);
  }
  const accounts=(profiles.data??[]).map(p=>({userId:p.id,createdAt:p.created_at,storedFlowPoints:p.flow_points+(byUser.get(p.id)??[]).filter(r=>['SIGNUP_BONUS_REFEREE','REFERRAL_SIGNUP_BONUS'].includes(r.reason)).reduce((s,r)=>s+r.points,0),storedPointsSelf:p.points_self,storedReferralSignup:p.points_referral_signup,ledger:byUser.get(p.id)??[]}));
  return reconcileAll(accounts,OWNER_REVIEW_DECISIONS).results.map(r=>({userId:r.userId,classification:r.classification,eligibleRowIds:r.eligibleRowIds,wallet:profiles.data?.find(p=>p.id===r.userId)?.wallet_address??null}));
}