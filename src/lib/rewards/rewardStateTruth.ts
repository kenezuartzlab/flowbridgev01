/**
 * FlowBridge V17.1B §1/§2/§4/§8 — the ONE canonical reward-state resolver (pure).
 *
 * Canonical rule, enforced here and nowhere else:
 *   flowPointsTotal != convertibleFlowPoints != claimableFlow != claimedFlow
 *   != walletFlow, and campaignPts NEVER enters any of them.
 *
 * This module is pure: no DB, no RPC, no keys, no authority. The server resolver
 * (`rewardState.server.ts`) feeds it canonical values; every surface — Home,
 * /earn, /rewards, the V16 Opportunity Engine and the V17 Mission Orchestrator —
 * reads the result instead of computing a "claimable" of its own.
 *
 * Fail-closed: an unreadable stage is `null`, never 0 and never an estimate, and
 * it always suppresses the next economic step.
 */

export const REWARD_STATE_SCHEMA_VERSION = "flowbridge.rewardstate/1" as const;
export const REWARD_STATE_POLICY_VERSION = "V17.1B" as const;

export type RewardStateReasonCode =
  | "READY_TO_CLAIM"
  | "CONVERSION_REQUIRED"
  | "CONVERSION_REQUIREMENTS_UNMET"
  | "BELOW_CONVERSION_MINIMUM"
  | "NO_CONVERTIBLE_OR_CLAIMABLE_FLOW"
  | "CHAIN_STATE_UNAVAILABLE"
  | "REWARD_STATE_UNAVAILABLE"
  | "CONVERSION_POLICY_NOT_APPROVED";

/** The single next economic step the whole product agrees on. */
export type RewardNextStep = "CLAIM_FLOW" | "CONVERT_FLOW_POINTS" | "NONE";

export interface RewardRequirement {
  id: string;
  label: string;
  met: boolean;
  hint?: string;
}

export interface RewardStateInput {
  chainId: number | null;
  observedAt: string;
  /** Off-chain FLOW Points balance shown to the user. */
  flowPointsTotal: number;
  /** Subset the server payout math says is eligible for explicit conversion. */
  eligibleFlowPoints: number;
  /** Minimum eligible points a single conversion requires. */
  conversionMinimum: number;
  requirements: readonly RewardRequirement[];
  /** On-chain claim entitlement delta (whole FLOW). `null` = unreadable. */
  claimableFlowRaw: number | null;
  /** Cumulative FLOW already delivered on chain. `null` = unreadable. */
  claimedFlow: number | null;
  /** Live ERC-20 FLOW wallet balance. `null` = unreadable. */
  walletFlow: number | null;
  /** Separate Campaign PTS ledger. Never converts, never claims. */
  campaignPts: number | null;
  conversionPolicyApproved: boolean;
  /** False when the reward ledger itself could not be read. */
  ledgerAvailable?: boolean;
}

export interface RewardStateCopy {
  /** Stage label for the primary balance, e.g. "FLOW Points". */
  stageLabel: string;
  /** Truthful readiness line, e.g. "1,006 ready to convert". */
  readiness: string;
  /** What the user does next, in product words. */
  nextAction: string;
}

export interface RewardState {
  schemaVersion: typeof REWARD_STATE_SCHEMA_VERSION;
  policyVersion: typeof REWARD_STATE_POLICY_VERSION;
  chainId: number | null;
  observedAt: string;
  freshness: "REALTIME" | "UNAVAILABLE";
  provenance: "LIVE" | "DEGRADED";
  flowPointsTotal: number;
  convertibleFlowPoints: number;
  claimableFlow: number | null;
  claimedFlow: number | null;
  walletFlow: number | null;
  campaignPts: number | null;
  conversionMinimum: number;
  requirements: readonly RewardRequirement[];
  requirementsMet: boolean;
  nextEconomicStep: RewardNextStep;
  reasonCodes: readonly RewardStateReasonCode[];
  copy: RewardStateCopy;
}

const whole = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
};

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * Deterministic stage resolution.
 *
 * Aggregation policy (V17.1B §10 case 4): when BOTH a positive on-chain
 * claimable delta and convertible points exist, the claim of the CURRENT
 * entitlement always comes first. Conversion never aggregates into a pending
 * claim, so a user can never be shown one number that mixes two stages.
 */
export function resolveRewardState(input: RewardStateInput): RewardState {
  const reasons: RewardStateReasonCode[] = [];
  const flowPointsTotal = whole(input.flowPointsTotal);
  const convertibleFlowPoints = whole(input.eligibleFlowPoints);
  const conversionMinimum = Math.max(0, Math.floor(Number(input.conversionMinimum) || 0));
  const campaignPts = input.campaignPts == null ? null : whole(input.campaignPts);
  const ledgerAvailable = input.ledgerAvailable !== false;

  const chainReadable =
    input.claimableFlowRaw != null && Number.isFinite(Number(input.claimableFlowRaw));
  const claimableFlow = chainReadable ? whole(input.claimableFlowRaw) : null;
  const claimedFlow = input.claimedFlow == null ? null : whole(input.claimedFlow);
  const walletFlow = input.walletFlow == null ? null : whole(input.walletFlow);

  const requirements = input.requirements.map((r) => ({ ...r }));
  const requirementsMet = requirements.every((r) => r.met);

  let nextEconomicStep: RewardNextStep = "NONE";

  if (!ledgerAvailable) {
    reasons.push("REWARD_STATE_UNAVAILABLE");
  } else if (!input.conversionPolicyApproved) {
    reasons.push("CONVERSION_POLICY_NOT_APPROVED");
  } else if (!chainReadable) {
    reasons.push("CHAIN_STATE_UNAVAILABLE");
  } else if ((claimableFlow ?? 0) > 0) {
    nextEconomicStep = "CLAIM_FLOW";
    reasons.push("READY_TO_CLAIM");
  } else if (convertibleFlowPoints > 0) {
    reasons.push("CONVERSION_REQUIRED");
    if (convertibleFlowPoints < conversionMinimum) {
      reasons.push("BELOW_CONVERSION_MINIMUM");
    } else if (!requirementsMet) {
      reasons.push("CONVERSION_REQUIREMENTS_UNMET");
    } else {
      nextEconomicStep = "CONVERT_FLOW_POINTS";
    }
  } else {
    reasons.push("NO_CONVERTIBLE_OR_CLAIMABLE_FLOW");
  }

  return {
    schemaVersion: REWARD_STATE_SCHEMA_VERSION,
    policyVersion: REWARD_STATE_POLICY_VERSION,
    chainId: input.chainId ?? null,
    observedAt: input.observedAt,
    freshness: chainReadable && ledgerAvailable ? "REALTIME" : "UNAVAILABLE",
    provenance: chainReadable && ledgerAvailable ? "LIVE" : "DEGRADED",
    flowPointsTotal,
    convertibleFlowPoints,
    claimableFlow,
    claimedFlow,
    walletFlow,
    campaignPts,
    conversionMinimum,
    requirements,
    requirementsMet,
    nextEconomicStep,
    reasonCodes: reasons,
    copy: rewardStateCopy({
      flowPointsTotal,
      convertibleFlowPoints,
      claimableFlow,
      claimedFlow,
      conversionMinimum,
      nextEconomicStep,
      reasons,
    }),
  };
}

/** §8 — the only place reward-stage wording is produced. */
function rewardStateCopy(s: {
  flowPointsTotal: number;
  convertibleFlowPoints: number;
  claimableFlow: number | null;
  claimedFlow: number | null;
  conversionMinimum: number;
  nextEconomicStep: RewardNextStep;
  reasons: readonly RewardStateReasonCode[];
}): RewardStateCopy {
  if (s.claimableFlow != null && s.claimableFlow > 0) {
    return {
      stageLabel: "FLOW ready to claim",
      readiness: `${fmt(s.claimableFlow)} FLOW ready to claim`,
      nextAction: "Sign the claim in your own wallet.",
    };
  }
  if (s.convertibleFlowPoints > 0) {
    const readiness = `${fmt(s.convertibleFlowPoints)} ready to convert`;
    if (s.reasons.includes("BELOW_CONVERSION_MINIMUM")) {
      return {
        stageLabel: "FLOW Points",
        readiness,
        nextAction: `Conversion needs at least ${fmt(s.conversionMinimum)} eligible FLOW Points.`,
      };
    }
    if (s.reasons.includes("CONVERSION_REQUIREMENTS_UNMET")) {
      return {
        stageLabel: "FLOW Points",
        readiness,
        nextAction: "Finish the conversion requirements to convert these FLOW Points.",
      };
    }
    return {
      stageLabel: "FLOW Points",
      readiness,
      nextAction: `Convert ${fmt(s.convertibleFlowPoints)} FLOW Points to claimable FLOW.`,
    };
  }
  if (s.reasons.includes("CHAIN_STATE_UNAVAILABLE") || s.reasons.includes("REWARD_STATE_UNAVAILABLE")) {
    return {
      stageLabel: "FLOW Points",
      readiness: "Reward state unavailable",
      nextAction: "We could not read your canonical reward state, so nothing is offered right now.",
    };
  }
  if (s.reasons.includes("CONVERSION_POLICY_NOT_APPROVED")) {
    return {
      stageLabel: "FLOW Points",
      readiness: "Conversion not available on this network",
      nextAction: "No approved conversion policy exists for this network.",
    };
  }
  return {
    stageLabel: "FLOW Points",
    readiness: (s.claimedFlow ?? 0) > 0 ? "All FLOW claimed" : "No FLOW ready to claim",
    nextAction: "Swap to accrue more FLOW Points.",
  };
}

export interface MissionPrerequisiteDecision {
  /** Insert CONVERT_FLOW_POINTS ahead of CLAIM_FLOW. */
  insertConversion: boolean;
  /** Claim is the next economic step right now. */
  claimReady: boolean;
  /** The mission must block; no amount may be invented. */
  blocked: boolean;
  reasonCode: RewardStateReasonCode;
  /** Canonical explanation — resolver output, never model inference. */
  explanation: string;
}

/** §4 — automatic prerequisite discovery. Discovery grants no authority. */
export function missionPrerequisiteDecision(state: RewardState): MissionPrerequisiteDecision {
  if (state.nextEconomicStep === "CLAIM_FLOW") {
    return {
      insertConversion: false,
      claimReady: true,
      blocked: false,
      reasonCode: "READY_TO_CLAIM",
      explanation: `Canonical reward state reports ${fmt(state.claimableFlow ?? 0)} FLOW claimable on chain ${state.chainId}, so the claim is prepared directly.`,
    };
  }
  if (state.nextEconomicStep === "CONVERT_FLOW_POINTS") {
    return {
      insertConversion: true,
      claimReady: false,
      blocked: false,
      reasonCode: "CONVERSION_REQUIRED",
      explanation: `Canonical reward state reports 0 FLOW claimable on chain but ${fmt(state.convertibleFlowPoints)} FLOW Points eligible for conversion, so a conversion step was inserted before the claim.`,
    };
  }
  const reasonCode: RewardStateReasonCode =
    state.reasonCodes.find((r) => r !== "READY_TO_CLAIM" && r !== "CONVERSION_REQUIRED") ??
    "NO_CONVERTIBLE_OR_CLAIMABLE_FLOW";
  const explanation =
    reasonCode === "NO_CONVERTIBLE_OR_CLAIMABLE_FLOW"
      ? "Canonical reward state reports no convertible FLOW Points and no claimable FLOW, so this mission is blocked and no amount is invented."
      : state.copy.nextAction;
  return { insertConversion: false, claimReady: false, blocked: true, reasonCode, explanation };
}

/** The exact confirmation copy for the off-chain conversion mutation (§5). */
export function conversionConfirmationCopy(state: Pick<RewardState, "convertibleFlowPoints">): {
  title: string;
  body: string;
  amount: number;
} {
  return {
    title: `Convert ${fmt(state.convertibleFlowPoints)} FLOW Points to claimable FLOW`,
    body: "This authorizes only the conversion. Your later on-chain FLOW claim and any stake each need their own separate confirmation, and Campaign PTS are never included.",
    amount: state.convertibleFlowPoints,
  };
}
