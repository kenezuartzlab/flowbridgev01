/**
 * B1 Gate 2 — frozen campaign model types.
 *
 * Campaign PTS is a SEPARATE currency from FLOW and from
 * legacy `profiles.flow_points`. Nothing in this layer awards FLOW or writes
 * to the Activity Registry.
 */
import type { Hex } from '../activity/activityIntent';
import type {
  VerifiedActivityKind,
  VerifiedActivityStatus,
} from '../activity/activityRepository';

export type { VerifiedActivityKind, VerifiedActivityStatus };

export type CampaignStatus = 'draft' | 'published' | 'archived';

/** Supported task rule types (frozen). */
export type CampaignRule =
  | { type: 'ACTIVITY_KIND'; kind: VerifiedActivityKind }
  | { type: 'SOURCE_CHAIN'; chainId: number }
  | { type: 'DESTINATION_CHAIN'; chainId: number }
  | { type: 'ACTION_TYPE'; actionType: Hex }
  | { type: 'TOKEN'; token: string }
  | { type: 'MIN_AMOUNT'; minAmountRaw: string }
  | { type: 'CAMPAIGN_ID'; campaignId: Hex };

export const CAMPAIGN_RULE_TYPES = [
  'ACTIVITY_KIND',
  'SOURCE_CHAIN',
  'DESTINATION_CHAIN',
  'ACTION_TYPE',
  'TOKEN',
  'MIN_AMOUNT',
  'CAMPAIGN_ID',
] as const;

export interface CampaignTask {
  campaignId: Hex;
  taskId: string;
  title: string;
  description?: string | null;
  /** Campaign PTS awarded per completion. Never FLOW. */
  points: number;
  /** Number of distinct qualifying activities needed for ONE completion. */
  requiredCount: number;
  /** Max completions per wallet. */
  completionLimitPerWallet: number;
  rules: CampaignRule[];
  sortOrder: number;
}

export interface Campaign {
  campaignId: Hex;
  slug: string;
  name: string;
  description?: string | null;
  status: CampaignStatus;
  /** Campaign window, epoch milliseconds. */
  startsAt: number;
  endsAt: number;
}

/**
 * Trusted facts about ONE verified activity. Optional facts are optional on
 * purpose: a rule that requires an absent fact FAILS CLOSED.
 */
export interface VerifiedActivityFacts {
  activityId: Hex;
  /** Wallet the verified activity is bound to (lowercased on compare). */
  wallet: string;
  kind: VerifiedActivityKind;
  status: VerifiedActivityStatus;
  sourceChainId: number;
  destinationChainId?: number;
  actionType?: Hex;
  token?: string;
  amountRaw?: bigint;
  campaignId?: Hex;
  /** Epoch ms the source event occurred. Required for windowed campaigns. */
  occurredAt?: number;
}

/** A deterministic completion produced by the engine (not yet persisted). */
export interface CampaignCompletionPlan {
  completionId: Hex;
  campaignId: Hex;
  taskId: string;
  wallet: string;
  /** Ascending, deduped activity ids consumed by this completion. */
  activityIds: Hex[];
  points: number;
}

export interface CampaignCompletionRecord extends CampaignCompletionPlan {
  completedAt: number;
}
