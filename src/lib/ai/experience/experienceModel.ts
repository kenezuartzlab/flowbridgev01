/**
 * FlowBridge V25 — Flow AI Experience Layer (presentation model).
 *
 * Pure, dependency-free mapping from the FROZEN V22 decision result into the
 * product experience described in V25 §1–§3, §8 and §14. This module adds no
 * economic authority: it only chooses copy, hierarchy and evidence language for
 * facts the server already resolved. It never computes an amount, never invents
 * urgency, and never marks anything actionable that the server did not.
 */
import type { DecisionItem, DecisionReasonCode, DecisionResult } from "../decision/decisionTypes";

export const EXPERIENCE_LAYER_VERSION = "flowbridge.ai-experience/V25" as const;

/** V25 §1 — the five user states the whole experience is designed around. */
export type ExperienceState =
  | "SIGNED_OUT"
  | "NEW_OR_QUIET"
  | "ACTIVE_MISSION"
  | "ACTIONABLE"
  | "NOTHING_ACTIONABLE";

/** V25 §8/§12 — one shared visual/semantic vocabulary across every surface. */
export type EvidenceLevel = "VERIFIED" | "EXTERNAL" | "PREVIEW";

export type ExperienceStatus =
  | "VERIFIED"
  | "EXTERNAL"
  | "PREVIEW"
  | "BLOCKED"
  | "WAITING_FOR_USER"
  | "VERIFYING"
  | "COMPLETED";

/** V25 §2 — plain language for inspectable reason codes. No internal jargon. */
const REASON_COPY: Record<DecisionReasonCode, string> = {
  CONTINUE_ACTIVE_MISSION: "You already started this",
  READY_TO_CLAIM: "Ready to claim now",
  IDLE_FLOW_AVAILABLE: "You hold FLOW that is doing nothing",
  PREREQUISITE_FOR_STAKING: "Needed before you can stake",
  ACTIVE_MISSION_BLOCKER: "Something is holding your mission up",
  TIME_SENSITIVE: "This one ends soon",
  CANONICAL_FRESH_EVIDENCE: "Checked against fresh FlowBridge data",
  RECENTLY_COMPLETED_SIMILAR: "You did something similar recently",
  USER_PREFERS_STAKING: "Matches your saved preference for staking",
  USER_PREFERS_LOW_INTERACTION: "Kept short because you prefer fewer steps",
  STALE_OR_LOW_CONFIDENCE: "Shown with lower confidence",
  DUPLICATE_OF_ACTIVE_MISSION: "Already covered by your active mission",
  EQUIVALENT_ACTION_GROUPED: "Grouped with an equivalent action",
  DISMISSED_BY_USER: "You dismissed this",
  SNOOZED_BY_USER: "You snoozed this",
  REPEAT_SUPPRESSED: "Hidden because nothing changed",
  BLOCKED_PREREQUISITE: "Something must happen first",
  NOT_ACTIONABLE_INFORMATIONAL: "Good to know — nothing to do",
};

export function plainReason(code: DecisionReasonCode): string {
  return REASON_COPY[code] ?? "Relevant to your account right now";
}

export function plainReasons(codes: readonly DecisionReasonCode[], max = 2): string[] {
  return codes.slice(0, max).map(plainReason);
}

/** V25 §8 — canonical data is never presented like external or preview data. */
export function evidenceLevel(item: DecisionItem): EvidenceLevel {
  if (item.provenance === "LIVE" || item.provenance === "CACHED") return "VERIFIED";
  return "PREVIEW";
}

export function evidenceLabel(level: EvidenceLevel): string {
  if (level === "VERIFIED") return "Verified by FlowBridge";
  if (level === "EXTERNAL") return "External insight";
  return "Preview / estimate";
}

/** V25 §2 — the primary status a card should wear in its first frame. */
export function itemStatus(item: DecisionItem): ExperienceStatus {
  if (item.blocked) return "BLOCKED";
  if (item.kind === "CONTINUE_MISSION" && item.requiresWalletConfirmation) return "WAITING_FOR_USER";
  if (!item.actionable) return "PREVIEW";
  return evidenceLevel(item) === "VERIFIED" ? "VERIFIED" : "PREVIEW";
}

/** V25 §2 — one dominant CTA per card, in the user's words. */
export function primaryCta(item: DecisionItem): string {
  if (item.kind === "CONTINUE_MISSION") return "Continue mission";
  if (item.blocked) return "See what's needed";
  if (!item.actionable) return "Learn more";
  return item.surface.label;
}

/**
 * V25 §3/§14 — the same economic action must never appear twice on Home. The
 * server already suppresses duplicates; this is a belt-and-braces presentation
 * guard keyed on the destination surface plus canonical domain.
 */
function dedupeKey(item: DecisionItem): string {
  if (item.kind === "CONTINUE_MISSION") return `mission:${item.missionId ?? item.id}`;
  return `${item.domain ?? "GENERAL"}|${item.surface.href}`;
}

export function dedupeItems(items: readonly DecisionItem[]): DecisionItem[] {
  const seen = new Set<string>();
  const out: DecisionItem[] = [];
  for (const item of items) {
    const key = dedupeKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export interface ExperienceSummary {
  state: ExperienceState;
  /** Short, honest headline. Never a chatbot greeting, never fake urgency. */
  headline: string;
  subline: string;
  /** The single dominant item, or null when nothing is actionable. */
  primary: DecisionItem | null;
  /** Visually subordinate insights. */
  secondary: DecisionItem[];
  /** True when the server itself reported degraded/partial intelligence. */
  degraded: boolean;
  notice: string | null;
}

export function resolveExperience(input: {
  decision: DecisionResult | null;
  signedIn: boolean;
  hiddenIds?: readonly string[];
}): ExperienceSummary {
  const { decision, signedIn } = input;
  const hidden = new Set(input.hiddenIds ?? []);
  const items = dedupeItems((decision?.items ?? []).filter((i) => !hidden.has(i.id)));
  const degraded = decision?.status === "DEGRADED";
  const notice = decision?.notice ?? null;

  if (!signedIn) {
    return {
      state: "SIGNED_OUT",
      headline: "See what FlowBridge can do",
      subline:
        "Prices, markets and campaigns are open to read. Signing in lets Flow AI check your rewards, staking and missions — signing stays with your wallet.",
      primary: null,
      secondary: items,
      degraded,
      notice,
    };
  }

  if (items.length === 0) {
    return {
      state: decision ? "NOTHING_ACTIONABLE" : "NEW_OR_QUIET",
      headline: decision ? "Nothing needs you right now" : "Getting to know your account",
      subline: decision
        ? notice ??
          "No claimable rewards, no active mission and nothing time-sensitive. Swap, stake or explore campaigns whenever you like."
        : "Swap on BOT Chain to earn FLOW Points, stake FLOW to earn, or ask Flow AI what is live today.",
      primary: null,
      secondary: [],
      degraded,
      notice,
    };
  }

  const mission = items.find((i) => i.kind === "CONTINUE_MISSION") ?? null;
  const primary = mission ?? items[0]!;
  const secondary = items.filter((i) => i.id !== primary.id);

  if (mission) {
    return {
      state: "ACTIVE_MISSION",
      headline: mission.requiresWalletConfirmation
        ? "Your mission needs one action"
        : "Your mission is in progress",
      subline: mission.whatNext,
      primary,
      secondary,
      degraded,
      notice,
    };
  }

  const count = items.length;
  return {
    state: "ACTIONABLE",
    headline: count === 1 ? "One thing worth checking" : `${count} things worth checking`,
    subline: primary.whyNow,
    primary,
    secondary,
    degraded,
    notice,
  };
}

/**
 * V25 §4 — contextual quick prompts derived from real state. Generic prompts are
 * a fallback only, and no prompt ever implies Flow AI can execute anything.
 */
export const GENERIC_PROMPTS = [
  "What can FlowBridge do for me?",
  "What's actually live on BOT Chain today?",
  "How do FLOW Points work?",
  "How do I bridge USDT from BOT to BNB?",
] as const;

export function contextualPrompts(decision: DecisionResult | null): string[] {
  if (!decision) return [...GENERIC_PROMPTS];
  const prompts: string[] = [];
  const items = dedupeItems(decision.items);
  const mission = items.find((i) => i.kind === "CONTINUE_MISSION");
  if (mission) {
    prompts.push("Continue my mission");
    prompts.push("What does my mission still need from me?");
  }
  if (items.some((i) => i.domain === "REWARDS")) prompts.push("Explain this reward");
  if (items.some((i) => i.domain === "STAKING")) prompts.push("Compare my options before I stake");
  if (items.length > 0) prompts.push("What should I do now?");
  if (decision.completedMissionCount > 0) prompts.push("What did my last mission actually do?");
  for (const g of GENERIC_PROMPTS) {
    if (prompts.length >= 4) break;
    if (!prompts.includes(g)) prompts.push(g);
  }
  return prompts.slice(0, 4);
}
