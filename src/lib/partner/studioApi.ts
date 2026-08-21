/**
 * FlowBridge V14 — browser client for the Partner Studio API.
 * Sends the Supabase bearer token plus the selected organization id. The server
 * treats the org id as a selector among the caller's memberships only.
 */
import { getIdToken } from "@/lib/auth";
import type { StudioCampaignInput } from "@/lib/campaign/campaignStudio";
import type {
  CampaignReviewEvent,
  PartnerCampaignSummary,
  PartnerMemberRole,
  PartnerOrg,
} from "./partnerTypes";

async function authHeaders(orgId?: string) {
  const token = await getIdToken();
  if (!token) throw new Error("Sign in first.");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
  };
  if (orgId) headers["x-org-id"] = orgId;
  return headers;
}

async function parse(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as any)?.error ?? `Request failed (${res.status})`);
  return json as any;
}

export async function fetchStudioSession(): Promise<{ orgs: PartnerOrg[]; email: string }> {
  const data = await parse(await fetch("/api/studio/session", { headers: await authHeaders() }));
  return { orgs: data.orgs ?? [], email: data.email ?? "" };
}

export async function applyForPartnerOrg(input: {
  name: string;
  slug: string;
  website?: string;
  description?: string;
}): Promise<PartnerOrg> {
  const data = await parse(
    await fetch("/api/studio/session", {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify(input),
    }),
  );
  return data.org as PartnerOrg;
}

export async function fetchStudioCampaigns(orgId: string): Promise<{
  campaigns: PartnerCampaignSummary[];
  role: PartnerMemberRole;
  org: PartnerOrg;
}> {
  const data = await parse(
    await fetch("/api/studio/campaigns", { headers: await authHeaders(orgId) }),
  );
  return { campaigns: data.campaigns ?? [], role: data.role, org: data.org };
}

export async function fetchStudioCampaign(
  orgId: string,
  campaignId: string,
): Promise<{
  summary: PartnerCampaignSummary;
  definition: StudioCampaignInput;
  reviewEvents: CampaignReviewEvent[];
}> {
  return parse(
    await fetch(`/api/studio/campaigns/${campaignId}`, { headers: await authHeaders(orgId) }),
  );
}

export async function saveStudioDraft(
  orgId: string,
  input: StudioCampaignInput & { rewardType?: string },
  campaignId?: string,
): Promise<PartnerCampaignSummary> {
  const data = await parse(
    await fetch(campaignId ? `/api/studio/campaigns/${campaignId}` : "/api/studio/campaigns", {
      method: campaignId ? "PUT" : "POST",
      headers: await authHeaders(orgId),
      body: JSON.stringify(input),
    }),
  );
  return data.campaign as PartnerCampaignSummary;
}

export async function submitStudioCampaign(
  orgId: string,
  campaignId: string,
  action: "submit" | "withdraw",
): Promise<PartnerCampaignSummary> {
  const data = await parse(
    await fetch(`/api/studio/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: await authHeaders(orgId),
      body: JSON.stringify({ action }),
    }),
  );
  return data.campaign as PartnerCampaignSummary;
}

export async function deleteStudioDraft(orgId: string, campaignId: string): Promise<void> {
  await parse(
    await fetch(`/api/studio/campaigns/${campaignId}`, {
      method: "DELETE",
      headers: await authHeaders(orgId),
    }),
  );
}
