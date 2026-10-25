import { assessRewardEvidence, type EvidenceRow, type ActivityEvidence, type ReservationEvidence } from './rewardEvidenceAssessment';
import { OWNER_REVIEW_DECISIONS } from './historicalReconciliation';
import { integerWei } from './immutableBatch';
/** Admin-only, SELECT-only. Metadata/recorded USD cannot authorize a historical transition. */
export async function readRewardEvidenceAssessment() {
  const { supabaseAdmin: admin } = await import('@/integrations/supabase/client.server');
  const [ledger, activities, profiles, reservations, batches] = await Promise.all([
    admin.from('flow_points_ledger').select('id,user_id,points,base_points,verified_usd,policy_version,chain_id,tx_hash,source_log_index,verified_activity_id,wallet_address,funding_state,reservation_id,provenance_state,day_key,metadata,created_at').in('reason',['CORE_SWAP','CORE_SWAP_V2']).eq('chain_id',677).gt('points',0).limit(5000),
    admin.from('verified_activities').select('activity_id,source_chain_id,source_tx_hash,source_log_index,user_wallet,status,kind,evidence_source,amount_raw,occurred_at').eq('source_chain_id',677).limit(10000),
    admin.from('profiles').select('id,wallet_address').limit(10000),
    admin.from('reward_reservations').select('reservation_id,ledger_id,user_id,wallet_address,points,program_id').limit(10000),
    admin.from('reward_settlement_batches').select('epoch_id,total_wei,leaves,publication_verified_at').eq('chain_id',677).limit(500),
  ]);
  if ([ledger,activities,profiles,reservations,batches].some(r=>r.error)) throw new Error('Authoritative evidence unavailable');
  if ((ledger.data?.length ?? 0)>=5000 || (activities.data?.length ?? 0)>=10000 || (profiles.data?.length ?? 0)>=10000 || (reservations.data?.length ?? 0)>=10000 || (batches.data?.length ?? 0)>=500) throw new Error('Evidence inventory exceeds safe read bounds');
  const rows = (ledger.data ?? []) as unknown as (EvidenceRow & {created_at:string})[];
  const activityMap = new Map((activities.data ?? []).map(a=>[a.activity_id,a as unknown as ActivityEvidence]));
  const wallets = new Map((profiles.data ?? []).map(p=>[p.id,p.wallet_address]));
  const reservationMap = new Map((reservations.data ?? []).map(r=>[r.reservation_id,r as ReservationEvidence]));
  const identities = new Map<string,number>(), days = new Map<string,number>();
  for (const r of rows) {
    const key = r.tx_hash?.toLowerCase() ?? r.id;
    identities.set(key,(identities.get(key) ?? 0)+1);
    const day = `${r.wallet_address?.toLowerCase()}|${r.day_key ?? r.created_at.slice(0,10)}`;
    days.set(day,(days.get(day) ?? 0)+r.points);
  }
  const round3 = (batches.data ?? []).find(b=>b.epoch_id===3);
  const roundWallets = new Set(Array.isArray(round3?.leaves) ? (round3.leaves as {account?:string}[]).map(l=>l.account?.toLowerCase()) : []);
  const assessed = rows.map(r=>{
    const activity = r.verified_activity_id ? activityMap.get(r.verified_activity_id) : undefined;
    const assessment = assessRewardEvidence(r,{ activity,boundWallet:wallets.get(r.user_id),reservation:r.reservation_id ? reservationMap.get(r.reservation_id) : undefined,duplicate:(identities.get(r.tx_hash?.toLowerCase() ?? r.id) ?? 0)>1,restricted:OWNER_REVIEW_DECISIONS.has(r.user_id),dailyPoints:days.get(`${r.wallet_address?.toLowerCase()}|${r.day_key ?? r.created_at.slice(0,10)}`) ?? r.points });
    return {row:r,activity,assessment};
  });
  const totals = (items:typeof assessed)=>items.reduce((o,x)=>{ const k=x.assessment.status; o[k] ??= {rows:0,points:0};o[k].rows++;o[k].points+=x.row.points;return o; },{} as Record<string,{rows:number;points:number}>);
  const roundHeld = assessed.filter(x=>x.row.funding_state==='FUNDED' && x.row.provenance_state==='PENDING' && roundWallets.has(x.row.wallet_address?.toLowerCase()));
  return { assessed, summary:totals(assessed), round3:{storedFlow:round3 ? Number(BigInt(integerWei(round3.total_wei))/10n**18n) : null,published:!!round3?.publication_verified_at,heldPoints:roundHeld.reduce((s,x)=>s+x.row.points,0),assessment:totals(roundHeld),readOnly:true} };
}