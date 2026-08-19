/**
 * Growth Hub V3 — SERVER-ONLY participant reads.
 *
 * Read-only. No writes, no settlement, no FLOW, no RPC calls. The wallet is
 * ALWAYS taken from the authenticated profile — never from the browser.
 * Authority:
 *   - Campaign PTS totals / leaderboard  -> campaign_points_ledger
 *   - Completions                        -> campaign_completions
 *   - Verified activity evidence         -> verified_activities
 *   - Activity <-> completion linkage    -> campaign_completion_activities
 */

export interface ParticipantActivityRow {
  activityId: string;
  kind: string;
  status: string;
  sourceChainId: number;
  destinationChainId: number;
  sourceTxHash: string;
  sourceLogIndex: number;
  amountRaw: string;
  occurredAt: number;
  observedAt: number;
  campaignId: string | null;
  taskId: string | null;
  completionId: string | null;
  /** Campaign PTS already settled for the linked completion. Never FLOW. */
  campaignPoints: number;
}

export interface ParticipantCompletionRow {
  campaignId: string;
  taskId: string;
  completionId: string;
  points: number;
  completedAt: number;
}

export interface LeaderboardRow {
  rank: number;
  wallet: string;
  campaignPoints: number;
}

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);

/** Total Campaign PTS for a wallet, straight from the ledger. */
export async function getWalletCampaignPoints(wallet: string): Promise<number> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin
    .from('campaign_points_ledger')
    .select('points_delta')
    .eq('user_wallet', wallet.toLowerCase());
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum, r) => sum + Number(r.points_delta), 0);
}

export async function getWalletCompletions(
  wallet: string,
): Promise<ParticipantCompletionRow[]> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin
    .from('campaign_completions')
    .select('campaign_id,task_id,completion_id,points,completed_at')
    .eq('user_wallet', wallet.toLowerCase())
    .order('completed_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    campaignId: r.campaign_id,
    taskId: r.task_id,
    completionId: r.completion_id,
    points: Number(r.points),
    completedAt: ms(r.completed_at),
  }));
}

/**
 * Verified activity history for a wallet, joined server-side to campaign
 * completions where a linkage row exists. Only safe display fields are
 * returned: no intent hash, no intent nonce, no signatures.
 */
export async function getWalletActivity(
  wallet: string,
  limit = 50,
): Promise<ParticipantActivityRow[]> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const lower = wallet.toLowerCase();

  const { data, error } = await supabaseAdmin
    .from('verified_activities')
    .select(
      'activity_id,kind,status,source_chain_id,destination_chain_id,source_tx_hash,source_log_index,amount_raw,occurred_at,observed_at',
    )
    .eq('user_wallet', lower)
    .order('occurred_at', { ascending: false })
    .limit(Math.max(1, Math.min(200, limit)));
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (!rows.length) return [];

  const { data: links, error: linkError } = await supabaseAdmin
    .from('campaign_completion_activities')
    .select('activity_id,campaign_id,task_id,completion_id')
    .eq('user_wallet', lower)
    .in(
      'activity_id',
      rows.map((r) => r.activity_id),
    );
  if (linkError) throw new Error(linkError.message);

  const completions = await getWalletCompletions(lower);
  const pointsByCompletion = new Map(completions.map((c) => [c.completionId, c.points]));

  return rows.map((r) => {
    const link = (links ?? []).find((l) => l.activity_id === r.activity_id);
    return {
      activityId: r.activity_id,
      kind: r.kind,
      status: r.status,
      sourceChainId: Number(r.source_chain_id),
      destinationChainId: Number(r.destination_chain_id),
      sourceTxHash: r.source_tx_hash,
      sourceLogIndex: Number(r.source_log_index),
      amountRaw: String(r.amount_raw),
      occurredAt: ms(r.occurred_at),
      observedAt: ms(r.observed_at),
      campaignId: link?.campaign_id ?? null,
      taskId: link?.task_id ?? null,
      completionId: link?.completion_id ?? null,
      campaignPoints: link ? (pointsByCompletion.get(link.completion_id) ?? 0) : 0,
    } satisfies ParticipantActivityRow;
  });
}

/**
 * Deterministic Campaign PTS leaderboard. The ledger is the sole authority:
 * totals are summed per wallet (replayed settlement writes no new ledger row,
 * so no double counting), ordered by points desc with wallet address as the
 * stable tie-breaker.
 */
export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin
    .from('campaign_points_ledger')
    .select('user_wallet,points_delta');
  if (error) throw new Error(error.message);

  const totals = new Map<string, number>();
  for (const row of data ?? []) {
    const w = String(row.user_wallet).toLowerCase();
    totals.set(w, (totals.get(w) ?? 0) + Number(row.points_delta));
  }

  return [...totals.entries()]
    .map(([wallet, campaignPoints]) => ({ wallet, campaignPoints }))
    .sort((a, b) =>
      b.campaignPoints !== a.campaignPoints
        ? b.campaignPoints - a.campaignPoints
        : a.wallet.localeCompare(b.wallet),
    )
    .map((row, i) => ({ rank: i + 1, ...row }));
}
