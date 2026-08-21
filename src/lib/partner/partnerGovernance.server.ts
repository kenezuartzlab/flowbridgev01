/**
 * FlowBridge V14 — SERVER-ONLY internal governance for partner platform.
 *
 * Callers must already have passed `requireAdmin` (bearer token + app_admins +
 * bound wallet). This module scopes what each internal role may do and writes an
 * immutable audit event for every privileged action.
 */
import type { AdminContext } from '@/lib/admin/adminGate.server';
import { PartnerError } from './partnerGate.server';
import { recordReviewEvent } from './partnerStudio.server';
import { diffSnapshots, maxPtsPerWallet, validateSubmission } from './partnerRevision';
import { activeRevision, markRevision, materializeRevision } from './partnerRevisions.server';
import {
  canTransition,
  findTransition,
  rewardTypeBlocksPublish,
  type CampaignReviewState,
  type CampaignRewardType,
  type LifecycleActor,
  type PartnerOrg,
  type PartnerOrgStatus,
} from './partnerTypes';

async function db() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return supabaseAdmin;
}

const toMs = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);

const actorOf = (admin: AdminContext): LifecycleActor =>
  admin.role === 'super_admin' ? 'super_admin' : 'internal';

/** Super-admin-only actions. Operators are scoped to review/moderation. */
const SUPER_ADMIN_ONLY = new Set(['verify_org', 'reject_org', 'suspend_org', 'reinstate_org']);

export async function writeAuditEvent(input: {
  admin: AdminContext;
  objectType: string;
  objectId: string;
  action: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
}) {
  const supabase = await db();
  await supabase.from('admin_audit_events').insert({
    actor_user_id: input.admin.userId,
    actor_email: input.admin.email,
    actor_role: input.admin.role,
    object_type: input.objectType,
    object_id: input.objectId,
    action: input.action,
    old_value: (input.oldValue ?? null) as any,
    new_value: (input.newValue ?? null) as any,
    reason: input.reason ?? null,
  });
}

export interface GovernanceOrgRow extends PartnerOrg {
  memberCount: number;
  campaignCount: number;
  liveCount: number;
  pendingReviewCount: number;
}

export async function listPartnerOrganizations(): Promise<GovernanceOrgRow[]> {
  const supabase = await db();
  const { data: orgs, error } = await supabase
    .from('partner_organizations')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new PartnerError(error.message, 500);
  const [{ data: members }, { data: campaigns }] = await Promise.all([
    supabase.from('partner_org_members').select('org_id'),
    supabase.from('campaigns').select('organization_id,review_state'),
  ]);
  return (orgs ?? []).map((o) => {
    const own = (campaigns ?? []).filter((c) => c.organization_id === o.org_id);
    return {
      orgId: o.org_id,
      slug: o.slug,
      name: o.name,
      website: o.website,
      description: o.description,
      status: o.status as PartnerOrgStatus,
      isSystem: !!o.is_system,
      riskNotes: o.risk_notes,
      createdAt: toMs(o.created_at),
      memberCount: (members ?? []).filter((m) => m.org_id === o.org_id).length,
      campaignCount: own.length,
      liveCount: own.filter((c) => c.review_state === 'published').length,
      pendingReviewCount: own.filter((c) => c.review_state === 'submitted').length,
    };
  });
}

export interface GovernanceCampaignRow {
  campaignId: string;
  organizationId: string;
  orgName: string;
  orgStatus: PartnerOrgStatus;
  isSystemOrg: boolean;
  slug: string;
  name: string;
  description?: string | null;
  reviewState: CampaignReviewState;
  rewardType: CampaignRewardType;
  published: boolean;
  startsAt: number;
  endsAt: number;
  revision: number;
  reviewNote?: string | null;
  submittedAt?: number | null;
  totalPoints: number;
  taskCount: number;
  completionCount: number;
  rewardBlockReason: string | null;
  ruleSummary: string[];
  /** Declared Campaign PTS issuance bound. */
  ptsBudget: number;
  /** Worst-case PTS a single wallet could earn under the pending snapshot. */
  maxPtsPerWallet: number;
  publishedRevision?: number | null;
  /** The frozen submission a reviewer is acting on, if any. */
  pendingRevision?: {
    revisionId: string;
    revision: number;
    status: string;
    fingerprint: string;
    submittedAt: number;
    changes: string[];
  } | null;
}

export async function listGovernanceCampaigns(): Promise<GovernanceCampaignRow[]> {
  const supabase = await db();
  const { data: rows, error } = await supabase
    .from('campaigns')
    .select(
      'campaign_id,organization_id,slug,name,description,status,review_state,reward_type,starts_at,ends_at,submitted_at,review_note,revision,pts_budget,published_revision,partner_organizations(name,status,is_system)',
    )
    .order('submitted_at', { ascending: false, nullsFirst: false });
  if (error) throw new PartnerError(error.message, 500);
  const ids = (rows ?? []).map((r) => r.campaign_id);
  if (!ids.length) return [];
  const [{ data: tasks }, { data: completions }, { data: revisionRows }] = await Promise.all([
    supabase.from('campaign_tasks').select('campaign_id,title,points,rules').in('campaign_id', ids),
    supabase.from('campaign_completions').select('campaign_id').in('campaign_id', ids),
    supabase
      .from('campaign_submission_revisions')
      .select('revision_id,campaign_id,revision,status,fingerprint,snapshot,submitted_at')
      .in('campaign_id', ids)
      .order('revision', { ascending: false }),
  ]);

  return (rows ?? []).map((r: any) => {
    const revisions = ((revisionRows ?? []) as any[]).filter((v) => v.campaign_id === r.campaign_id);
    const pending =
      revisions.find((v) => v.status === 'submitted') ??
      revisions.find((v) => v.status === 'approved') ??
      null;
    const previous = pending
      ? revisions.find((v) => v.revision < pending.revision && v.status !== 'withdrawn')
      : null;
    const own = (tasks ?? []).filter((t) => t.campaign_id === r.campaign_id);
    const reward = (r.reward_type ?? 'campaign_pts') as CampaignRewardType;
    return {
      campaignId: r.campaign_id,
      organizationId: r.organization_id,
      orgName: r.partner_organizations?.name ?? 'FlowBridge',
      orgStatus: (r.partner_organizations?.status ?? 'verified') as PartnerOrgStatus,
      isSystemOrg: !!r.partner_organizations?.is_system,
      slug: r.slug,
      name: r.name,
      description: r.description,
      reviewState: r.review_state as CampaignReviewState,
      rewardType: reward,
      published: r.status === 'published',
      startsAt: toMs(r.starts_at),
      endsAt: toMs(r.ends_at),
      revision: Number(r.revision ?? 1),
      reviewNote: r.review_note,
      submittedAt: r.submitted_at ? toMs(r.submitted_at) : null,
      taskCount: own.length,
      totalPoints: own.reduce((sum, t) => sum + Number(t.points ?? 0), 0),
      completionCount: (completions ?? []).filter((c) => c.campaign_id === r.campaign_id).length,
      rewardBlockReason: rewardTypeBlocksPublish(reward),
      ruleSummary: own.flatMap((t: any) =>
        (Array.isArray(t.rules) ? t.rules : []).map(
          (rule: any) => `${t.title}: ${rule?.type ?? 'RULE'}`,
        ),
      ),
      ptsBudget: Number(r.pts_budget ?? 0),
      maxPtsPerWallet: pending?.snapshot ? maxPtsPerWallet(pending.snapshot.tasks ?? []) : 0,
      publishedRevision: r.published_revision ?? null,
      pendingRevision: pending
        ? {
            revisionId: pending.revision_id,
            revision: Number(pending.revision),
            status: pending.status,
            fingerprint: pending.fingerprint,
            submittedAt: toMs(pending.submitted_at),
            changes: diffSnapshots(previous?.snapshot ?? null, pending.snapshot),
          }
        : null,
    };
  });
}

/** Internal review / publish actions. Fails closed on reward authority. */
export async function governanceCampaignAction(
  admin: AdminContext,
  campaignId: string,
  action: 'approve' | 'request_changes' | 'publish' | 'pause' | 'end',
  note?: string | null,
): Promise<GovernanceCampaignRow> {
  const supabase = await db();
  const { data: row, error } = await supabase
    .from('campaigns')
    .select('campaign_id,organization_id,review_state,reward_type,status,revision')
    .eq('campaign_id', campaignId.toLowerCase())
    .maybeSingle();
  if (error) throw new PartnerError(error.message, 500);
  if (!row) throw new PartnerError('Campaign not found.', 404);

  const from = row.review_state as CampaignReviewState;
  const actor = actorOf(admin);
  if (!canTransition(action, from, actor)) {
    throw new PartnerError(`Your role cannot ${action} a campaign in state "${from}".`, 403);
  }

  const reward = (row.reward_type ?? 'campaign_pts') as CampaignRewardType;
  if (action === 'approve' || action === 'publish') {
    const blocked = rewardTypeBlocksPublish(reward);
    if (blocked) throw new PartnerError(blocked, 403);
  }

  const transition = findTransition(action, from)!;
  const cleanNote = note?.trim() ? note.trim().slice(0, 1000) : null;
  const patch: Record<string, unknown> = {
    review_state: transition.to,
    reviewed_at: new Date().toISOString(),
    reviewed_by: admin.userId,
    review_note: cleanNote,
    updated_at: new Date().toISOString(),
  };
  if (transition.publishes) patch.status = 'published';
  if (transition.unpublishes) patch.status = transition.to === 'ended' ? 'archived' : 'draft';

  // Partner-originated campaigns are governed through their frozen submission.
  // Internal (system-org) campaigns authored in /sets have no snapshot and keep
  // the legacy direct path.
  const pending = await activeRevision(supabase, row.campaign_id);

  if (action === 'request_changes' && pending && pending.status !== 'published') {
    await markRevision(supabase, pending.revisionId, 'changes_requested', {
      reviewerId: admin.userId,
      note: cleanNote,
    });
  }

  if (action === 'approve') {
    if (pending) {
      if (pending.status !== 'submitted') {
        throw new PartnerError('There is no outstanding submission to approve.', 409);
      }
      // Re-validate the frozen content at approval time; nothing is trusted.
      const errors = validateSubmission(pending.snapshot);
      if (errors.length) throw new PartnerError(`Submission fails policy: ${errors.join(' ')}`, 409);
      await markRevision(supabase, pending.revisionId, 'approved', {
        reviewerId: admin.userId,
        note: cleanNote,
      });
    }
  }

  if (action === 'publish' && pending) {
    if (pending.status !== 'approved' && pending.status !== 'published') {
      throw new PartnerError('Approve the submitted revision before publishing it.', 409);
    }
    // Materialize exactly the approved snapshot into the canonical engine.
    await materializeRevision(supabase, { ...pending, status: 'approved' });
    patch.published_revision = pending.snapshot.revision;
    patch.published_revision_id = pending.revisionId;
  }

  const { error: updateError } = await supabase
    .from('campaigns')
    .update(patch as never)
    .eq('campaign_id', row.campaign_id);
  if (updateError) throw new PartnerError(updateError.message, 500);

  await recordReviewEvent({
    campaignId: row.campaign_id,
    organizationId: row.organization_id,
    actorUserId: admin.userId,
    actorRole: admin.role,
    action,
    fromState: from,
    toState: transition.to,
    note: note ?? null,
    revision: Number(row.revision ?? 1),
  });
  await writeAuditEvent({
    admin,
    objectType: 'campaign',
    objectId: row.campaign_id,
    action,
    oldValue: { review_state: from, status: row.status },
    newValue: { review_state: transition.to, status: patch.status ?? row.status },
    reason: note ?? null,
  });

  const all = await listGovernanceCampaigns();
  const updated = all.find((c) => c.campaignId === row.campaign_id);
  if (!updated) throw new PartnerError('Campaign not found after update.', 500);
  return updated;
}

/** Super-admin-only organization governance. */
export async function governanceOrgAction(
  admin: AdminContext,
  orgId: string,
  action: 'verify_org' | 'reject_org' | 'suspend_org' | 'reinstate_org',
  note?: string | null,
): Promise<GovernanceOrgRow> {
  if (SUPER_ADMIN_ONLY.has(action) && admin.role !== 'super_admin') {
    throw new PartnerError('Only a Super Admin may change partner verification or suspension.', 403);
  }
  const supabase = await db();
  const { data: org, error } = await supabase
    .from('partner_organizations')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw new PartnerError(error.message, 500);
  if (!org) throw new PartnerError('Organization not found.', 404);
  if (org.is_system) throw new PartnerError('The FlowBridge system organization is immutable.', 403);

  const next: PartnerOrgStatus =
    action === 'verify_org'
      ? 'verified'
      : action === 'reject_org'
        ? 'rejected'
        : action === 'suspend_org'
          ? 'suspended'
          : 'verified';

  const { error: updateError } = await supabase
    .from('partner_organizations')
    .update({
      status: next,
      risk_notes: note?.trim() ? note.trim().slice(0, 1000) : org.risk_notes,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', orgId);
  if (updateError) throw new PartnerError(updateError.message, 500);

  // Suspension fails closed: live campaigns are paused, evidence is retained.
  if (next === 'suspended') {
    await supabase
      .from('campaigns')
      .update({ review_state: 'paused', status: 'draft', updated_at: new Date().toISOString() })
      .eq('organization_id', orgId)
      .eq('review_state', 'published');
  }

  await writeAuditEvent({
    admin,
    objectType: 'partner_organization',
    objectId: orgId,
    action,
    oldValue: { status: org.status },
    newValue: { status: next },
    reason: note ?? null,
  });

  const all = await listPartnerOrganizations();
  const updated = all.find((o) => o.orgId === orgId);
  if (!updated) throw new PartnerError('Organization not found after update.', 500);
  return updated;
}

export interface AuditEventRow {
  eventId: string;
  actorEmail?: string | null;
  actorRole: string;
  objectType: string;
  objectId: string;
  action: string;
  reason?: string | null;
  createdAt: number;
}

export async function listAuditEvents(limit = 60): Promise<AuditEventRow[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from('admin_audit_events')
    .select('event_id,actor_email,actor_role,object_type,object_id,action,reason,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new PartnerError(error.message, 500);
  return (data ?? []).map((r) => ({
    eventId: r.event_id,
    actorEmail: r.actor_email,
    actorRole: r.actor_role,
    objectType: r.object_type,
    objectId: r.object_id,
    action: r.action,
    reason: r.reason,
    createdAt: toMs(r.created_at),
  }));
}
