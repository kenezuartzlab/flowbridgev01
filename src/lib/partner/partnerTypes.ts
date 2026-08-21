/**
 * FlowBridge V14 — Partner Campaign Studio shared contract (browser-safe).
 *
 * This module owns the *policy*: who may cause which lifecycle transition, and
 * which reward types a partner may configure versus merely propose. The server
 * re-applies every rule here before any write; nothing is trusted from the
 * browser.
 */

export type PartnerMemberRole = 'partner_admin' | 'partner_editor' | 'partner_viewer';
export type PartnerOrgStatus = 'pending' | 'verified' | 'rejected' | 'suspended';

export type CampaignReviewState =
  | 'draft'
  | 'submitted'
  | 'changes_requested'
  | 'approved'
  | 'published'
  | 'paused'
  | 'ended';

export type CampaignRewardType = 'campaign_pts' | 'flow_points_bonus' | 'flow_token';

/** Actor classes recognised by the lifecycle machine. */
export type LifecycleActor =
  | 'partner_admin'
  | 'partner_editor'
  | 'partner_viewer'
  | 'internal'
  | 'super_admin';

export const PARTNER_MEMBER_ROLE_LABEL: Record<PartnerMemberRole, string> = {
  partner_admin: 'Org owner',
  partner_editor: 'Editor',
  partner_viewer: 'Viewer',
};

export interface PartnerOrg {
  orgId: string;
  slug: string;
  name: string;
  website?: string | null;
  description?: string | null;
  status: PartnerOrgStatus;
  isSystem: boolean;
  role?: PartnerMemberRole;
  createdAt?: number;
  riskNotes?: string | null;
}

export interface PartnerCampaignSummary {
  campaignId: string;
  organizationId: string;
  orgName?: string;
  slug: string;
  name: string;
  description?: string | null;
  reviewState: CampaignReviewState;
  rewardType: CampaignRewardType;
  /** Public availability flag consumed by Explore. */
  published: boolean;
  startsAt: number;
  endsAt: number;
  revision: number;
  reviewNote?: string | null;
  submittedAt?: number | null;
  updatedAt?: number;
  completionCount: number;
  taskCount: number;
  totalPoints: number;
  /** Declared Campaign PTS issuance bound for this campaign. */
  ptsBudget: number;
  /** Revision currently materialized into the canonical live campaign. */
  publishedRevision?: number | null;
}

export interface CampaignReviewEvent {
  eventId: string;
  campaignId: string;
  actorRole: string;
  action: string;
  fromState?: CampaignReviewState | null;
  toState?: CampaignReviewState | null;
  note?: string | null;
  revision: number;
  createdAt: number;
}

/* ------------------------------- lifecycle -------------------------------- */

/** Partner-editable states. Anything else is frozen for the partner. */
export const PARTNER_EDITABLE_STATES: CampaignReviewState[] = ['draft', 'changes_requested'];

export interface LifecycleTransition {
  action: string;
  from: CampaignReviewState[];
  to: CampaignReviewState;
  actors: LifecycleActor[];
  /** Sets/clears the public `status` used by Explore. */
  publishes?: boolean;
  unpublishes?: boolean;
}

export const LIFECYCLE_TRANSITIONS: LifecycleTransition[] = [
  { action: 'submit', from: ['draft', 'changes_requested'], to: 'submitted', actors: ['partner_admin'] },
  { action: 'withdraw', from: ['submitted'], to: 'draft', actors: ['partner_admin'] },
  {
    action: 'request_changes',
    from: ['submitted', 'approved'],
    to: 'changes_requested',
    actors: ['internal', 'super_admin'],
  },
  { action: 'approve', from: ['submitted'], to: 'approved', actors: ['internal', 'super_admin'] },
  {
    action: 'publish',
    from: ['approved', 'paused'],
    to: 'published',
    actors: ['internal', 'super_admin'],
    publishes: true,
  },
  {
    action: 'pause',
    from: ['published'],
    to: 'paused',
    actors: ['internal', 'super_admin'],
    unpublishes: true,
  },
  {
    action: 'end',
    from: ['published', 'paused', 'approved'],
    to: 'ended',
    actors: ['internal', 'super_admin'],
    unpublishes: true,
  },
];

export function findTransition(action: string, from: CampaignReviewState) {
  return LIFECYCLE_TRANSITIONS.find((t) => t.action === action && t.from.includes(from));
}

/** Single source of truth for "may this actor cause this transition now?". */
export function canTransition(
  action: string,
  from: CampaignReviewState,
  actor: LifecycleActor,
): boolean {
  const t = findTransition(action, from);
  return !!t && t.actors.includes(actor);
}

/* ---------------------------- reward authority ---------------------------- */

/**
 * V14 launch boundary: Campaign PTS is the only partner-configurable reward.
 * Everything else may be *proposed* but can never reach a published state
 * without explicit internal budget authority, which V14 does not grant.
 */
export const PARTNER_CONFIGURABLE_REWARD_TYPES: CampaignRewardType[] = ['campaign_pts'];

export const REWARD_TYPE_LABEL: Record<CampaignRewardType, string> = {
  campaign_pts: 'Campaign PTS',
  flow_points_bonus: 'FLOW Points bonus (request)',
  flow_token: 'FLOW token reward (request)',
};

export function isRewardTypePartnerConfigurable(type: CampaignRewardType): boolean {
  return PARTNER_CONFIGURABLE_REWARD_TYPES.includes(type);
}

/** Fail closed: publishing a non-PTS reward type is impossible in V14. */
export function rewardTypeBlocksPublish(type: CampaignRewardType): string | null {
  if (type === 'campaign_pts') return null;
  return `${REWARD_TYPE_LABEL[type]} requires an explicit FlowBridge budget authorization. It cannot be approved or published in this release.`;
}

/* ------------------------------ role helpers ------------------------------ */

export function canSubmit(role: PartnerMemberRole): boolean {
  return role === 'partner_admin';
}

export function canEditDrafts(role: PartnerMemberRole): boolean {
  return role === 'partner_admin' || role === 'partner_editor';
}

/** Viewers are read-only: dashboards and review history, never a write. */
export function isReadOnlyRole(role: PartnerMemberRole): boolean {
  return role === 'partner_viewer';
}

export function canManageMembers(role: PartnerMemberRole): boolean {
  return role === 'partner_admin';
}

/** Suspended / unverified orgs may never reach review. */
export function orgMayOperate(status: PartnerOrgStatus): boolean {
  return status === 'verified';
}

export const REVIEW_STATE_LABEL: Record<CampaignReviewState, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  published: 'Live',
  paused: 'Paused',
  ended: 'Ended',
};

export const ORG_STATUS_LABEL: Record<PartnerOrgStatus, string> = {
  pending: 'Pending verification',
  verified: 'Verified',
  rejected: 'Rejected',
  suspended: 'Suspended',
};

export const PARTNER_ORG_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,46}$/;

export function normalizeOrgSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 47);
}

export function validateOrgApplication(input: {
  name: string;
  slug: string;
  website?: string | null;
  description?: string | null;
}): string[] {
  const errors: string[] = [];
  if (!input.name?.trim()) errors.push('Organization name is required.');
  if (input.name && input.name.trim().length > 80) errors.push('Organization name is too long (max 80).');
  if (!PARTNER_ORG_SLUG_RE.test(input.slug ?? '')) {
    errors.push('Handle must be lowercase letters, numbers and dashes (2-47 chars).');
  }
  if (input.website) {
    try {
      const url = new URL(input.website);
      if (!['http:', 'https:'].includes(url.protocol)) errors.push('Website must be an http(s) URL.');
    } catch {
      errors.push('Website must be a valid URL.');
    }
  }
  if (input.description && input.description.length > 600) {
    errors.push('Description is too long (max 600).');
  }
  return errors;
}
