/**
 * Growth Hub V4 — SERVER-ONLY campaign DEFINITION writes.
 *
 * Writes ONLY `campaigns` and `campaign_tasks`. Never touches
 * verified_activities, campaign_completions, campaign_completion_activities or
 * campaign_points_ledger, and never settles or awards anything.
 */
import {
  validateStudioCampaign,
  newCampaignId,
  type StudioCampaignInput,
  type StudioCampaignSummary,
} from './campaignStudio';
import type { CampaignStatus } from './campaignTypes';

export class CampaignStudioError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'CampaignStudioError';
    this.status = status;
  }
}

const toMs = (iso: string) => new Date(iso).getTime();
const toIso = (ms: number) => new Date(ms).toISOString();

function mapStatus(raw: string): CampaignStatus {
  return raw === 'published' || raw === 'archived' ? raw : 'draft';
}

async function db() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return supabaseAdmin;
}

/** All definitions (drafts included) plus durable completion counts. */
export async function listAllCampaignDefinitions(): Promise<StudioCampaignSummary[]> {
  const supabase = await db();
  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select('campaign_id,slug,name,description,status,starts_at,ends_at,updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw new CampaignStudioError(error.message, 500);
  if (!campaigns?.length) return [];

  const ids = campaigns.map((c) => c.campaign_id);
  const [{ data: tasks, error: taskError }, { data: completions, error: compError }] =
    await Promise.all([
      supabase
        .from('campaign_tasks')
        .select(
          'campaign_id,task_id,title,description,points,required_count,completion_limit_per_wallet,rules,sort_order',
        )
        .in('campaign_id', ids)
        .order('sort_order', { ascending: true }),
      supabase.from('campaign_completions').select('campaign_id').in('campaign_id', ids),
    ]);
  if (taskError) throw new CampaignStudioError(taskError.message, 500);
  if (compError) throw new CampaignStudioError(compError.message, 500);

  return campaigns.map((c) => ({
    campaignId: c.campaign_id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    status: mapStatus(c.status),
    startsAt: toMs(c.starts_at),
    endsAt: toMs(c.ends_at),
    updatedAt: c.updated_at ? toMs(c.updated_at) : undefined,
    completionCount: (completions ?? []).filter((r) => r.campaign_id === c.campaign_id).length,
    tasks: (tasks ?? [])
      .filter((t) => t.campaign_id === c.campaign_id)
      .map((t) => ({
        taskId: t.task_id,
        title: t.title,
        description: t.description,
        points: Number(t.points),
        requiredCount: Number(t.required_count),
        completionLimitPerWallet: Number(t.completion_limit_per_wallet),
        rules: Array.isArray(t.rules) ? (t.rules as unknown[]) : [],
        sortOrder: Number(t.sort_order),
      })),
  }));
}

/** Server-side normalization: nothing from the client is trusted verbatim. */
function normalize(input: any): StudioCampaignInput {
  if (!input || typeof input !== 'object') {
    throw new CampaignStudioError('Invalid campaign payload.');
  }
  const tasks = Array.isArray(input.tasks) ? input.tasks : [];
  return {
    campaignId: typeof input.campaignId === 'string' ? input.campaignId.toLowerCase() : undefined,
    slug: String(input.slug ?? '').trim().toLowerCase(),
    name: String(input.name ?? '').trim(),
    description:
      typeof input.description === 'string' && input.description.trim() !== ''
        ? input.description.trim()
        : null,
    status: (['draft', 'published', 'archived'].includes(input.status)
      ? input.status
      : 'draft') as CampaignStatus,
    startsAt: Number(input.startsAt),
    endsAt: Number(input.endsAt),
    tasks: tasks.map((t: any, i: number) => ({
      taskId: String(t?.taskId ?? '').trim().toLowerCase(),
      title: String(t?.title ?? '').trim(),
      description:
        typeof t?.description === 'string' && t.description.trim() !== ''
          ? t.description.trim()
          : null,
      points: Math.trunc(Number(t?.points)),
      requiredCount: Math.trunc(Number(t?.requiredCount)),
      completionLimitPerWallet: Math.trunc(Number(t?.completionLimitPerWallet)),
      sortOrder: Number.isFinite(Number(t?.sortOrder)) ? Math.trunc(Number(t.sortOrder)) : i,
      rules: Array.isArray(t?.rules) ? t.rules : [],
    })),
  };
}

/**
 * Creates or replaces ONE campaign definition (+ its tasks).
 * Task rows are replaced wholesale; completions are never touched, so historical
 * PTS records survive even when a task definition is edited.
 */
export async function saveCampaignDefinition(
  raw: unknown,
  opts: { campaignId?: string } = {},
): Promise<StudioCampaignSummary> {
  const input = normalize(raw);
  if (opts.campaignId) input.campaignId = opts.campaignId.toLowerCase();

  const errors = validateStudioCampaign(input);
  if (errors.length) throw new CampaignStudioError(errors.join(' '));

  const supabase = await db();
  const campaignId = input.campaignId ?? newCampaignId();

  // Slug uniqueness is enforced server-side with a clear message.
  const { data: slugOwner, error: slugError } = await supabase
    .from('campaigns')
    .select('campaign_id')
    .eq('slug', input.slug)
    .maybeSingle();
  if (slugError) throw new CampaignStudioError(slugError.message, 500);
  if (slugOwner && slugOwner.campaign_id.toLowerCase() !== campaignId.toLowerCase()) {
    throw new CampaignStudioError(`Slug "${input.slug}" is already used by another campaign.`);
  }

  const { error: upsertError } = await supabase.from('campaigns').upsert(
    {
      campaign_id: campaignId,
      slug: input.slug,
      name: input.name,
      description: input.description,
      status: input.status,
      starts_at: toIso(input.startsAt),
      ends_at: toIso(input.endsAt),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'campaign_id' },
  );
  if (upsertError) throw new CampaignStudioError(upsertError.message, 500);

  const keepIds = input.tasks.map((t) => t.taskId);
  const { error: taskUpsertError } = await supabase.from('campaign_tasks').upsert(
    input.tasks.map((t) => ({
      campaign_id: campaignId,
      task_id: t.taskId,
      title: t.title,
      description: t.description,
      points: t.points,
      required_count: t.requiredCount,
      completion_limit_per_wallet: t.completionLimitPerWallet,
      rules: t.rules as any,
      sort_order: t.sortOrder,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'campaign_id,task_id' },
  );
  if (taskUpsertError) throw new CampaignStudioError(taskUpsertError.message, 500);

  // Remove task rows the admin deleted, but never a task with completions.
  const { data: existing, error: existingError } = await supabase
    .from('campaign_tasks')
    .select('task_id')
    .eq('campaign_id', campaignId);
  if (existingError) throw new CampaignStudioError(existingError.message, 500);
  const stale = (existing ?? []).map((r) => r.task_id).filter((id) => !keepIds.includes(id));
  if (stale.length) {
    const { data: used, error: usedError } = await supabase
      .from('campaign_completions')
      .select('task_id')
      .eq('campaign_id', campaignId)
      .in('task_id', stale);
    if (usedError) throw new CampaignStudioError(usedError.message, 500);
    const usedIds = new Set((used ?? []).map((r) => r.task_id));
    if (usedIds.size) {
      throw new CampaignStudioError(
        `Cannot remove task(s) with recorded completions: ${[...usedIds].join(', ')}.`,
      );
    }
    const { error: deleteError } = await supabase
      .from('campaign_tasks')
      .delete()
      .eq('campaign_id', campaignId)
      .in('task_id', stale);
    if (deleteError) throw new CampaignStudioError(deleteError.message, 500);
  }

  const all = await listAllCampaignDefinitions();
  const saved = all.find((c) => c.campaignId.toLowerCase() === campaignId.toLowerCase());
  if (!saved) throw new CampaignStudioError('Campaign saved but could not be re-read.', 500);
  return saved;
}

/** Publication toggles availability only. It never settles or awards PTS. */
export async function setCampaignStatus(
  campaignId: string,
  status: CampaignStatus,
): Promise<StudioCampaignSummary> {
  if (!['draft', 'published', 'archived'].includes(status)) {
    throw new CampaignStudioError('Invalid status.');
  }
  const supabase = await db();
  const { error } = await supabase
    .from('campaigns')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('campaign_id', campaignId);
  if (error) throw new CampaignStudioError(error.message, 500);
  const all = await listAllCampaignDefinitions();
  const row = all.find((c) => c.campaignId.toLowerCase() === campaignId.toLowerCase());
  if (!row) throw new CampaignStudioError('Campaign not found.', 404);
  return row;
}

/** Fails closed when history exists — archive instead. */
export async function deleteCampaignDefinition(campaignId: string): Promise<void> {
  const supabase = await db();
  const { data: completions, error } = await supabase
    .from('campaign_completions')
    .select('completion_id')
    .eq('campaign_id', campaignId)
    .limit(1);
  if (error) throw new CampaignStudioError(error.message, 500);
  if (completions?.length) {
    throw new CampaignStudioError(
      'This campaign has recorded completions. Archive it instead of deleting.',
      409,
    );
  }
  const { error: taskError } = await supabase
    .from('campaign_tasks')
    .delete()
    .eq('campaign_id', campaignId);
  if (taskError) throw new CampaignStudioError(taskError.message, 500);
  const { error: campaignError } = await supabase
    .from('campaigns')
    .delete()
    .eq('campaign_id', campaignId);
  if (campaignError) throw new CampaignStudioError(campaignError.message, 500);
}

/** Duplicate = new draft campaign id + slug with copied task DEFINITIONS only. */
export async function duplicateCampaignDefinition(
  campaignId: string,
): Promise<StudioCampaignSummary> {
  const all = await listAllCampaignDefinitions();
  const source = all.find((c) => c.campaignId.toLowerCase() === campaignId.toLowerCase());
  if (!source) throw new CampaignStudioError('Campaign not found.', 404);

  const suffix = Date.now().toString(36);
  return await saveCampaignDefinition({
    slug: `${source.slug}-copy-${suffix}`.slice(0, 63),
    name: `${source.name} (copy)`.slice(0, 120),
    description: source.description,
    status: 'draft',
    startsAt: source.startsAt,
    endsAt: source.endsAt,
    tasks: source.tasks,
  });
}
