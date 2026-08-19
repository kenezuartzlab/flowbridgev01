/**
 * Growth Hub V3 — browser-safe participant read client. No writes.
 */
export interface ParticipantActivity {
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
  campaignPoints: number;
}

export interface ParticipantCompletion {
  campaignId: string;
  taskId: string;
  completionId: string;
  points: number;
  completedAt: number;
}

export interface ParticipantMeResponse {
  success: true;
  wallet: string | null;
  campaignPointsTotal: number;
  completions: ParticipantCompletion[];
  activity: ParticipantActivity[];
  rank: number | null;
}

export interface LeaderboardEntry {
  rank: number;
  wallet: string;
  campaignPoints: number;
}

export interface LeaderboardResponse {
  success: true;
  total: number;
  rows: LeaderboardEntry[];
}

export async function fetchParticipantMe(token: string): Promise<ParticipantMeResponse> {
  const res = await fetch("/api/campaigns/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error ?? "Failed to load your progress");
  }
  return data as ParticipantMeResponse;
}

export async function fetchLeaderboard(limit = 25): Promise<LeaderboardResponse> {
  const res = await fetch(`/api/campaigns/leaderboard?limit=${limit}`);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error ?? "Failed to load leaderboard");
  }
  return data as LeaderboardResponse;
}
