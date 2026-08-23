/**
 * FlowBridge V24 §1/§7/§15/§16 — the frozen FLOW AI Intelligence Foundation.
 *
 * This module is the single place that declares:
 *  - the frozen foundation version (V15 → V24) and the evaluation-suite version;
 *  - the authority matrix (§1) as machine-checkable data, not prose;
 *  - the pinned model/provider configuration recorded in evaluation telemetry.
 *
 * Nothing here performs I/O. It is imported by both server surfaces and tests so
 * a version drift is a test failure rather than a silent production change.
 */
import { ACTION_INTENT_SCHEMA_VERSION, ACTION_POLICY_VERSION } from "../actionIntent";
import { MISSION_SCHEMA_VERSION, MISSION_POLICY_VERSION } from "../mission/missionTypes";
import { MISSION_TEMPLATE_VERSION } from "../opportunity/missionTemplates";
import { DECISION_SCHEMA_VERSION, DECISION_POLICY_VERSION } from "../decision/decisionTypes";
import { SCENARIO_SCHEMA_VERSION, SCENARIO_POLICY_VERSION } from "../scenario/scenarioTypes";
import { FEDERATION_ADAPTER_VERSION } from "../federation/skillFederationRegistry";

/** §16 — the frozen foundation identity. Changing this is an architecture change. */
export const AI_FOUNDATION_VERSION = "flowbridge.ai-foundation/V15-V24" as const;
/** §2/§15 — the versioned evaluation harness that guards the foundation. */
export const EVAL_SUITE_VERSION = "flowbridge.ai-eval/1" as const;
export const HARDENING_POLICY_VERSION = "V24" as const;

/** §7 — pinned reasoning model. A change must re-run the invariant suite. */
export const PINNED_MODEL_ID = "google/gemini-2.5-flash" as const;
export const PINNED_MODEL_PROVIDER = "lovable-ai-gateway" as const;

/**
 * §1 — the authority matrix. `mayNever` entries are asserted by the invariant
 * suite against the real modules, so a layer cannot quietly gain authority.
 */
export interface AuthorityLayer {
  layer: string;
  may: readonly string[];
  mayNever: readonly string[];
  /** Can this layer write economic state (mission/intent/tx) directly? */
  economicWriteAuthority: false | "MISSION_ON_EXPLICIT_USER_INITIATION" | "ACTION_INTENT_PREPARATION";
  /** Can this layer sign or submit a transaction? Always false except WALLET. */
  signingAuthority: boolean;
}

export const AUTHORITY_MATRIX: readonly AuthorityLayer[] = [
  {
    layer: "INTELLIGENCE_V15_V23",
    may: ["read", "reason", "rank", "simulate", "plan", "explain"],
    mayNever: ["invent canonical economics", "execute silently"],
    economicWriteAuthority: false,
    signingAuthority: false,
  },
  {
    layer: "OPPORTUNITY_V16_V18",
    may: ["resolve canonical opportunities", "compile typed mission plans"],
    mayNever: ["accept external or model economics as authority"],
    economicWriteAuthority: "MISSION_ON_EXPLICIT_USER_INITIATION",
    signingAuthority: false,
  },
  {
    layer: "MISSION_ACTION_V17_V15_3",
    may: ["prepare one eligible action", "verify canonical settlement"],
    mayNever: ["sign or submit on behalf of the wallet"],
    economicWriteAuthority: "ACTION_INTENT_PREPARATION",
    signingAuthority: false,
  },
  {
    layer: "WALLET",
    may: ["explicitly authorize a user transaction"],
    mayNever: ["prove settlement by signature or tx hash alone"],
    economicWriteAuthority: false,
    signingAuthority: true,
  },
  {
    layer: "CANONICAL_VERIFIER",
    may: ["confirm receipt, event and state"],
    mayNever: ["trust prose, click, intent or hash without evidence"],
    economicWriteAuthority: false,
    signingAuthority: false,
  },
] as const;

/** §7/§9 — component versions recorded on every evaluation and telemetry row. */
export function componentVersions() {
  return {
    foundation: AI_FOUNDATION_VERSION,
    evalSuite: EVAL_SUITE_VERSION,
    hardening: HARDENING_POLICY_VERSION,
    actionIntent: `${ACTION_INTENT_SCHEMA_VERSION} (${ACTION_POLICY_VERSION})`,
    mission: `${MISSION_SCHEMA_VERSION} (${MISSION_POLICY_VERSION})`,
    missionTemplate: MISSION_TEMPLATE_VERSION,
    decision: `${DECISION_SCHEMA_VERSION} (${DECISION_POLICY_VERSION})`,
    scenario: `${SCENARIO_SCHEMA_VERSION} (${SCENARIO_POLICY_VERSION})`,
    federationAdapter: FEDERATION_ADAPTER_VERSION,
    model: `${PINNED_MODEL_PROVIDER}:${PINNED_MODEL_ID}`,
  } as const;
}

/**
 * §7 — capability classes an external provider may ever expose. Anything not
 * listed fails closed, so a provider upgrade cannot add tools or write paths.
 */
export const ALLOWED_EXTERNAL_CAPABILITY_KINDS = [
  "PROTOCOL_READ",
  "MARKET_READ",
  "GENERAL_ANALYSIS",
] as const;

export function isAllowedExternalCapability(kind: string): boolean {
  return (ALLOWED_EXTERNAL_CAPABILITY_KINDS as readonly string[]).includes(kind);
}
