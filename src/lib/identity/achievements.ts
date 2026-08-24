/**
 * FlowBridge V29 §3 — achievements as RECOGNITION, never as money (pure).
 *
 * Each achievement is unlocked only by a fact the existing product can already
 * prove. Unlocking or viewing one creates no FLOW, no FLOW Points, no Campaign
 * PTS, no claim entitlement and no staking reward. Where a real campaign reward
 * exists, it stays inside the campaign rules and its own verification path.
 */
import type { ParticipationFacts } from "./participationProfile";

export const ACHIEVEMENT_SCHEMA_VERSION = "flowbridge.achievements/1" as const;
export const ACHIEVEMENT_POLICY_VERSION = "V29" as const;

export const ACHIEVEMENT_NOTE =
  "Achievements are recognition for activity FlowBridge verified. They never add FLOW, FLOW Points or Campaign PTS by themselves.";

export type AchievementId =
  | "VERIFIED_ACCOUNT"
  | "FIRST_SWAP"
  | "FIRST_BRIDGE"
  | "FIRST_CAMPAIGN"
  | "FIRST_CLAIM"
  | "FIRST_STAKE"
  | "MISSION_COMPLETED"
  | "RETURNING_PARTICIPANT";

export interface AchievementDefinition {
  id: AchievementId;
  title: string;
  /** Plain-English meaning. */
  body: string;
  /** The verified evidence required — shown to the user. */
  evidence: string;
  /** Deterministic unlock test over verified facts only. */
  earned: (f: ParticipationFacts) => boolean;
  /** Safe to include on a shared card. */
  shareable: boolean;
}

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    id: "VERIFIED_ACCOUNT",
    title: "Verified account",
    body: "Your email is confirmed and a wallet is bound to this account.",
    evidence: "Email confirmation plus a bound wallet on your FlowBridge account.",
    earned: (f) => f.signedIn && f.emailVerified && f.walletBound,
    shareable: true,
  },
  {
    id: "FIRST_SWAP",
    title: "First swap",
    body: "You completed a swap and FlowBridge recorded it.",
    evidence: "At least one recorded swap in your FlowBridge records.",
    earned: (f) => f.swaps > 0,
    shareable: true,
  },
  {
    id: "FIRST_BRIDGE",
    title: "First bridge",
    body: "You moved value across supported ecosystems with FlowBridge.",
    evidence: "At least one recorded bridge in your FlowBridge records.",
    earned: (f) => f.bridges > 0,
    shareable: true,
  },
  {
    id: "FIRST_CAMPAIGN",
    title: "First campaign completion",
    body: "A campaign task of yours was verified and completed.",
    evidence: "At least one verified campaign task completion.",
    earned: (f) => f.campaignCompletions > 0,
    shareable: true,
  },
  {
    id: "FIRST_CLAIM",
    title: "First FLOW claim",
    body: "You claimed FLOW through the existing rewards flow.",
    evidence: "FLOW recorded as claimed on your account.",
    earned: (f) => f.claimedFlow > 0,
    shareable: true,
  },
  {
    id: "FIRST_STAKE",
    title: "First stake",
    body: "You staked FLOW under the published staking rules.",
    evidence: "At least one recorded staking action.",
    earned: (f) => f.stakes > 0,
    shareable: true,
  },
  {
    id: "MISSION_COMPLETED",
    title: "Mission completed",
    body: "You finished a guided mission end to end, with verified evidence for each step.",
    evidence: "A mission stored as completed with its verified evidence.",
    earned: (f) => f.missionsCompleted > 0,
    shareable: true,
  },
  {
    id: "RETURNING_PARTICIPANT",
    title: "Returning participant",
    body: "You came back and stayed active on more than one day.",
    evidence: "Verified records on two or more separate days.",
    earned: (f) => f.activeDays >= 2,
    shareable: true,
  },
];

export interface AchievementView {
  id: AchievementId;
  title: string;
  body: string;
  evidence: string;
  earned: boolean;
  shareable: boolean;
}

export interface AchievementsView {
  schemaVersion: typeof ACHIEVEMENT_SCHEMA_VERSION;
  policyVersion: typeof ACHIEVEMENT_POLICY_VERSION;
  items: readonly AchievementView[];
  earned: readonly AchievementView[];
  locked: readonly AchievementView[];
  earnedCount: number;
  total: number;
  note: string;
  /** V29 §14 — asserted constants. */
  grantsFlow: false;
  grantsFlowPoints: false;
  grantsCampaignPts: false;
  createsActionIntent: false;
}

export function resolveAchievements(f: ParticipationFacts): AchievementsView {
  const items = ACHIEVEMENTS.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    evidence: a.evidence,
    // Nothing is ever earned for a signed-out visitor: there is no evidence.
    earned: f.signedIn && a.earned(f),
    shareable: a.shareable,
  }));
  const earned = items.filter((i) => i.earned);
  return {
    schemaVersion: ACHIEVEMENT_SCHEMA_VERSION,
    policyVersion: ACHIEVEMENT_POLICY_VERSION,
    items,
    earned,
    locked: items.filter((i) => !i.earned),
    earnedCount: earned.length,
    total: items.length,
    note: ACHIEVEMENT_NOTE,
    grantsFlow: false,
    grantsFlowPoints: false,
    grantsCampaignPts: false,
    createsActionIntent: false,
  };
}
