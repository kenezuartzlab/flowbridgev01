/**
 * V15 §2/§3 — Flow AI orchestrator: intent → mode → skill plan → scope gate.
 *
 * Pure and deterministic. It never calls a model; the server calls this to build
 * a plan, executes only the allowed skills, then runs the evidence verifier
 * before any answer is returned.
 */
import type { EvidenceItem, FlowAiActor, FlowAiMode } from "./aiTypes";
import { actorScopes, FLOW_AI_SKILLS, skillAllowedFor, type SkillDescriptor, type SkillId } from "./skillRegistry";
import { classifyActionIntent } from "./actionBoundary";

export type FlowAiIntent =
  | "ACCOUNT_STATE"
  | "TX_EVIDENCE"
  | "REWARDS"
  | "STAKING"
  | "CAMPAIGNS"
  | "PARTNER_DRAFT"
  | "BOT_ECOSYSTEM"
  | "SAFETY"
  | "PRODUCT_HOWTO"
  /** V15.3A — imperative request routed to bounded action preparation. */
  | "ACTION_PREPARATION";

export interface OrchestrationRequest {
  question: string;
  actor: FlowAiActor;
  /** Set false when live retrieval is unavailable (offline mode). */
  online: boolean;
  requestId: string;
}

export interface SkillPlanEntry {
  skillId: SkillId;
  reason: string;
  /** Skills allowed by scope but requiring live data are dropped when offline. */
  degradedOffline: boolean;
}

export interface OrchestrationPlan {
  requestId: string;
  intent: FlowAiIntent;
  mode: FlowAiMode;
  skills: readonly SkillPlanEntry[];
  /** Skills matched but refused, with the reason (audited, shown as a notice). */
  refused: readonly { skillId: SkillId; reason: string }[];
  /** True when the user asked Flow AI to DO something it may not do. */
  actionRequested: boolean;
  actionNotice: string | null;
  scopes: readonly string[];
}

const INTENT_RULES: readonly { intent: FlowAiIntent; skill: SkillId }[] = [
  { intent: "ACCOUNT_STATE", skill: "account_analyst" },
  { intent: "TX_EVIDENCE", skill: "chain_investigator" },
  { intent: "REWARDS", skill: "rewards_coach" },
  { intent: "STAKING", skill: "staking_analyst" },
  { intent: "CAMPAIGNS", skill: "campaign_scout" },
  { intent: "PARTNER_DRAFT", skill: "partner_copilot" },
  { intent: "BOT_ECOSYSTEM", skill: "bot_ecosystem_researcher" },
  { intent: "SAFETY", skill: "risk_verifier" },
];

function matchScore(skill: SkillDescriptor, q: string): number {
  let score = 0;
  for (const t of skill.triggers) if (q.includes(t)) score += t.length > 4 ? 3 : 2;
  return score;
}

export function classifyIntent(question: string): FlowAiIntent {
  const q = question.toLowerCase();
  if (/0x[a-f0-9]{20,}/i.test(question)) return "TX_EVIDENCE";
  const ranked = INTENT_RULES.map((r) => ({
    ...r,
    score: matchScore(FLOW_AI_SKILLS.find((s) => s.id === r.skill)!, q),
  })).sort((a, b) => b.score - a.score);
  if (ranked[0].score === 0) return "PRODUCT_HOWTO";
  // "my"/"i" phrasing about state prefers the account analyst.
  if (/\b(my|i)\b/.test(q) && /(point|pts|claim|balance|earn|stake|history)/.test(q)) {
    return "ACCOUNT_STATE";
  }
  return ranked[0].intent;
}

export function selectMode(input: {
  intent: FlowAiIntent;
  online: boolean;
  skills: readonly SkillDescriptor[];
}): FlowAiMode {
  if (!input.online) return "OFFLINE";
  const needsLive = input.skills.some((s) => s.requiredFreshness === "REALTIME");
  const hasOfflineKnowledge = input.skills.some((s) => s.offlineCapable);
  if (needsLive && hasOfflineKnowledge) return "HYBRID";
  if (needsLive) return "ONLINE";
  return "HYBRID";
}

export function planRequest(req: OrchestrationRequest): OrchestrationPlan {
  const intent = classifyIntent(req.question);
  const q = req.question.toLowerCase();

  const primaryId = INTENT_RULES.find((r) => r.intent === intent)?.skill;
  const candidateIds = new Set<SkillId>();
  if (primaryId) candidateIds.add(primaryId);

  // Secondary specialists by trigger match (multi-skill routing).
  for (const s of FLOW_AI_SKILLS) {
    if (s.id === "knowledge_synthesizer") continue;
    if (matchScore(s, q) >= 3) candidateIds.add(s.id);
  }
  // The verifier always participates, and the synthesizer always closes.
  candidateIds.add("risk_verifier");

  const skills: SkillPlanEntry[] = [];
  const refused: { skillId: SkillId; reason: string }[] = [];

  for (const id of candidateIds) {
    const skill = FLOW_AI_SKILLS.find((s) => s.id === id)!;
    if (skill.writeAuthority) {
      refused.push({ skillId: id, reason: "skill declares write authority — refused by policy" });
      continue;
    }
    if (!skill.healthy) {
      refused.push({ skillId: id, reason: "skill unhealthy" });
      continue;
    }
    if (!skillAllowedFor(skill, req.actor)) {
      refused.push({
        skillId: id,
        reason:
          skill.requiredScope === "AUTHENTICATED_USER"
            ? "sign in required for your private FlowBridge data"
            : skill.requiredScope === "PARTNER_ORG_MEMBER"
              ? "partner organization membership required"
              : "internal operator scope required",
      });
      continue;
    }
    const degradedOffline = !req.online && !skill.offlineCapable;
    if (degradedOffline) {
      refused.push({ skillId: id, reason: "live data unavailable offline" });
      continue;
    }
    skills.push({
      skillId: id,
      reason: id === primaryId ? `primary specialist for ${intent}` : "supporting specialist",
      degradedOffline,
    });
  }

  skills.push({ skillId: "knowledge_synthesizer", reason: "final synthesis", degradedOffline: false });

  const action = classifyActionIntent(req.question);
  const selected = skills
    .map((s) => FLOW_AI_SKILLS.find((f) => f.id === s.skillId)!)
    .filter(Boolean);

  return {
    requestId: req.requestId,
    intent,
    mode: selectMode({ intent, online: req.online, skills: selected }),
    skills,
    refused,
    actionRequested: action.actionRequested,
    actionNotice: action.notice,
    scopes: actorScopes(req.actor),
  };
}

/** Audit record — no secrets, no raw private values, no model chain-of-thought. */
export interface FlowAiAuditRecord {
  requestId: string;
  at: string;
  intent: FlowAiIntent;
  mode: FlowAiMode;
  skillPlan: readonly SkillId[];
  refused: readonly SkillId[];
  sourceClasses: readonly string[];
  freshness: readonly string[];
  confidence: string;
  actionRequested: boolean;
  answerChars: number;
}

export function buildAuditRecord(input: {
  plan: OrchestrationPlan;
  evidence: readonly EvidenceItem[];
  confidence: string;
  answer: string;
  at?: Date;
}): FlowAiAuditRecord {
  return {
    requestId: input.plan.requestId,
    at: (input.at ?? new Date()).toISOString(),
    intent: input.plan.intent,
    mode: input.plan.mode,
    skillPlan: input.plan.skills.map((s) => s.skillId),
    refused: input.plan.refused.map((r) => r.skillId),
    sourceClasses: [...new Set(input.evidence.map((e) => e.dataClass))],
    freshness: [...new Set(input.evidence.map((e) => e.freshness))],
    confidence: input.confidence,
    actionRequested: input.plan.actionRequested,
    answerChars: input.answer.length,
  };
}
