/**
 * Growth Hub V5 — SERVER-ONLY read-only campaign aggregation.
 *
 * Authority sources: campaigns, campaign_tasks, campaign_completions,
 * campaign_completion_activities, campaign_points_ledger, verified_activities.
 *
 * Strictly read-only: nothing here writes points, completions, activities,
 * campaign definitions or rewards. Public shapes expose truncated wallets only
 * and never signatures, intent hashes/nonces or raw rows.
 */

export interface PublicTaskMetric {
  taskId: string;
  title: string;
  points: number;
  completions: number;
  participants: number;
}

export interface PublicRecentCompletion {
  /** Truncated wallet, e.g. 0x1234…abcd. Never the full address. */
  wallet: string;
  taskId: string;
  taskTitle: string;
  points: number;
  completedAt: string;
  /** True when this completion is linked to a verified activity row. */
  verified: boolean;
}

export interface PublicCampaignMetrics {
  campaignId: string;
  slug: string;
  name: string;
  status: string;
  startsAt: string;
  endsAt: string;
  participants: number;
  completions: number;
  pointsAwarded: number;
  tasks: PublicTaskMetric[];
  recentCompletions: PublicRecentCompletion[];
}

export interface SeriesPoint {
  date: string;
  completions: number;
  points: number;
}

export interface AdminCampaignAnalytics extends PublicCampaignMetrics {
  configuredPoints: number;
  taskCount: number;
  verifiedActivities: number;
  /** completions / (participants * total per-wallet completion capacity). */
  completionRate: number | null;
  series: SeriesPoint[];
}

const truncate = (w: string) => (w.length > 12 ? `${w.slice(0, 6)}…${w.slice(-4)}` : w);
const dayKey = (iso: string) => iso.slice(0, 10);

interface CompletionRow {
  completion_id: string;
  task_id: string;
  user_wallet: string;
  points: number;
  completed_at: string;
}

async function loadCore(campaignId: string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

  const [{ data: tasks, error: taskError }, { data: completions, error: cError }, ledger, links] =
    await Promise.all([
      supabaseAdmin
        .from('campaign_tasks')
        .select('task_id,title,points,completion_limit_per_wallet,sort_order')
        .eq('campaign_id', campaignId)
        .order('sort_order', { ascending: true }),
      supabaseAdmin
        .from('campaign_completions')
        .select('completion_id,task_id,user_wallet,points,completed_at')
        .eq('campaign_id', campaignId)
        .order('completed_at', { ascending: false })
        .limit(5000),
      supabaseAdmin
        .from('campaign_points_ledger')
        .select('points_delta,created_at')
        .eq('campaign_id', campaignId)
        .limit(5000),
      supabaseAdmin
        .from('campaign_completion_activities')
        .select('completion_id')
        .eq('campaign_id', campaignId)
        .limit(5000),
    ]);

  if (taskError) throw new Error(taskError.message);
  if (cError) throw new Error(cError.message);
  if (ledger.error) throw new Error(ledger.error.message);
  if (links.error) throw new Error(links.error.message);

  const rows = (completions ?? []) as CompletionRow[];
  const linked = new Set((links.data ?? []).map((l) => l.completion_id));
  const titles = new Map((tasks ?? []).map((t) => [t.task_id, t.title]));

  const taskMetrics: PublicTaskMetric[] = (tasks ?? []).map((t) => {
    const mine = rows.filter((r) => r.task_id === t.task_id);
    return {
      taskId: t.task_id,
      title: t.title,
      points: Number(t.points),
      completions: mine.length,
      participants: new Set(mine.map((r) => r.user_wallet)).size,
    };
  });

  const recentCompletions: PublicRecentCompletion[] = rows.slice(0, 12).map((r) => ({
    wallet: truncate(r.user_wallet),
    taskId: r.task_id,
    taskTitle: titles.get(r.task_id) ?? r.task_id,
    points: Number(r.points),
    completedAt: r.completed_at,
    verified: linked.has(r.completion_id),
  }));

  return {
    tasks: tasks ?? [],
    rows,
    taskMetrics,
    recentCompletions,
    participants: new Set(rows.map((r) => r.user_wallet)).size,
    pointsAwarded: (ledger.data ?? []).reduce((sum, l) => sum + Number(l.points_delta), 0),
    ledger: ledger.data ?? [],
  };
}

/** Public metrics for a PUBLISHED campaign. Returns null when not public. */
export async function getPublicCampaignMetrics(
  slug: string,
): Promise<PublicCampaignMetrics | null> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: campaign, error } = await supabaseAdmin
    .from('campaigns')
    .select('campaign_id,slug,name,status,starts_at,ends_at')
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!campaign) return null;

  const core = await loadCore(campaign.campaign_id);
  return {
    campaignId: campaign.campaign_id,
    slug: campaign.slug,
    name: campaign.name,
    status: campaign.status,
    startsAt: campaign.starts_at,
    endsAt: campaign.ends_at,
    participants: core.participants,
    completions: core.rows.length,
    pointsAwarded: core.pointsAwarded,
    tasks: core.taskMetrics,
    recentCompletions: core.recentCompletions,
  };
}

/** Admin analytics for any campaign, regardless of publish state. */
export async function getAdminCampaignAnalytics(
  campaignId: string,
): Promise<AdminCampaignAnalytics | null> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: campaign, error } = await supabaseAdmin
    .from('campaigns')
    .select('campaign_id,slug,name,status,starts_at,ends_at')
    .eq('campaign_id', campaignId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!campaign) return null;

  const core = await loadCore(campaignId);

  const { count: verifiedActivities, error: vError } = await supabaseAdmin
    .from('verified_activities')
    .select('activity_id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId);
  if (vError) throw new Error(vError.message);

  const configuredPoints = core.tasks.reduce(
    (sum, t) => sum + Number(t.points) * Math.max(1, Number(t.completion_limit_per_wallet)),
    0,
  );
  const capacity = core.tasks.reduce(
    (sum, t) => sum + Math.max(1, Number(t.completion_limit_per_wallet)),
    0,
  );
  const denominator = core.participants * capacity;

  const byDay = new Map<string, SeriesPoint>();
  const bump = (iso: string, patch: Partial<SeriesPoint>) => {
    const date = dayKey(iso);
    const entry = byDay.get(date) ?? { date, completions: 0, points: 0 };
    entry.completions += patch.completions ?? 0;
    entry.points += patch.points ?? 0;
    byDay.set(date, entry);
  };
  for (const r of core.rows) bump(r.completed_at, { completions: 1 });
  for (const l of core.ledger) bump(l.created_at, { points: Number(l.points_delta) });

  return {
    campaignId: campaign.campaign_id,
    slug: campaign.slug,
    name: campaign.name,
    status: campaign.status,
    startsAt: campaign.starts_at,
    endsAt: campaign.ends_at,
    participants: core.participants,
    completions: core.rows.length,
    pointsAwarded: core.pointsAwarded,
    tasks: core.taskMetrics,
    recentCompletions: core.recentCompletions,
    configuredPoints,
    taskCount: core.tasks.length,
    verifiedActivities: verifiedActivities ?? 0,
    completionRate: denominator > 0 ? core.rows.length / denominator : null,
    series: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/** CSV of safe aggregate rows for an authorized campaign. */
export function analyticsToCsv(a: AdminCampaignAnalytics): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines: string[] = [];
  lines.push('section,key,label,completions,participants,points');
  lines.push(
    ['summary', a.slug, a.name, a.completions, a.participants, a.pointsAwarded].map(esc).join(','),
  );
  for (const t of a.tasks) {
    lines.push(
      ['task', t.taskId, t.title, t.completions, t.participants, t.points * t.completions]
        .map(esc)
        .join(','),
    );
  }
  for (const p of a.series) {
    lines.push(['daily', p.date, p.date, p.completions, '', p.points].map(esc).join(','));
  }
  for (const r of a.recentCompletions) {
    lines.push(
      ['completion', r.completedAt, `${r.wallet} · ${r.taskTitle}`, 1, '', r.points]
        .map(esc)
        .join(','),
    );
  }
  return lines.join('\n');
}
