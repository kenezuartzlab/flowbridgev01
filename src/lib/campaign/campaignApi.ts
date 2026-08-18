/**
 * B1 Gate 2 — browser-safe client for the durable campaign read API.
 * Read-only: no settlement, no FLOW, no reward mutation.
 */
import type { Hex } from '../activity/activityIntent';

export interface CampaignApiTask {
  taskId: string;
  title: string;
  description?: string | null;
  points: number;
  requiredCount: number;
  completionLimitPerWallet: number;
  sortOrder: number;
  rules: unknown[];
}

export interface CampaignApiCampaign {
  campaignId: Hex;
  slug: string;
  name: string;
  description?: string | null;
  status: string;
  startsAt: number;
  endsAt: number;
  tasks: CampaignApiTask[];
}

export interface CampaignApiTaskProgress {
  taskId: string;
  completions: number;
  completionLimitPerWallet: number;
  completed: boolean;
  campaignPoints: number;
}

export interface CampaignApiProgress {
  campaignId: Hex;
  tasks: CampaignApiTaskProgress[];
  campaignPoints: number;
}

export interface CampaignApiResponse {
  success: true;
  authenticated: boolean;
  wallet: string | null;
  campaigns: CampaignApiCampaign[];
  /** Campaign PTS — separate from FLOW rewards. */
  campaignPointsTotal: number;
  progress: CampaignApiProgress[];
}

export class CampaignApiUnauthorized extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'CampaignApiUnauthorized';
  }
}

export async function fetchCampaigns(token?: string | null): Promise<CampaignApiResponse> {
  const res = await fetch('/api/campaigns', {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (res.status === 401) throw new CampaignApiUnauthorized();
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error ?? 'Failed to load campaigns');
  }
  return data as CampaignApiResponse;
}
