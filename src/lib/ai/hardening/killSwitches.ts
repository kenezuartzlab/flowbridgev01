/**
 * FlowBridge V24 §8/§11 — per-layer kill switches.
 *
 * Every non-canonical intelligence layer can be disabled independently without
 * breaking Trade, Earn, Stake, Rewards or Mission history. Canonical layers
 * (opportunities, missions, action intents, settlement verification) have NO
 * kill switch here — they are the product, not an enhancement.
 */
export const INTELLIGENCE_LAYERS = [
  "FEDERATION",
  "DELIBERATION",
  "PERSONALIZATION",
  "SCENARIO",
] as const;

export type IntelligenceLayer = (typeof INTELLIGENCE_LAYERS)[number];

const ENV_FLAG: Record<IntelligenceLayer, string> = {
  FEDERATION: "FLOW_AI_FEDERATION_ENABLED",
  DELIBERATION: "FLOW_AI_DELIBERATION_ENABLED",
  PERSONALIZATION: "FLOW_AI_PERSONALIZATION_ENABLED",
  SCENARIO: "FLOW_AI_SCENARIOS_ENABLED",
};

export type EnvLike = Record<string, string | undefined>;

function readEnv(env?: EnvLike): EnvLike {
  if (env) return env;
  return typeof process !== "undefined" && process.env ? (process.env as EnvLike) : {};
}

function isOff(raw: string | undefined): boolean {
  if (typeof raw !== "string") return false;
  const v = raw.trim().toLowerCase();
  return v === "false" || v === "0" || v === "off" || v === "disabled";
}

/** Layers default ON; an explicit falsey env flag turns one off. */
export function isLayerEnabled(layer: IntelligenceLayer, env?: EnvLike): boolean {
  const e = readEnv(env);
  if (isOff(e[ENV_FLAG[layer]])) return false;
  /** Deliberation is a federation consumer: it cannot outlive federation. */
  if (layer === "DELIBERATION" && isOff(e[ENV_FLAG.FEDERATION])) return false;
  return true;
}

/** Snapshot for telemetry and the acceptance report. */
export function killSwitchSnapshot(env?: EnvLike): Record<IntelligenceLayer, boolean> {
  return {
    FEDERATION: isLayerEnabled("FEDERATION", env),
    DELIBERATION: isLayerEnabled("DELIBERATION", env),
    PERSONALIZATION: isLayerEnabled("PERSONALIZATION", env),
    SCENARIO: isLayerEnabled("SCENARIO", env),
  };
}

/** Canonical product surfaces are never gated by an intelligence kill switch. */
export const CANONICAL_SURFACES_ALWAYS_AVAILABLE = [
  "TRADE",
  "EARN",
  "STAKE",
  "REWARDS",
  "MISSION_HISTORY",
] as const;
