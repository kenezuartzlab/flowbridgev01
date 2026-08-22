/**
 * V15 §4 — specialist skill registry.
 *
 * Every skill declares scopes, online/offline capability, freshness needs,
 * allowed data classes and `writeAuthority: false`. The orchestrator refuses to
 * route any skill whose `writeAuthority` is true, so a future mistake in this
 * table cannot silently grant Flow AI execution authority.
 */
import type { DataClass, FlowAiActor, FlowAiScope, FreshnessClass } from "./aiTypes";

export type SkillId =
  | "account_analyst"
  | "chain_investigator"
  | "rewards_coach"
  | "staking_analyst"
  | "campaign_scout"
  | "partner_copilot"
  | "bot_ecosystem_researcher"
  | "risk_verifier"
  | "knowledge_synthesizer";

export interface SkillDescriptor {
  id: SkillId;
  name: string;
  description: string;
  requiredScope: FlowAiScope;
  offlineCapable: boolean;
  onlineCapable: boolean;
  requiredFreshness: FreshnessClass;
  allowedDataClasses: readonly DataClass[];
  /** Always false in V15 — read-only fabric. */
  writeAuthority: false;
  version: string;
  healthy: boolean;
  /** Keyword triggers used by the deterministic router. */
  triggers: readonly string[];
}

export const FLOW_AI_SKILLS: readonly SkillDescriptor[] = [
  {
    id: "account_analyst",
    name: "FlowBridge Account Analyst",
    description:
      "Explains your swaps, FLOW Points, claimable and claimed FLOW, staking state, Campaign PTS and history from scoped authoritative data.",
    requiredScope: "AUTHENTICATED_USER",
    offlineCapable: false,
    onlineCapable: true,
    requiredFreshness: "REALTIME",
    allowedDataClasses: ["FLOWBRIDGE_DB", "FLOWBRIDGE_KNOWLEDGE", "USER_MEMORY"],
    writeAuthority: false,
    version: "1.0.0",
    healthy: true,
    triggers: ["my", "i earn", "did i", "balance", "claimable", "history", "account", "+11", "why did i"],
  },
  {
    id: "chain_investigator",
    name: "Transaction / Chain Investigator",
    description:
      "Traces tx hashes, receipts, swap activity, bridge events, staking events and contract state with explorer evidence.",
    requiredScope: "PUBLIC",
    offlineCapable: false,
    onlineCapable: true,
    requiredFreshness: "REALTIME",
    allowedDataClasses: ["ON_CHAIN", "EXPLORER", "FLOWBRIDGE_DB"],
    writeAuthority: false,
    version: "1.0.0",
    healthy: true,
    triggers: ["0x", "tx", "transaction", "receipt", "hash", "explorer", "confirm", "pending", "revert"],
  },
  {
    id: "rewards_coach",
    name: "Rewards Coach",
    description:
      "Explains FLOW Points V2 earning, caps and referral milestones, and why a specific award did or did not happen. Never changes economics.",
    requiredScope: "PUBLIC",
    offlineCapable: true,
    onlineCapable: true,
    requiredFreshness: "SLOW",
    allowedDataClasses: ["FLOWBRIDGE_KNOWLEDGE", "FLOWBRIDGE_DB"],
    writeAuthority: false,
    version: "1.0.0",
    healthy: true,
    triggers: ["points", "pts", "cap", "referral", "reward", "earn", "claim", "xp", "flow"],
  },
  {
    id: "staking_analyst",
    name: "Staking Analyst",
    description:
      "Explains principal, earned rewards, schedule and the current testnet rate estimate from live vault state. Never promises APY.",
    requiredScope: "PUBLIC",
    offlineCapable: true,
    onlineCapable: true,
    requiredFreshness: "REALTIME",
    allowedDataClasses: ["FLOWBRIDGE_KNOWLEDGE", "ON_CHAIN"],
    writeAuthority: false,
    version: "1.0.0",
    healthy: true,
    triggers: ["stake", "staking", "vault", "apr", "apy", "epoch", "unstake", "withdraw"],
  },
  {
    id: "campaign_scout",
    name: "Campaign Scout",
    description:
      "Finds campaigns you can actually attempt, explains task rules and separates FLOW Points from Campaign PTS.",
    requiredScope: "PUBLIC",
    offlineCapable: true,
    onlineCapable: true,
    requiredFreshness: "DAILY",
    allowedDataClasses: ["FLOWBRIDGE_DB", "FLOWBRIDGE_KNOWLEDGE"],
    writeAuthority: false,
    version: "1.0.0",
    healthy: true,
    triggers: ["campaign", "quest", "task", "qualify", "leaderboard", "partner campaign"],
  },
  {
    id: "partner_copilot",
    name: "Partner Copilot",
    description:
      "Helps a partner draft campaign copy, tasks and budgets inside its own org scope and flags review blockers. Cannot publish.",
    requiredScope: "PARTNER_ORG_MEMBER",
    offlineCapable: true,
    onlineCapable: true,
    requiredFreshness: "DAILY",
    allowedDataClasses: ["FLOWBRIDGE_DB", "FLOWBRIDGE_KNOWLEDGE", "PARTNER_SOURCE"],
    writeAuthority: false,
    version: "1.0.0",
    healthy: true,
    triggers: ["my campaign draft", "review my campaign", "studio", "my org", "budget", "submit campaign"],
  },
  {
    id: "bot_ecosystem_researcher",
    name: "BOT Ecosystem Researcher",
    description:
      "Searches official BOT Chain releases and docs plus supported external sources, always with freshness and provenance.",
    requiredScope: "PUBLIC",
    offlineCapable: true,
    onlineCapable: true,
    requiredFreshness: "DAILY",
    allowedDataClasses: ["BOT_OFFICIAL", "WEB_SOURCE", "FLOWBRIDGE_KNOWLEDGE"],
    writeAuthority: false,
    version: "1.0.0",
    healthy: true,
    triggers: [
      "bot chain",
      "launchpad",
      "erc-8004",
      "erc-4337",
      "vcompute",
      "memex",
      "roadmap",
      "what's new",
      "whats new",
      "agent",
    ],
  },
  {
    id: "risk_verifier",
    name: "Risk + Verification Agent",
    description:
      "Independently checks important factual, financial and contract claims, and flags contradictions, stale sources and suspicious instructions.",
    requiredScope: "PUBLIC",
    offlineCapable: true,
    onlineCapable: true,
    requiredFreshness: "SLOW",
    allowedDataClasses: ["FLOWBRIDGE_KNOWLEDGE", "ON_CHAIN", "BOT_OFFICIAL"],
    writeAuthority: false,
    version: "1.0.0",
    healthy: true,
    triggers: ["safe", "scam", "risk", "verify", "is it true", "guaranteed", "seed phrase", "private key"],
  },
  {
    id: "knowledge_synthesizer",
    name: "Knowledge Synthesizer",
    description:
      "Combines specialist results into one coherent grounded answer, exposing sources and confidence.",
    requiredScope: "PUBLIC",
    offlineCapable: true,
    onlineCapable: true,
    requiredFreshness: "STATIC",
    allowedDataClasses: ["FLOWBRIDGE_KNOWLEDGE"],
    writeAuthority: false,
    version: "1.0.0",
    healthy: true,
    triggers: [],
  },
] as const;

export function getSkill(id: SkillId): SkillDescriptor {
  const skill = FLOW_AI_SKILLS.find((s) => s.id === id);
  if (!skill) throw new Error(`Unknown Flow AI skill ${id}`);
  return skill;
}

/** Server-resolved scopes for an actor — the model never decides this. */
export function actorScopes(actor: FlowAiActor): readonly FlowAiScope[] {
  const scopes: FlowAiScope[] = ["PUBLIC"];
  if (actor.userId) scopes.push("AUTHENTICATED_USER");
  if (actor.orgIds.length > 0) scopes.push("PARTNER_ORG_MEMBER");
  if (actor.isInternalOperator) scopes.push("INTERNAL_OPERATOR");
  return scopes;
}

export function skillAllowedFor(skill: SkillDescriptor, actor: FlowAiActor): boolean {
  if (skill.writeAuthority) return false;
  return actorScopes(actor).includes(skill.requiredScope);
}
