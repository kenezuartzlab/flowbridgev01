/**
 * FlowBridge V14 — SERVER-ONLY partner campaign writes.
 *
 * Reuses the existing campaign definition engine (campaigns / campaign_tasks)
 * so there is exactly ONE settlement path. This module never touches
 * verified_activities, campaign_completions, campaign_completion_activities,
 * campaign_points_ledger, FLOW Points V2 or any staking/reward contract state.
 *
 * Guarantees:
 *  - organization_id is always taken from the authenticated membership context;
 *  - a partner may only read/write campaigns already owned by that org;
 *  - the public `status` column (what Explore reads) is only ever set by an
 *    internal governance action, never by a partner request;
 *  - non Campaign-PTS reward types fail closed.
 */
import { validateStudioCampaign, newCampaignId } from '@/lib/campaign/campaignStudio';
import type { StudioCampaignInput } from '@/lib/campaign/campaignStudio';
import { PartnerError, type PartnerContext } from './partnerGate.server';
import {
  PARTNER_EDITABLE_STATES,
  canSubmit,
  canTransition,
  findTransition,
  isRewardTypePartnerConfigurable,
  rewardTypeBlocksPublish,
  type CampaignRewardType,
  type CampaignReviewEvent,
  type CampaignReviewState,
  type LifecycleActor,
  type PartnerCampaignSummary,
} from './partnerTypes';

const CAMPAIGN_COLUMNS =
  'campaign_id,organization_id,slug,name,description,status,review_state,reward_type,starts_at,ends_at,updated_at,submitted_at,review_note,revision';

async function db() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return supabaseAdmin;
}

const toMs = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);
const toIso = (ms: number) => new Date(ms).toISOString();

function rewardType(raw: unknown): CampaignRewardType {
  return raw === 'flow_points_bonus' || raw === 'flow_token'
    ? (raw as CampaignRewardType)
    : 'campaign_pts';
}

async function summarize(rows: any[]): Promise<PartnerCampaignSummary[]> {
  if (!rows.length) return [];
  const supabase = await db();
  const ids = rows.map((r) => r.campaign_id);
  const [{ data: tasks }, { data: completions }] = await Promise.all([
    supabase.from('campaign_tasks').select('campaign_id,points').in('campaign_id', ids),
    supabase.from('campaign_completions').select('campaign_id').in('campaign_id', ids),
  ]);
  return rows.map((r) => {
    const own = (tasks ?? []).filter((t) => t.campaign_id === r.campaign_id);
    return {
      campaignId: r.campaign_id,
      organizationId: r.organization_id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      reviewState: r.review_state as CampaignReviewState,
      rewardType: rewardType(r.reward_type),
      published: r.status === 'published',
      startsAt: toMs(r.starts_at),
      endsAt: toMs(r.ends_at),
      revision: Number(r.revision ?? 1),
      reviewNote: r.review_note ?? null,
      submittedAt: r.submitted_at ? toMs(r.submitted_at) : null,
      updatedAt: r.updated_at ? toMs(r.updated_at) : undefined,
      completionCount: (completions ?? []).filter((c) => c.campaign_id === r.campaign_id).length,
      taskCount: own.length,
      totalPoints: own.reduce((sum, t) => sum + Number(t.points ?? 0), 0),
    };
  });
}

/** Own-org campaigns only. */
export async function listPartnerCampaigns(
  partner: PartnerContext,
): Promise<PartnerCampaignSummary[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from('campaigns')
    .select(CAMPAIGN_COLUMNS)
    .eq('organization_id', partner.orgId)
    .order('updated_at', { ascending: false });
  if (error) throw new PartnerError(error.message, 500);
  return summarize(data ?? []);
}

/** Full editable definition for ONE own-org campaign. */
export async function getPartnerCampaign(partner: PartnerContext, campaignId: string) {
  const supabase = await db();
  const { data, error } = await supabase
    .from('campaigns')
    .select(CAMPAIGN_COLUMNS)
    .eq('campaign_id', campaignId)
    .eq('organization_id', partner.orgId)
    .maybeSingle();
  if (error) throw new PartnerError(error.message, 500);
  if (!data) throw new PartnerError('Campaign not found.', 404);

  const { data: tasks, error: taskError } = await supabase
    .from('campaign_tasks')
    .select(
      'task_id,title,description,points,required_count,completion_limit_per_wallet,rules,sort_order',
    )
    .eq('campaign_id', campaignId)
    .order('sort_order', { ascending: true });
  if (taskError) throw new PartnerError(taskError.message, 500);

  const [summary] = await summarize([data]);
  return {
    summary,
    definition: {
      campaignId: data.campaign_id,
      slug: data.slug,
      name: data.name,
      description: data.description,
      status: 'draft' as const,
      startsAt: toMs(data.starts_at),
      endsAt: toMs(data.ends_at),
      tasks: (tasks ?? []).map((t) => ({
        taskId: t.task_id,
        title: t.title,
        description: t.description,
        points: Number(t.points),
        requiredCount: Number(t.required_count),
        completionLimitPerWallet: Number(t.completion_limit_per_wallet),
        rules: Array.isArray(t.rules) ? (t.rules as unknown[]) : [],
        sortOrder: Number(t.sort_order),
      })),
    } satisfies StudioCampaignInput,
    reviewEvents: await listReviewEvents(campaignId),
  };
}

export async function listReviewEvents(campaignId: string): Promise<CampaignReviewEvent[]> {
  const supabase = await db();
  const { data, error } = await supabase
    .from('campaign_review_events')
    .select('event_id,campaign_id,actor_role,action,from_state,to_state,note,revision,created_at')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false });
  if (error) throw new PartnerError(error.message, 500);
  return (data ?? []).map((r) => ({
    eventId: r.event_id,
    campaignId: r.campaign_id,
    actorRole: r.actor_role,
    action: r.action,
    fromState: r.from_state as CampaignReviewState | null,
    toState: r.to_state as CampaignReviewState | null,
    note: r.note,
    revision: Number(r.revision ?? 1),
    createdAt: toMs(r.created_at),
  }));
}

export async function recordReviewEvent(input: {
  campaignId: string;
  organizationId: string;
  actorUserId: string | null;
  actorRole: string;
  action: string;
  fromState?: CampaignReviewState | null;
  toState?: CampaignReviewState | null;
  note?: string | null;
  revision?: number;
}) {
  const supabase = await db();
  await supabase.from('campaign_review_events').insert({
    campaign_id: input.campaignId,
    organization_id: input.organizationId,
    actor_user_id: input.actorUserId,
    actor_role: input.actorRole,
    action: input.action,
    from_state: input.fromState ?? null,
    to_state: input.toState ?? null,
    note: input.note ?? null,
    revision: input.revision ?? 1,
  });
}

function normalizeInput(raw: any): StudioCampaignInput & { rewardType: CampaignRewardType } {
  if (!raw || typeof raw !== 'object') throw new PartnerError('Invalid campaign payload.');
  const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
  return {
    slug: String(raw.slug ?? '').trim().toLowerCase(),
    name: String(raw.name ?? '').trim(),
    description:
      typeof raw.description === 'string' && raw.description.trim() ? raw.description.trim() : null,
    // Partners can never set the public status.
    status: 'draft',
    startsAt: Number(raw.startsAt),
    endsAt: Number(raw.endsAt),
    rewardType: rewardType(raw.rewardType),
    tasks: tasks.map((t: any, i: number) => ({
      taskId: String(t?.taskId ?? '').trim().toLowerCase(),
      title: String(t?.title ?? '').trim(),
      description:
        typeof t?.description === 'string' && t.description.trim() ? t.description.trim() : null,
      points: Math.trunc(Number(t?.points)),
      requiredCount: Math.trunc(Number(t?.requiredCount)),
      completionLimitPerWallet: Math.trunc(Number(t?.completionLimitPerWallet)),
      sortOrder: Number.isFinite(Number(t?.sortOrder)) ? Math.trunc(Number(t.sortOrder)) : i,
      rules: Array.isArray(t?.rules) ? t.rules : [],
    })),
  };
}

/** Create or update a DRAFT (or changes-requested) own-org campaign. */
export async function savePartnerCampaign(
  partner: PartnerContext,
  raw: unknown,
  opts: { campaignId?: string } = {},
): Promise<PartnerCampaignSummary> {
  const input = normalizeInput(raw);
  const errors = validateStudioCampaign(input);
  if (!isRewardTypePartnerConfigurable(input.rewardType) && input.tasks.some((t) => t.points > 0)) {
    // Proposal drafts are allowed, but they can never claim PTS authority.
    errors.push(
      'Reward requests other than Campaign PTS must keep task PTS at 0 until FlowBridge authorizes a budget.',
    );
  }
  if (errors.length) throw new PartnerError(errors.join(' '));

  const supabase = await db();
  const nowIso = new Date().toISOString();
  let campaignId = opts.campaignId?.toLowerCase();

  if (campaignId) {
    const { data: existing, error } = await supabase
      .from('campaigns')
      .select('campaign_id,organization_id,review_state,revision')
      .eq('campaign_id', campaignId)
      .eq('organization_id', partner.orgId)
      .maybeSingle();
    if (error) throw new PartnerError(error.message, 500);
    if (!existing) throw new PartnerError('Campaign not found.', 404);
    if (!PARTNER_EDITABLE_STATES.includes(existing.review_state as CampaignReviewState)) {
      throw new PartnerError(
        'This campaign is locked while FlowBridge reviews or runs it. Published rules are immutable snapshots.',
        409,
      );
    }
  } else {
    campaignId = newCampaignId();
  }

  // Slug uniqueness across the platform, with a clear message.
  const { data: slugOwner } = await supabase
    .from('campaigns')
    .select('campaign_id')
    .eq('slug', input.slug)
    .maybeSingle();
  if (slugOwner && slugOwner.campaign_id.toLowerCase() !== campaignId) {
    throw new PartnerError(`Handle "${input.slug}" is already used by another campaign.`);
  }

  const { error: upsertError } = await supabase.from('campaigns').upsert(
    {
      campaign_id: campaignId,
      organization_id: partner.orgId,
      slug: input.slug,
      name: input.name,
      description: input.description,
      // Never public from a partner write.
      status: 'draft',
      review_state: 'draft',
      reward_type: input.rewardType,
      created_by: partner.userId,
      starts_at: toIso(input.startsAt),
      ends_at: toIso(input.endsAt),
      updated_at: nowIso,
    },
    { onConflict: 'campaign_id' },
  );
  if (upsertError) throw new PartnerError(upsertError.message, 500);

  const keep = input.tasks.map((t) => t.taskId);
  const { error: taskError } = await supabase.from('campaign_tasks').upsert(
    input.tasks.map((t) => ({
      campaign_id: campaignId!,
      task_id: t.taskId,
      title: t.title,
      description: t.description,
      points: t.points,
      required_count: t.requiredCount,
      completion_limit_per_wallet: t.completionLimitPerWallet,
      rules: t.rules as any,
      sort_order: t.sortOrder,
      updated_at: nowIso,
    })),
    { onConflict: 'campaign_id,task_id' },
  );
  if (taskError) throw new PartnerError(taskError.message, 500);

  const { data: existingTasks } = await supabase
    .from('campaign_tasks')
    .select('task_id')
    .eq('campaign_id', campaignId);
  const stale = (existingTasks ?? []).map((t) => t.task_id).filter((id) => !keep.includes(id));
  if (stale.length) {
    const { data: used } = await supabase
      .from('campaign_completions')
      .select('task_id')
      .eq('campaign_id', campaignId)
      .in('task_id', stale);
    if (used?.length) {
      throw new PartnerError(
        `Cannot remove task(s) with recorded completions: ${[...new Set(used.map((u) => u.task_id))].join(', ')}.`,
      );
    }
    await supabase.from('campaign_tasks').delete().eq('campaign_id', campaignId).in('task_id', stale);
  }

  await recordReviewEvent({
    campaignId: campaignId!,
    organizationId: partner.orgId,
    actorUserId: partner.userId,
    actorRole: partner.role,
    action: opts.campaignId ? 'draft_updated' : 'draft_created',
    toState: 'draft',
  });

  const summary = (await listPartnerCampaigns(partner)).find((c) => c.campaignId === campaignId);
  if (!summary) throw new PartnerError('Campaign saved but could not be re-read.', 500);
  return summary;
}

/** Partner-side lifecycle: submit / withdraw only. */
export async function partnerTransition(
  partner: PartnerContext,
  campaignId: string,
  action: 'submit' | 'withdraw',
): Promise<PartnerCampaignSummary> {
  const supabase = await db();
  const { data: row, error } = await supabase
    .from('campaigns')
    .select('campaign_id,review_state,reward_type,revision')
    .eq('campaign_id', campaignId.toLowerCase())
    .eq('organization_id', partner.orgId)
    .maybeSingle();
  if (error) throw new PartnerError(error.message, 500);
  if (!row) throw new PartnerError('Campaign not found.', 404);

  const actor: LifecycleActor = partner.role;
  const from = row.review_state as CampaignReviewState;
  if (action === 'submit' && !canSubmit(partner.role)) {
    throw new PartnerError('Only a Partner Admin may submit a campaign for review.', 403);
  }
  if (!canTransition(action, from, actor)) {
    throw new PartnerError(`Cannot ${action} a campaign in state "${from}".`, 409);
  }
  const target = findTransition(action, from)!.to;

  const patch: Record<string, unknown> = {
    review_state: target,
    updated_at: new Date().toISOString(),
  };
  if (action === 'submit') {
    patch.submitted_at = new Date().toISOString();
    patch.revision = Number(row.revision ?? 1) + (from === 'changes_requested' ? 1 : 0);
  }

  const { error: updateError } = await supabase
    .from('campaigns')
    .update(patch)
    .eq('campaign_id', row.campaign_id)
    .eq('organization_id', partner.orgId);
  if (updateError) throw new PartnerError(updateError.message, 500);

  await recordReviewEvent({
    campaignId: row.campaign_id,
    organizationId: partner.orgId,
    actorUserId: partner.userId,
    actorRole: partner.role,
    action,
    fromState: from,
    toState: target,
    note:
      action === 'submit' ? rewardTypeBlocksPublish(rewardType(row.reward_type)) ?? null : null,
    revision: Number(patch.revision ?? row.revision ?? 1),
  });

  const summary = (await listPartnerCampaigns(partner)).find(
    (c) => c.campaignId === row.campaign_id,
  );
  if (!summary) throw new PartnerError('Campaign not found after update.', 500);
  return summary;
}

/** Drafts only, and never when evidence exists. */
export async function deletePartnerDraft(partner: PartnerContext, campaignId: string) {
  const supabase = await db();
  const { data: row } = await supabase
    .from('campaigns')
    .select('campaign_id,review_state')
    .eq('campaign_id', campaignId.toLowerCase())
    .eq('organization_id', partner.orgId)
    .maybeSingle();
  if (!row) throw new PartnerError('Campaign not found.', 404);
  if (!PARTNER_EDITABLE_STATES.includes(row.review_state as CampaignReviewState)) {
    throw new PartnerError('Only drafts can be deleted. Ask FlowBridge to pause a live campaign.', 409);
  }
  const { data: completions } = await supabase
    .from('campaign_completions')
    .select('completion_id')
    .eq('campaign_id', row.campaign_id)
    .limit(1);
  if (completions?.length) {
    throw new PartnerError('This campaign has verified completions and cannot be deleted.', 409);
  }
  await supabase.from('campaign_tasks').delete().eq('campaign_id', row.campaign_id);
  await supabase
    .from('campaigns')
    .delete()
    .eq('campaign_id', row.campaign_id)
    .eq('organization_id', partner.orgId);
}
