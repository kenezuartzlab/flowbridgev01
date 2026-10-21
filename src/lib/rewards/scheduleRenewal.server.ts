import type { AdminContext } from '@/lib/admin/adminGate.server';
import type { RenewalProposal } from './scheduleRenewal';
type Admin = Awaited<typeof import('@/integrations/supabase/client.server')>['supabaseAdmin'];
type Batch = { id: string; fingerprint: string; claim_start: number; claim_end: number };

/** The original remains immutable; an approved overlay is the only active schedule. */
export async function resolveBatchSchedule<T extends Batch>(admin: Admin, batch: T): Promise<T> {
  const { data, error } = await admin.from('reward_schedule_renewals').select('fingerprint,claim_start,claim_end').eq('batch_id', batch.id).eq('status','APPROVED').maybeSingle();
  if (error) throw new Error('Schedule authorization unavailable');
  return data ? { ...batch, fingerprint:data.fingerprint, claim_start:Number(data.claim_start), claim_end:Number(data.claim_end) } : batch;
}

export async function recordRenewalProposal(admin: Admin, proposal: RenewalProposal, actor: AdminContext) {
  if (!proposal.ready) throw new Error('Renewal blocked by fresh eligibility');
  const {data:evidence,error:evidenceError}=await admin.rpc('reward_payout_evidence_hash');
  if(evidenceError || !evidence) throw new Error('Funding evidence unavailable');
  const {error}=await admin.from('reward_schedule_renewals').upsert({batch_id:proposal.originalBatchId,original_fingerprint:proposal.originalFingerprint,fingerprint:proposal.fingerprint,claim_start:proposal.claimStart,claim_end:proposal.claimEnd,min_publish_delay:proposal.claimStart-proposal.signBefore,evidence_hash:evidence,proposed_by:actor.userId},{onConflict:'fingerprint',ignoreDuplicates:true});
  if(error) throw new Error('Renewal proposal unavailable');
  const {data:stored,error:readError}=await admin.from('reward_schedule_renewals').select('id,fingerprint,status').eq('fingerprint',proposal.fingerprint).single();
  if(readError || !stored) throw new Error('Renewal proposal not recorded');
  return stored;
}

export async function approveRenewal(actor: AdminContext, id: string, fingerprint: string) {
  if(actor.role!=='super_admin') throw new Error('Super-admin approval required');
  const {supabaseAdmin:admin}=await import('@/integrations/supabase/client.server');
  const {buildRewardSolvencyReport}=await import('./rewardSolvency.server');
  const before=await admin.rpc('reward_payout_evidence_hash');
  if(before.error || !before.data) throw new Error('Funding evidence unavailable');
  const report=await buildRewardSolvencyReport();
  const after=await admin.rpc('reward_payout_evidence_hash');
  if(after.error || after.data!==before.data) throw new Error('Eligibility changed during validation; re-check');
  const p=report.settlement.renewal;
  if(!p?.ready || p.fingerprint!==fingerprint) throw new Error('Proposal changed or expired. Re-check and review the current schedule.');
  const {data:proposal,error}=await admin.from('reward_schedule_renewals').select('*').eq('id',id).eq('fingerprint',fingerprint).single();
  if(error || !proposal || proposal.batch_id!==p.originalBatchId || proposal.evidence_hash!==before.data) throw new Error('Review the current renewal proposal first');
  const {readChainState}=await import('./settlement.server');
  const live=await readChainState();
  if(!live || live.paused || live.epochCount!==p.epochId-1 || p.claimStart<live.nowSec+live.minPublishDelay) throw new Error('Contract timing changed; re-check');
  const {data:approved,error:approvalError}=await admin.rpc('approve_reward_schedule',{p_id:id,p_actor:actor.userId,p_email:actor.email,p_wallet:actor.wallet,p_evidence:proposal.evidence_hash,p_now:live.nowSec,p_delay:live.minPublishDelay});
  if(approvalError) throw new Error('Renewal was not applied. Funding evidence or publication state changed; re-check.');
  return {ok:true,applied:approved};
}