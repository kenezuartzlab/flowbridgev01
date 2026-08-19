/**
 * Growth Hub V4 — browser client for the admin campaign definition API.
 * Every call carries the Supabase bearer token plus the connected wallet;
 * the server re-verifies both and re-validates the payload.
 */
import { getIdToken } from "@/lib/auth";
import type { StudioCampaignInput, StudioCampaignSummary } from "./campaignStudio";
import type { CampaignStatus } from "./campaignTypes";

async function headers(wallet: string) {
  const token = await getIdToken();
  if (!token) throw new Error("Sign in first.");
  return {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
    "x-wallet-address": wallet,
  };
}

async function parse(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error ?? `Request failed (${res.status})`);
  return json as any;
}

export async function fetchStudioCampaigns(wallet: string): Promise<StudioCampaignSummary[]> {
  const data = await parse(await fetch("/api/campaigns/admin", { headers: await headers(wallet) }));
  return data.campaigns as StudioCampaignSummary[];
}

export async function saveStudioCampaign(
  wallet: string,
  input: StudioCampaignInput,
): Promise<StudioCampaignSummary> {
  const url = input.campaignId
    ? `/api/campaigns/admin/${input.campaignId}`
    : "/api/campaigns/admin";
  const data = await parse(
    await fetch(url, {
      method: input.campaignId ? "PUT" : "POST",
      headers: await headers(wallet),
      body: JSON.stringify(input),
    }),
  );
  return data.campaign as StudioCampaignSummary;
}

export async function setStudioCampaignStatus(
  wallet: string,
  campaignId: string,
  status: CampaignStatus,
): Promise<StudioCampaignSummary> {
  const data = await parse(
    await fetch(`/api/campaigns/admin/${campaignId}`, {
      method: "PATCH",
      headers: await headers(wallet),
      body: JSON.stringify({ status }),
    }),
  );
  return data.campaign as StudioCampaignSummary;
}

export async function duplicateStudioCampaign(
  wallet: string,
  campaignId: string,
): Promise<StudioCampaignSummary> {
  const data = await parse(
    await fetch(`/api/campaigns/admin/${campaignId}`, {
      method: "PATCH",
      headers: await headers(wallet),
      body: JSON.stringify({ action: "duplicate" }),
    }),
  );
  return data.campaign as StudioCampaignSummary;
}

export async function deleteStudioCampaign(wallet: string, campaignId: string): Promise<void> {
  await parse(
    await fetch(`/api/campaigns/admin/${campaignId}`, {
      method: "DELETE",
      headers: await headers(wallet),
    }),
  );
}
