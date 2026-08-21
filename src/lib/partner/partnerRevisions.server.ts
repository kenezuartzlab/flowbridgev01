/**
 * FlowBridge V14.1 — SERVER-ONLY submission revision store.
 *
 * SUBMIT freezes an immutable snapshot row. Review acts on that snapshot, and
 * PUBLISH materializes exactly that snapshot into the single canonical execution
 * model (campaigns + campaign_tasks). Nothing here touches verified_activities,
 * campaign_completions, campaign_points_ledger, FLOW Points V2 or staking.
 *
 * Every function takes an explicit `db` client so the lifecycle can be exercised
 * end-to-end in tests without a live connection.
 */
import {
  PTS_LIMITS,
  materializationPlan,
  snapshotFingerprint,
  validateSubmission,
  type CampaignRevisionRecord,
  type CampaignRevisionSnapshot,
  type RevisionStatus,
  type RevisionTask,
} from './partnerRevision';
import { PartnerError } from './partnerGate.server';

export type Db = any;

export async function adminDb(): Promise<Db> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return supabaseAdmin;
}

const REVISION_COLUMNS =
  'revision_id,campaign_id,organization_id,revision,status,snapshot,fingerprint,submitted_at,reviewed_at,review_note,published_at';

const toMs = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);

function mapRevision(row: any): CampaignRevisionRecord {
  return {
    revisionId: row.revision_id,
    campaignId: row.campaign_id,
    organizationId: row.organization_id,
    revision: Number(row.revision ?? 1),
    status: row.status as RevisionStatus,
    fingerprint: row.fingerprint,
    snapshot: row.snapshot as CampaignRevisionSnapshot,
    submittedAt: toMs(row.submitted_at),
    reviewedAt: row.reviewed_at ? toMs(row.reviewed_at) : null,
    reviewNote: row.review_note ?? null,
    publishedAt: row.published_at ? toMs(row.published_at) : null,
  };
}

/* --------------------------------- reads ---------------------------------- */

export async function listRevisions(
  db: Db,
  campaignId: string,
): Promise<CampaignRevisionRecord[]> {
  const { data, error } = await db
    .from('campaign_submission_revisions')
    .select(REVISION_COLUMNS)
    .eq('campaign_id', campaignId)
    .order('revision', { ascending: false });
  if (error) throw new PartnerError(error.message, 500);
  return (data ?? []).map(mapRevision);
}

/** The revision a reviewer should act on: the newest non-superseded submission. */
export async function activeRevision(
  db: Db,
  campaignId: string,
): Promise<CampaignRevisionRecord | null> {
  const all = await listRevisions(db, campaignId);
  return (
    all.find((r) => r.status === 'submitted') ??
    all.find((r) => r.status === 'approved') ??
    all[0] ??
    null
  );
}

export async function latestPublishedRevision(
  db: Db,
  campaignId: string,
): Promise<CampaignRevisionRecord | null> {
  const all = await listRevisions(db, campaignId);
  return all.find((r) => r.status === 'published') ?? null;
}

/** Queue for the internal reviewer surface, newest submission first. */
export async function listReviewQueue(db: Db, limit = 100): Promise<CampaignRevisionRecord[]> {
  const { data, error } = await db
    .from('campaign_submission_revisions')
    .select(REVISION_COLUMNS)
    .in('status', ['submitted', 'approved'])
    .order('submitted_at', { ascending: false })
    .limit(limit);
  if (error) throw new PartnerError(error.message, 500);
  return (data ?? []).map(mapRevision);
}

/* -------------------------------- freezing -------------------------------- */

export interface FreezeInput {
  campaignId: string;
  organizationId: string;
  orgSlug: string;
  orgName: string;
  submittedBy: string | null;
  slug: string;
  name: string;
  description?: string | null;
  startsAt: number;
  endsAt: number;
  rewardType: CampaignRevisionSnapshot['rewardType'];
  ptsBudget: number;
  tasks: RevisionTask[];
}

/** Abuse control: bounded submissions per organization per rolling hour. */
async function assertSubmissionRate(db: Db, organizationId: string) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from('campaign_submission_revisions')
    .select('revision_id')
    .eq('organization_id', organizationId)
    .gte('submitted_at', since);
  if (error) throw new PartnerError(error.message, 500);
  if ((data ?? []).length >= PTS_LIMITS.maxSubmissionsPerHour) {
    throw new PartnerError(
      'Too many submissions from this organization in the last hour. Try again shortly.',
      429,
    );
  }
}

/**
 * Freezes the current draft as revision N+1 and supersedes any earlier
 * outstanding submission. The returned snapshot is the review contract.
 */
export async function freezeSubmission(
  db: Db,
  input: FreezeInput,
): Promise<CampaignRevisionRecord> {
  await assertSubmissionRate(db, input.organizationId);

  const existing = await listRevisions(db, input.campaignId);
  const revision = (existing[0]?.revision ?? 0) + 1;

  const snapshot: CampaignRevisionSnapshot = {
    campaignId: input.campaignId,
    organizationId: input.organizationId,
    orgSlug: input.orgSlug,
    orgName: input.orgName,
    revision,
    slug: input.slug,
    name: input.name,
    description: input.description ?? null,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    rewardType: input.rewardType,
    ptsBudget: input.ptsBudget,
    tasks: input.tasks,
  };

  const errors = validateSubmission(snapshot);
  if (errors.length) throw new PartnerError(errors.join(' '), 400);

  const outstanding = existing.filter((r) => r.status === 'submitted' || r.status === 'approved');
  for (const row of outstanding) {
    const { error } = await db
      .from('campaign_submission_revisions')
      .update({ status: 'superseded' })
      .eq('revision_id', row.revisionId);
    if (error) throw new PartnerError(error.message, 500);
  }

  const { data, error } = await db
    .from('campaign_submission_revisions')
    .insert({
      campaign_id: input.campaignId,
      organization_id: input.organizationId,
      revision,
      status: 'submitted',
      snapshot: snapshot as any,
      fingerprint: snapshotFingerprint(snapshot),
      submitted_by: input.submittedBy,
    })
    .select(REVISION_COLUMNS)
    .maybeSingle();
  if (error) throw new PartnerError(error.message, 500);
  if (!data) throw new PartnerError('Submission could not be frozen.', 500);
  return mapRevision(data);
}

/* --------------------------- review state changes -------------------------- */

export async function markRevision(
  db: Db,
  revisionId: string,
  status: RevisionStatus,
  opts: { reviewerId?: string | null; note?: string | null } = {},
): Promise<void> {
  const patch: Record<string, unknown> = {
    status,
    reviewed_at: new Date().toISOString(),
    reviewed_by: opts.reviewerId ?? null,
  };
  if (opts.note !== undefined) patch.review_note = opts.note;
  if (status === 'published') patch.published_at = new Date().toISOString();
  const { error } = await db
    .from('campaign_submission_revisions')
    .update(patch)
    .eq('revision_id', revisionId);
  if (error) throw new PartnerError(error.message, 500);
}

/* ----------------------------- materialization ----------------------------- */

/**
 * Publishes exactly one approved snapshot into the canonical campaign engine.
 * Idempotent: republishing the same revision is a no-op beyond a status touch.
 */
export async function materializeRevision(
  db: Db,
  revision: CampaignRevisionRecord,
): Promise<{ published: boolean; taskCount: number }> {
  if (revision.status !== 'approved' && revision.status !== 'published') {
    throw new PartnerError('Only an approved revision can be published.', 409);
  }
  const plan = materializationPlan(revision.snapshot);

  const { data: live } = await db
    .from('campaigns')
    .select('campaign_id,published_revision_id,status')
    .eq('campaign_id', revision.campaignId)
    .maybeSingle();
  const alreadyLive =
    live?.published_revision_id === revision.revisionId && live?.status === 'published';

  const { error: campaignError } = await db
    .from('campaigns')
    .update({
      ...plan.campaign,
      published_revision_id: revision.revisionId,
      updated_at: new Date().toISOString(),
    })
    .eq('campaign_id', revision.campaignId)
    .eq('organization_id', revision.organizationId);
  if (campaignError) throw new PartnerError(campaignError.message, 500);

  const { error: taskError } = await db
    .from('campaign_tasks')
    .upsert(
      plan.tasks.map((t) => ({ ...t, rules: t.rules as any, updated_at: new Date().toISOString() })),
      { onConflict: 'campaign_id,task_id' },
    );
  if (taskError) throw new PartnerError(taskError.message, 500);

  // Remove tasks that the approved snapshot dropped, but never destroy evidence.
  const { data: liveTasks } = await db
    .from('campaign_tasks')
    .select('task_id')
    .eq('campaign_id', revision.campaignId);
  const stale = (liveTasks ?? [])
    .map((t: any) => t.task_id)
    .filter((id: string) => !plan.keepTaskIds.includes(id));
  if (stale.length) {
    const { data: used } = await db
      .from('campaign_completions')
      .select('task_id')
      .eq('campaign_id', revision.campaignId)
      .in('task_id', stale);
    const usedIds = new Set((used ?? []).map((u: any) => u.task_id));
    const removable = stale.filter((id: string) => !usedIds.has(id));
    if (removable.length) {
      await db
        .from('campaign_tasks')
        .delete()
        .eq('campaign_id', revision.campaignId)
        .in('task_id', removable);
    }
  }

  if (revision.status !== 'published') await markRevision(db, revision.revisionId, 'published');
  return { published: !alreadyLive, taskCount: plan.tasks.length };
}
