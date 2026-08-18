/**
 * B1 Gate 2 — SERVER-ONLY durable campaign read API.
 *
 * Read-only. No settlement, no FLOW, no reward mutation, no service-role write
 * authority is exposed to the browser. Progress is ALWAYS bound to the wallet
 * stored on the authenticated profile — never to a browser-supplied wallet.
 */
import type { Hex } from '../activity/activityIntent';
import { parseCampaignRules } from './campaignRules';
import type { Campaign, CampaignStatus, CampaignTask } from './campaignTypes';

export interface CampaignDefinition {
  campaign: Campaign;
  tasks: CampaignTask[];
}

export interface CampaignTaskProgress {
  taskId: string;
  completions: number;
  completionLimitPerWallet: number;
  completed: boolean;
  /** Campaign PTS earned for this task. Never FLOW. */
  campaignPoints: number;
}

export interface CampaignProgress {
  campaignId: Hex;
  tasks: CampaignTaskProgress[];
  campaignPoints: number;
}

const toMs = (iso: string) => new Date(iso).getTime();

function mapStatus(raw: string): CampaignStatus {
  return raw === 'published' || raw === 'archived' ? raw : 'draft';
}

export async function listPublishedCampaigns(): Promise<CampaignDefinition[]> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

  const { data: campaigns, error } = await supabaseAdmin
    .from('campaigns')
    .select('campaign_id,slug,name,description,status,starts_at,ends_at')
    .eq('status', 'published')
    .order('starts_at', { ascending: true });
  if (error) throw new Error(error.message);
  if (!campaigns?.length) return [];

  const ids = campaigns.map((c) => c.campaign_id);
  const { data: tasks, error: taskError } = await supabaseAdmin
    .from('campaign_tasks')
    .select(
      'campaign_id,task_id,title,description,points,required_count,completion_limit_per_wallet,rules,sort_order',
    )
    .in('campaign_id', ids)
    .order('sort_order', { ascending: true });
  if (taskError) throw new Error(taskError.message);

  return campaigns.map((c) => ({
    campaign: {
      campaignId: c.campaign_id as Hex,
      slug: c.slug,
      name: c.name,
      description: c.description,
      status: mapStatus(c.status),
      startsAt: toMs(c.starts_at),
      endsAt: toMs(c.ends_at),
    },
    tasks: (tasks ?? [])
      .filter((t) => t.campaign_id === c.campaign_id)
      .map((t) => ({
        campaignId: t.campaign_id as Hex,
        taskId: t.task_id,
        title: t.title,
        description: t.description,
        points: Number(t.points),
        requiredCount: Number(t.required_count),
        completionLimitPerWallet: Number(t.completion_limit_per_wallet),
        // Rules are authoritative: a malformed rule must not silently pass.
        rules: parseCampaignRules(t.rules),
        sortOrder: Number(t.sort_order),
      })),
  }));
}

/** Trusted wallet lookup: the wallet bound to the authenticated profile. */
export async function getProfileWallet(userId: string): Promise<string | null> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('wallet_address')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const wallet = data?.wallet_address;
  return wallet ? wallet.toLowerCase() : null;
}

export async function getCampaignProgressForWallet(
  wallet: string,
  definitions: CampaignDefinition[],
): Promise<{ progress: CampaignProgress[]; campaignPointsTotal: number }> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

  const { data, error } = await supabaseAdmin
    .from('campaign_completions')
    .select('campaign_id,task_id,points')
    .eq('user_wallet', wallet.toLowerCase());
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const progress = definitions.map(({ campaign, tasks }) => {
    const taskProgress = tasks.map((task) => {
      const mine = rows.filter(
        (r) => r.campaign_id === campaign.campaignId && r.task_id === task.taskId,
      );
      const points = mine.reduce((sum, r) => sum + Number(r.points), 0);
      return {
        taskId: task.taskId,
        completions: mine.length,
        completionLimitPerWallet: task.completionLimitPerWallet,
        completed: mine.length >= task.completionLimitPerWallet,
        campaignPoints: points,
      } satisfies CampaignTaskProgress;
    });
    return {
      campaignId: campaign.campaignId,
      tasks: taskProgress,
      campaignPoints: taskProgress.reduce((sum, t) => sum + t.campaignPoints, 0),
    } satisfies CampaignProgress;
  });

  return {
    progress,
    campaignPointsTotal: rows.reduce((sum, r) => sum + Number(r.points), 0),
  };
}
