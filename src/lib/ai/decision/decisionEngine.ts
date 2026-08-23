/**
 * FlowBridge V22 §2/§4/§5/§10/§11 — the PURE personalized decision engine.
 *
 * No network, no storage, no clock of its own. Given canonical V16
 * opportunities, read-only mission context, presentation state and opt-in
 * preference signals, it produces a bounded ranked decision result with
 * inspectable reason codes.
 *
 * Hard boundaries enforced here:
 *  - every economic value is copied verbatim from `economicSnapshot`;
 *  - preferences change ORDER and COPY only, never any amount/contract/fee;
 *  - an ACTIVE mission suppresses duplicate "do this now" recommendations and
 *    surfaces "continue your mission" instead — it never creates a mission;
 *  - stale canonical evidence is downgraded and never actionable.
 */
import type {
  OpportunityDomain,
  RankedOpportunity,
} from "../opportunity/opportunityTypes";
import { opportunitySupportsMission } from "../opportunity/missionTemplates";
import {
  DECISION_DEFAULT_LIMIT,
  DECISION_POLICY_VERSION,
  DECISION_SCHEMA_VERSION,
  type DecisionEngineInput,
  type DecisionFact,
  type DecisionItem,
  type DecisionMissionContext,
  type DecisionReasonCode,
  type DecisionResult,
  type DecisionSuppressedItem,
} from "./decisionTypes";

/** Non-urgent repeat bound (V22 §11): same seen item cools down for 12h. */
const REPEAT_COOLDOWN_MS = 12 * 60 * 60 * 1000;
const RECENTLY_COMPLETED_MS = 24 * 60 * 60 * 1000;
/** A dismissal hides the same identity for a week, then it may resurface. */
const DISMISS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const ACTIVE_STATUSES = new Set(["PLANNED", "ACTIVE", "PAUSED", "BLOCKED"]);

/** Deterministic grouping key for "the same economic action" (V22 §11). */
export function economicActionKey(item: { domain: string; type: string }): string {
  const t = item.type.toUpperCase();
  if (t === "CLAIM_FLOW") return "REWARDS:CLAIM_FLOW";
  if (t === "START_STAKING" || t === "CLAIM_STAKING_REWARD") return "STAKING:STAKE_OR_STAKE_REWARD";
  return `${item.domain}:${t}`.toUpperCase();
}

function missionCoversDomain(mission: DecisionMissionContext, domain: OpportunityDomain): boolean {
  return mission.domains.includes(domain);
}

/** Canonical facts only — copied, never derived. */
function factsFor(item: RankedOpportunity): DecisionFact[] {
  const out: DecisionFact[] = [];
  for (const [key, raw] of Object.entries(item.economicSnapshot)) {
    if (raw === null || raw === undefined) continue;
    out.push({ label: key, value: String(raw), source: "CANONICAL_SNAPSHOT" });
    if (out.length >= 6) break;
  }
  return out;
}

function walletConfirmationFor(item: RankedOpportunity): boolean {
  return item.preparableAction !== null;
}

function whatNextFor(item: RankedOpportunity, blocked: boolean): string {
  if (blocked) return "Nothing is submitted. FlowBridge re-checks this before anything can be prepared.";
  if (item.preparableAction) {
    return "FlowBridge prepares a typed plan you review, then your own wallet must confirm it. Nothing is signed for you.";
  }
  return "This is explanation only — continuing just opens the related FlowBridge page.";
}

interface Scored {
  item: RankedOpportunity;
  score: number;
  parts: string[];
  codes: DecisionReasonCode[];
  blocked: boolean;
  blockerText: string | null;
}

export function runDecisionEngine(input: DecisionEngineInput): DecisionResult {
  const now = input.now ?? new Date();
  const limit = Math.min(6, Math.max(1, input.limit ?? DECISION_DEFAULT_LIMIT));
  const states = new Map(input.viewStates.map((s) => [s.key, s]));

  const activeMissions = input.missions.filter((m) => ACTIVE_STATUSES.has(m.status));
  const completedMissions = input.missions.filter((m) => m.status === "COMPLETED");

  const suppressed: DecisionSuppressedItem[] = [];
  const scored: Scored[] = [];

  const hasClaimable = input.opportunities.some(
    (o) => o.type === "CLAIM_FLOW" && Number(o.economicSnapshot["claimableFlow"] ?? 0) > 0,
  );
  const hasStakingItem = input.opportunities.some((o) => o.domain === "STAKING");

  for (const item of input.opportunities) {
    const state = states.get(item.id);
    const codes: DecisionReasonCode[] = [];
    const parts: string[] = [];
    let score = item.score;
    parts.push(`canonical+${item.score}`);

    /** §5/§10 — duplicate of an active mission: suppress the "do it now" card. */
    const dupMission = activeMissions.find((m) => missionCoversDomain(m, item.domain));
    if (dupMission) {
      suppressed.push({
        id: item.id,
        title: item.title,
        reasonCodes: ["DUPLICATE_OF_ACTIVE_MISSION"],
        explanation: `An active mission already covers this: ${dupMission.goalText}. The opportunity stays canonically valid.`,
      });
      continue;
    }

    /** §7 — presentation-only suppression. Never an economic invalidation. */
    if (state?.snoozedUntil && new Date(state.snoozedUntil).getTime() > now.getTime()) {
      suppressed.push({
        id: item.id,
        title: item.title,
        reasonCodes: ["SNOOZED_BY_USER"],
        explanation: "You snoozed this. It is still a valid canonical opportunity.",
      });
      continue;
    }
    /**
     * Dismissal is keyed to the opportunity IDENTITY, which is a hash of the
     * underlying canonical condition — a materially different condition yields a
     * new id and reappears. `createdAt` is re-stamped on every resolve, so it
     * must never gate the dismissal.
     */
    if (
      state?.dismissedAt &&
      now.getTime() - new Date(state.dismissedAt).getTime() < DISMISS_WINDOW_MS
    ) {
      suppressed.push({
        id: item.id,
        title: item.title,
        reasonCodes: ["DISMISSED_BY_USER"],
        explanation: "You dismissed this view. The underlying opportunity is unchanged and still valid.",
      });
      continue;
    }

    /** §7 — stale canonical evidence is downgraded, never executed. */
    let blocked = false;
    let blockerText: string | null = null;
    if (new Date(item.staleAfter).getTime() <= now.getTime() || item.provenance === "DEGRADED") {
      blocked = true;
      blockerText = "Canonical evidence for this item is stale — FlowBridge must refresh it before anything can be prepared.";
      codes.push("STALE_OR_LOW_CONFIDENCE");
      score -= 60;
      parts.push("stale-60");
    } else {
      codes.push("CANONICAL_FRESH_EVIDENCE");
    }

    if (item.type === "CLAIM_FLOW" && Number(item.economicSnapshot["claimableFlow"] ?? 0) > 0) {
      codes.push("READY_TO_CLAIM");
      score += 25;
      parts.push("readyToClaim+25");
      if (hasStakingItem) {
        codes.push("PREREQUISITE_FOR_STAKING");
        score += 15;
        parts.push("prerequisite+15");
      }
    }

    if (item.domain === "STAKING" && item.type === "START_STAKING") {
      codes.push("IDLE_FLOW_AVAILABLE");
      if (hasClaimable) {
        // The claim is the prerequisite: staking waits behind it, deterministically.
        score -= 20;
        parts.push("awaitsPrerequisite-20");
      }
    }

    if (item.expiresAt) {
      const hours = (new Date(item.expiresAt).getTime() - now.getTime()) / 3_600_000;
      if (hours > 0 && hours <= 48) {
        codes.push("TIME_SENSITIVE");
        score += 12;
        parts.push("timeSensitive+12");
      }
    }

    /** §5 — completed history reduces repetition; it never permanently hides. */
    const recentSimilar = completedMissions.find(
      (m) =>
        missionCoversDomain(m, item.domain) &&
        m.completedAt !== null &&
        now.getTime() - new Date(m.completedAt).getTime() <= RECENTLY_COMPLETED_MS,
    );
    if (recentSimilar) {
      codes.push("RECENTLY_COMPLETED_SIMILAR");
      score -= 12;
      parts.push("recentlyCompleted-12");
    }

    /** §11 — bound how often the same non-urgent item reappears. */
    if (
      !codes.includes("TIME_SENSITIVE") &&
      item.priority !== "CRITICAL" &&
      state?.lastSeenAt &&
      now.getTime() - new Date(state.lastSeenAt).getTime() < REPEAT_COOLDOWN_MS &&
      new Date(item.createdAt).getTime() <= new Date(state.lastSeenAt).getTime()
    ) {
      codes.push("REPEAT_SUPPRESSED");
      score -= 10;
      parts.push("repeatCooldown-10");
    }

    /** §6 — opt-in preference signals: ordering and copy only. */
    if (input.preferences.optedIn) {
      if (input.preferences.prefersStaking && item.domain === "STAKING") {
        codes.push("USER_PREFERS_STAKING");
        score += 10;
        parts.push("prefStaking+10");
      }
      if (input.preferences.prefersRewards && item.domain === "REWARDS") {
        score += 6;
        parts.push("prefRewards+6");
      }
      if (input.preferences.prefersLowInteraction && !walletConfirmationFor(item)) {
        codes.push("USER_PREFERS_LOW_INTERACTION");
        score += 6;
        parts.push("prefLowInteraction+6");
      }
    }

    if (blocked) codes.push("BLOCKED_PREREQUISITE");
    if (!item.preparableAction && !blocked) codes.push("NOT_ACTIONABLE_INFORMATIONAL");

    scored.push({ item, score, parts, codes, blocked, blockerText });
  }

  /** §11 — deterministic grouping of equivalent economic actions. */
  const bestByAction = new Map<string, Scored>();
  for (const entry of scored) {
    const key = economicActionKey(entry.item);
    const current = bestByAction.get(key);
    if (
      !current ||
      entry.score > current.score ||
      (entry.score === current.score && entry.item.id.localeCompare(current.item.id) < 0)
    ) {
      if (current) {
        suppressed.push({
          id: current.item.id,
          title: current.item.title,
          reasonCodes: ["EQUIVALENT_ACTION_GROUPED"],
          explanation: "Grouped with an equivalent economic action already shown.",
        });
      }
      bestByAction.set(key, entry);
    } else {
      suppressed.push({
        id: entry.item.id,
        title: entry.item.title,
        reasonCodes: ["EQUIVALENT_ACTION_GROUPED"],
        explanation: "Grouped with an equivalent economic action already shown.",
      });
    }
  }

  const ordered = [...bestByAction.values()].sort(
    (a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id),
  );

  const items: DecisionItem[] = [];

  /** §10 — continue an existing mission ahead of competing duplicates. */
  const continueMission = [...activeMissions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() || a.id.localeCompare(b.id),
  )[0];
  if (continueMission) {
    const codes: DecisionReasonCode[] = ["CONTINUE_ACTIVE_MISSION"];
    if (continueMission.status === "BLOCKED") codes.push("ACTIVE_MISSION_BLOCKER");
    items.push({
      kind: "CONTINUE_MISSION",
      id: `mission:${continueMission.id}`,
      opportunityId: null,
      missionId: continueMission.id,
      rank: 1,
      score: 1000,
      scoreParts: ["activeMission+1000"],
      reasonCodes: codes,
      title: "Continue your mission",
      what: continueMission.goalText,
      whyNow:
        continueMission.status === "BLOCKED"
          ? `This mission is waiting on: ${continueMission.blockingReason ?? "a prerequisite"}.`
          : `You are ${continueMission.percent}% through this plan${continueMission.currentStepTitle ? ` — next: ${continueMission.currentStepTitle}` : ""}.`,
      whatNext: continueMission.currentStepRequiresWallet
        ? "The next step needs your own wallet confirmation. FlowBridge prepares it; you sign it."
        : continueMission.hasPendingWalletStep
          ? "FlowBridge re-checks canonical state for the next step; a later step will still need your own wallet confirmation."
          : "FlowBridge re-checks canonical state for the next step. Nothing is signed automatically.",
      requiresWalletConfirmation:
        continueMission.currentStepRequiresWallet || continueMission.hasPendingWalletStep,
      actionable: true,
      blocked: continueMission.status === "BLOCKED",
      blockerText: continueMission.status === "BLOCKED" ? continueMission.blockingReason : null,
      domain: null,
      provenance: "LIVE",
      expiresAt: null,
      containsPrivateEvidence: true,
      freshness: "REALTIME",
      surface: { label: "Open mission", href: "/assistant" },
      facts: [
        { label: "missionStatus", value: continueMission.status, source: "MISSION_STATE" },
        { label: "progressPercent", value: String(continueMission.percent), source: "MISSION_STATE" },
      ],
      evidenceRefs: [],
      supportsMission: false,
    });
  }

  for (const entry of ordered) {
    if (items.length >= limit) {
      suppressed.push({
        id: entry.item.id,
        title: entry.item.title,
        reasonCodes: ["REPEAT_SUPPRESSED"],
        explanation: "Below the top-N cut for this frame. Still canonically valid.",
      });
      continue;
    }
    const item = entry.item;
    items.push({
      kind: "OPPORTUNITY",
      id: item.id,
      opportunityId: item.id,
      missionId: null,
      rank: items.length + 1,
      score: entry.score,
      scoreParts: entry.parts,
      reasonCodes: entry.codes,
      title: item.title,
      what: item.title,
      whyNow: entry.blocked ? (entry.blockerText as string) : item.reason,
      whatNext: whatNextFor(item, entry.blocked),
      requiresWalletConfirmation: walletConfirmationFor(item),
      actionable: !entry.blocked && !!item.preparableAction,
      blocked: entry.blocked,
      blockerText: entry.blockerText,
      domain: item.domain,
      provenance: item.provenance,
      expiresAt: item.expiresAt,
      containsPrivateEvidence: item.containsPrivateEvidence,
      freshness: item.evidenceRefs[0]?.freshness ?? "UNKNOWN",
      surface: item.recommendedSurface,
      facts: factsFor(item),
      evidenceRefs: item.evidenceRefs,
      supportsMission: !entry.blocked && opportunitySupportsMission(item),
    });
  }

  // Ranks are assigned after the mission card so they stay 1..n contiguous.
  const ranked = items.map((it, i) => ({ ...it, rank: i + 1 }));

  const anyActionable = ranked.some((i) => i.actionable);
  const status: DecisionResult["status"] =
    ranked.length === 0 || !anyActionable
      ? "NOTHING_ACTIONABLE"
      : input.degradedDomains.length > 0
        ? "DEGRADED"
        : "OK";

  return {
    schemaVersion: DECISION_SCHEMA_VERSION,
    policyVersion: DECISION_POLICY_VERSION,
    requestId: input.requestId,
    actorScopes: input.actorScopes,
    generatedAt: now.toISOString(),
    evidenceFreshness: [...new Set(ranked.map((i) => i.freshness))],
    items: ranked,
    suppressed,
    memoryUsed: input.preferences.optedIn && input.preferences.usedKeys.length > 0,
    preferenceKeysUsed: input.preferences.usedKeys,
    activeMissionIds: activeMissions.map((m) => m.id),
    completedMissionCount: completedMissions.length,
    degradedDomains: input.degradedDomains,
    status,
    notice:
      status === "NOTHING_ACTIONABLE"
        ? "Nothing needs your wallet right now. FlowBridge will not invent a recommendation — here is read-only context instead."
        : input.degradedDomains.length > 0
          ? "Some canonical sources are unavailable, so nothing is shown for them and no values are estimated."
          : null,
    executed: false,
    createdActionIntent: false,
    missionsCreated: 0,
  };
}
