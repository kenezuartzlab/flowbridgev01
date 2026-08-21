/**
 * FlowBridge V14 — browser client for internal /sets partner governance.
 * Mirrors the existing admin API convention: bearer token + bound wallet.
 */
import { getIdToken } from "@/lib/auth";
import type { CampaignReviewState, CampaignRewardType, PartnerOrgStatus } from "./partnerTypes";

export interface GovernanceOrg {
  orgId: string;
  slug: string;
  name: string;
  website?: string | null;
  description?: string | null;
  status: PartnerOrgStatus;
  isSystem: boolean;
  riskNotes?: string | null;
  createdAt?: number;
  memberCount: number;
  campaignCount: number;
  liveCount: number;
  pendingReviewCount: number;
}

export interface GovernanceCampaign {
  campaignId: string;
  organizationId: string;
  orgName: string;
  orgStatus: PartnerOrgStatus;
  isSystemOrg: boolean;
  slug: string;
  name: string;
  description?: string | null;
  reviewState: CampaignReviewState;
  rewardType: CampaignRewardType;
  published: boolean;
  startsAt: number;
  endsAt: number;
  revision: number;
  reviewNote?: string | null;
  submittedAt?: number | null;
  totalPoints: number;
  taskCount: number;
  completionCount: number;
  rewardBlockReason: string | null;
  ruleSummary: string[];
}

export interface GovernanceAuditEvent {
  eventId: string;
  actorEmail?: string | null;
  actorRole: string;
  objectType: string;
  objectId: string;
  action: string;
  reason?: string | null;
  createdAt: number;
}

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

export async function fetchPartnerGovernance(wallet: string): Promise<{
  role: "super_admin" | "internal_operator";
  organizations: GovernanceOrg[];
  campaigns: GovernanceCampaign[];
  audit: GovernanceAuditEvent[];
}> {
  return parse(
    await fetch("/api/admin/partner-governance", { headers: await headers(wallet) }),
  );
}

export async function runCampaignGovernanceAction(
  wallet: string,
  campaignId: string,
  action: "approve" | "request_changes" | "publish" | "pause" | "end",
  note?: string,
): Promise<GovernanceCampaign> {
  const data = await parse(
    await fetch("/api/admin/partner-governance", {
      method: "POST",
      headers: await headers(wallet),
      body: JSON.stringify({ target: "campaign", id: campaignId, action, note }),
    }),
  );
  return data.campaign as GovernanceCampaign;
}

export async function runOrgGovernanceAction(
  wallet: string,
  orgId: string,
  action: "verify_org" | "reject_org" | "suspend_org" | "reinstate_org",
  note?: string,
): Promise<GovernanceOrg> {
  const data = await parse(
    await fetch("/api/admin/partner-governance", {
      method: "POST",
      headers: await headers(wallet),
      body: JSON.stringify({ target: "organization", id: orgId, action, note }),
    }),
  );
  return data.org as GovernanceOrg;
}
