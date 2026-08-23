/**
 * FlowBridge V18 §4 — the Opportunity → Mission template registry.
 *
 * PURE, client-safe module. This registry — never a model, never client input —
 * is the authority for which opportunities may become executable Mission plans
 * and which typed V17 outcome they compile to.
 *
 * Hard rules encoded here:
 *  - Only already-proven primitives are supported: CLAIM_FLOW, STAKE_FLOW and
 *    CLAIM_THEN_STAKE. An opportunity that cannot be represented by one of them
 *    is explanation-only; it never becomes a generic free-form economic mission.
 *  - No mutable economics (claimable amount, balance, fee, allowance, APY) is
 *    ever carried from opportunity presentation into a template. Templates carry
 *    outcome shape and chain constraint only; every amount is re-resolved by the
 *    frozen V17 pipeline at execution time.
 */
import type { MissionOutcome } from "../mission/missionTypes";

export const MISSION_TEMPLATE_VERSION = "flowbridge.mission-template/1" as const;

export type MissionTemplateId = "CLAIM_FLOW" | "STAKE_FLOW" | "CLAIM_THEN_STAKE";

export interface MissionTemplate {
  id: MissionTemplateId;
  version: typeof MISSION_TEMPLATE_VERSION;
  outcome: MissionOutcome;
  /** Deterministic goal sentence shown to the user before anything is prepared. */
  goalText: string;
  /** Portion of the verified upstream result to stake, when a stake leg exists. */
  stakePortionPercent: number | null;
  /** Slots the user must still supply before the plan can become executable. */
  requiresUserInput: readonly ("amount" | "chain")[];
  /** Plain-language summary of what the mission would do. */
  summary: string;
}

/** Opportunity identities V18 knows how to compile, keyed `DOMAIN:TYPE`. */
const SUPPORTED_OPPORTUNITY_KINDS = ["REWARDS:CLAIM_FLOW", "STAKING:START_STAKING"] as const;

export type SupportedOpportunityKind = (typeof SUPPORTED_OPPORTUNITY_KINDS)[number];

export function opportunityKind(input: { domain: string; type: string }): string {
  return `${input.domain}:${input.type}`.toUpperCase();
}

/**
 * §3 — a Build Mission control may only be offered when the opportunity maps to
 * a supported typed template. Used identically by Home "For you now", the
 * Assistant and any future opportunity surface.
 */
export function opportunitySupportsMission(input: { domain: string; type: string }): boolean {
  return (SUPPORTED_OPPORTUNITY_KINDS as readonly string[]).includes(opportunityKind(input));
}

/**
 * Resolves the typed template for an opportunity.
 *
 * `stakingAvailable` is a canonical, server-resolved boolean (vault reachable
 * and not paused). It only decides plan SHAPE — it contributes no amount.
 */
export function templateForOpportunity(input: {
  domain: string;
  type: string;
  stakingAvailable: boolean;
}): MissionTemplate | null {
  const kind = opportunityKind(input);

  if (kind === "REWARDS:CLAIM_FLOW") {
    if (input.stakingAvailable) {
      return {
        id: "CLAIM_THEN_STAKE",
        version: MISSION_TEMPLATE_VERSION,
        outcome: "CLAIM_THEN_STAKE",
        goalText: "Claim my FLOW rewards and stake the claimed FLOW",
        stakePortionPercent: 100,
        requiresUserInput: [],
        summary:
          "Claim your canonical FLOW payout with your own wallet, then stake exactly the verified claimed amount. The stake amount stays unresolved until the claim is canonically verified.",
      };
    }
    return {
      id: "CLAIM_FLOW",
      version: MISSION_TEMPLATE_VERSION,
      outcome: "CLAIM_ONLY",
      goalText: "Claim my FLOW rewards",
      stakePortionPercent: null,
      requiresUserInput: [],
      summary:
        "Claim your canonical FLOW payout with your own wallet. The claim amount is re-resolved from the ledger at preparation time.",
    };
  }

  if (kind === "STAKING:START_STAKING") {
    return {
      id: "STAKE_FLOW",
      version: MISSION_TEMPLATE_VERSION,
      outcome: "STAKE_ONLY",
      goalText: "Stake FLOW in the vault",
      stakePortionPercent: null,
      /** No amount is ever inferred from the opportunity card. */
      requiresUserInput: ["amount"],
      summary:
        "Stake FLOW in the canonical vault. You tell the mission the exact amount — it is never copied from the opportunity card — and you sign the stake yourself.",
    };
  }

  return null;
}

/** §5 — machine-readable compile outcomes shared by the server and the UI. */
export const MISSION_COMPILE_CODES = [
  "COMPILED",
  "EXISTING_ACTIVE_MISSION",
  "UNSUPPORTED_OPPORTUNITY",
  "NO_LONGER_ACTIONABLE",
  "OPPORTUNITY_CHANGED",
  "NOT_SIGNED_IN",
  "COMPILE_FAILED",
] as const;

export type MissionCompileCode = (typeof MISSION_COMPILE_CODES)[number];

/** Provenance persisted on every compiled mission (§3/§10). */
export interface MissionSource {
  opportunityId: string;
  opportunityKind: string;
  templateId: MissionTemplateId;
  templateVersion: typeof MISSION_TEMPLATE_VERSION;
  compiledAt: string;
}
