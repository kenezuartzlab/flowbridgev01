/**
 * Growth Hub V5 — browser clients for the read-only metrics/analytics APIs.
 */
import { getIdToken } from "@/lib/auth";

export interface PublicTaskMetric {
  taskId: string;
  title: string;
  points: number;
  completions: number;
  participants: number;
}

export interface PublicRecentCompletion {
  wallet: string;
  taskId: string;
  taskTitle: string;
  points: number;
  completedAt: string;
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
  completionRate: number | null;
  series: SeriesPoint[];
}

export async function fetchCampaignMetrics(slug: string): Promise<PublicCampaignMetrics | null> {
  const res = await fetch(`/api/campaigns/${encodeURIComponent(slug)}/metrics`);
  if (res.status === 404) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) throw new Error(data?.error ?? "Failed to load metrics");
  return data.metrics as PublicCampaignMetrics;
}

async function adminHeaders(wallet: string) {
  const token = await getIdToken();
  if (!token) throw new Error("Sign in first.");
  return { authorization: `Bearer ${token}`, "x-wallet-address": wallet };
}

export async function fetchCampaignAnalytics(
  wallet: string,
  campaignId: string,
): Promise<AdminCampaignAnalytics> {
  const res = await fetch(`/api/campaigns/admin/${campaignId}/analytics`, {
    headers: await adminHeaders(wallet),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) throw new Error(data?.error ?? "Failed to load analytics");
  return data.analytics as AdminCampaignAnalytics;
}

/** Triggers a browser download of the authorized campaign's safe CSV export. */
export async function downloadCampaignAnalyticsCsv(wallet: string, campaignId: string) {
  const res = await fetch(`/api/campaigns/admin/${campaignId}/analytics?format=csv`, {
    headers: await adminHeaders(wallet),
  });
  if (!res.ok) throw new Error("Export failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `campaign-${campaignId.slice(0, 10)}-analytics.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
