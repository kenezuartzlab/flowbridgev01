/**
 * B1 Gate 3 — TRUSTED SERVER campaign settlement adapter.
 *
 * Consumes durable CONFIRMED rows from public.verified_activities, reconstructs
 * trusted VerifiedActivityFacts server-side, evaluates the Gate 2 engine and
 * writes completions ONLY through public.admin_settle_campaign_completion.
 *
 * Never awards FLOW, never mutates legacy profiles.flow_points, never writes the
 * Activity Registry, never performs a blockchain write, and never trusts a
 * browser-supplied campaign, task, completion id, fact or point value.
 */
import type { Hex } from '../activity/activityIntent';
import type { CampaignCompletionRepository } from './campaignCompletionRepository';
import { settleCampaignForWallet, type SettlementResult } from './campaignSettlement';
import type { CampaignDefinition } from './campaignApi.server';
import type { VerifiedActivityFacts, VerifiedActivityKind, VerifiedActivityStatus } from './campaignTypes';

export class DurableEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DurableEvidenceError';
  }
}

/** Strict decimal-string bigint parsing: malformed durable evidence fails closed. */
export function parseDurableBigInt(raw: unknown, field: string): bigint {
  if (typeof raw === 'bigint') return raw;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw.trim())) {
    throw new DurableEvidenceError(`${field} must be a decimal string`);
  }
  return BigInt(raw.trim());
}

const isHex32 = (v: unknown): v is Hex => typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v);
const isAddress = (v: unknown): v is string => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v);

function parseChainId(raw: unknown, field: string): number {
  const n = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) {
    throw new DurableEvidenceError(`${field} must be a positive integer`);
  }
  return n;
}

function parseKind(raw: unknown): VerifiedActivityKind {
  if (raw !== 'BRIDGE_SUBMITTED' && raw !== 'BRIDGE_COMPLETED') {
    throw new DurableEvidenceError('kind is invalid');
  }
  return raw;
}

function parseStatus(raw: unknown): VerifiedActivityStatus {
  if (raw !== 'PENDING' && raw !== 'CONFIRMED' && raw !== 'REVIEW' && raw !== 'REVERSED') {
    throw new DurableEvidenceError('status is invalid');
  }
  return raw;
}

function parseTimestamp(raw: unknown, field: string): number {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new DurableEvidenceError(`${field} is missing`);
  }
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) throw new DurableEvidenceError(`${field} is invalid`);
  return ms;
}

/** Reconstruct trusted facts from ONE durable verified_activities row. */
export function factsFromDurableRow(row: Record<string, unknown>): VerifiedActivityFacts {
  if (!isHex32(row.activity_id)) throw new DurableEvidenceError('activity_id is invalid');
  if (!isAddress(row.user_wallet)) throw new DurableEvidenceError('user_wallet is invalid');
  if (!isHex32(row.action_type)) throw new DurableEvidenceError('action_type is invalid');
  if (typeof row.token !== 'string' || row.token.trim() === '') {
    throw new DurableEvidenceError('token is invalid');
  }
  if (row.campaign_id !== undefined && row.campaign_id !== null && !isHex32(row.campaign_id)) {
    throw new DurableEvidenceError('campaign_id is invalid');
  }

  return {
    activityId: row.activity_id.toLowerCase() as Hex,
    wallet: row.user_wallet.toLowerCase(),
    kind: parseKind(row.kind),
    status: parseStatus(row.status),
    sourceChainId: parseChainId(row.source_chain_id, 'source_chain_id'),
    destinationChainId: parseChainId(row.destination_chain_id, 'destination_chain_id'),
    actionType: row.action_type.toLowerCase() as Hex,
    token: row.token.toLowerCase(),
    amountRaw: parseDurableBigInt(row.amount_raw, 'amount_raw'),
    ...(isHex32(row.campaign_id) ? { campaignId: row.campaign_id.toLowerCase() as Hex } : {}),
    occurredAt: parseTimestamp(row.occurred_at, 'occurred_at'),
  };
}

type Db = { from: any; rpc: any };

const loadAdmin = async (): Promise<Db> =>
  (await import('@/integrations/supabase/client.server')).supabaseAdmin as unknown as Db;

/** Durable CONFIRMED evidence for one wallet, strictly reconstructed. */
export async function loadConfirmedActivitiesForWallet(
  wallet: string,
  clientLoader: () => Promise<Db> = loadAdmin,
): Promise<VerifiedActivityFacts[]> {
  const db = await clientLoader();
  const { data, error } = await db
    .from('verified_activities')
    .select(
      'activity_id,user_wallet,kind,status,source_chain_id,destination_chain_id,action_type,token,amount_raw,campaign_id,occurred_at',
    )
    .eq('user_wallet', wallet.toLowerCase())
    .eq('status', 'CONFIRMED');
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => factsFromDurableRow(row));
}

/**
 * Repository whose ONLY write path is the service-role settlement RPC.
 */
export function createBackendCampaignCompletionRepository(
  clientLoader: () => Promise<Db> = loadAdmin,
): CampaignCompletionRepository {
  return {
    async loadState({ campaignId, wallet }) {
      const db = await clientLoader();
      const { data, error } = await db
        .from('campaign_completions')
        .select('completion_id,task_id,campaign_completion_activities(activity_id)')
        .eq('campaign_id', campaignId.toLowerCase())
        .eq('user_wallet', wallet.toLowerCase());
      if (error) throw new Error(error.message);

      const countByTaskId: Record<string, number> = {};
      const usedActivityIdsByTaskId: Record<string, string[]> = {};
      for (const row of data ?? []) {
        const taskId = String(row.task_id);
        countByTaskId[taskId] = (countByTaskId[taskId] ?? 0) + 1;
        const ids = (row.campaign_completion_activities ?? []).map((a: any) =>
          String(a.activity_id).toLowerCase(),
        );
        usedActivityIdsByTaskId[taskId] = [...(usedActivityIdsByTaskId[taskId] ?? []), ...ids];
      }
      return { countByTaskId, usedActivityIdsByTaskId };
    },

    async insertCompletion({ completion, completedAt }) {
      const db = await clientLoader();
      const { data, error } = await db.rpc('admin_settle_campaign_completion', {
        p_completion_id: completion.completionId,
        p_campaign_id: completion.campaignId,
        p_task_id: completion.taskId,
        p_user_wallet: completion.wallet.toLowerCase(),
        p_activity_ids: completion.activityIds,
        p_completed_at: new Date(completedAt).toISOString(),
      });
      if (error) throw new Error(error.message);
      const row = Array.isArray(data) ? data[0] : data;
      const inserted = !!row?.inserted;
      return { inserted, pointsAwarded: inserted ? Number(row?.points_awarded ?? 0) : 0 };
    },

    async totalPoints({ wallet, campaignId }) {
      const db = await clientLoader();
      let query = db
        .from('campaign_completions')
        .select('points')
        .eq('user_wallet', wallet.toLowerCase());
      if (campaignId) query = query.eq('campaign_id', campaignId.toLowerCase());
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []).reduce((sum: number, r: any) => sum + Number(r.points), 0);
    },
  };
}

export interface DurableSettlementSummary {
  wallet: string;
  /** Campaign PTS awarded by THIS run only. Never FLOW. */
  pointsAwarded: number;
  completions: { campaignId: Hex; taskId: string; completionId: Hex; points: number }[];
  /** Replayed completions that already existed (0 additional PTS). */
  replayed: number;
}

export interface DurableSettlementDeps {
  loadDefinitions?: () => Promise<CampaignDefinition[]>;
  loadActivities?: (wallet: string) => Promise<VerifiedActivityFacts[]>;
  repository?: CampaignCompletionRepository;
  now?: () => number;
}

/**
 * Settle every published campaign for ONE trusted wallet using durable evidence.
 * Campaign matching never relies on a client-supplied campaignId.
 */
export async function settleDurableCampaignsForWallet(
  wallet: string,
  deps: DurableSettlementDeps = {},
): Promise<DurableSettlementSummary> {
  if (!isAddress(wallet)) throw new DurableEvidenceError('wallet is invalid');
  const normalized = wallet.toLowerCase();

  const loadDefinitions =
    deps.loadDefinitions ??
    (async () => (await import('./campaignApi.server')).listPublishedCampaigns());
  const loadActivities = deps.loadActivities ?? ((w: string) => loadConfirmedActivitiesForWallet(w));
  const repository = deps.repository ?? createBackendCampaignCompletionRepository();

  const [definitions, activities] = await Promise.all([
    loadDefinitions(),
    loadActivities(normalized),
  ]);

  const summary: DurableSettlementSummary = {
    wallet: normalized,
    pointsAwarded: 0,
    completions: [],
    replayed: 0,
  };
  if (!activities.length) return summary;

  for (const { campaign, tasks } of definitions) {
    if (campaign.status !== 'published') continue;
    const result: SettlementResult = await settleCampaignForWallet({
      campaign,
      tasks,
      wallet: normalized,
      activities,
      repository,
      ...(deps.now ? { now: deps.now } : {}),
    });
    summary.pointsAwarded += result.pointsAwarded;
    summary.replayed += result.skipped.length;
    for (const c of result.inserted) {
      summary.completions.push({
        campaignId: c.campaignId,
        taskId: c.taskId,
        completionId: c.completionId,
        points: c.points,
      });
    }
  }

  return summary;
}
