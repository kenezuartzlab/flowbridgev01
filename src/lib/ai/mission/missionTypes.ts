/**
 * FlowBridge V17 §1 — the canonical Mission model.
 *
 * A Mission is a PLAN, never authority. It cannot sign, submit, auto-approve,
 * auto-swap, auto-stake, claim, publish, bridge or mutate admin state. Every
 * economic step must re-enter the frozen V15.3 ActionIntent pipeline and receive
 * independent user-wallet authorization, and progress may only advance from
 * canonical verified outcomes (never from assistant prose or a click).
 *
 * Pure module: types, constants and the transition table only.
 */
import type { ActionIntentType } from "../actionIntent";
import type { EvidenceItem } from "../aiTypes";

export const MISSION_SCHEMA_VERSION = "flowbridge.mission/1" as const;
export const MISSION_POLICY_VERSION = "V17" as const;

/** A mission is a long-lived plan, but its economics are always re-resolved. */
export const MISSION_TTL_MS = 24 * 60 * 60 * 1000;

export const MISSION_STATUSES = [
  "DRAFT",
  "PLANNED",
  "ACTIVE",
  "PAUSED",
  "BLOCKED",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];

export const MISSION_STEP_STATES = [
  "DRAFT",
  "PLANNED",
  "READY",
  "WAITING_FOR_USER",
  "WAITING_FOR_CONFIRMATION",
  "COMPLETED",
  "BLOCKED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type MissionStepState = (typeof MISSION_STEP_STATES)[number];

const STEP_TRANSITIONS: Record<MissionStepState, readonly MissionStepState[]> = {
  DRAFT: ["PLANNED", "CANCELLED"],
  // COMPLETED direct from PLANNED covers non-economic checks and conditional
  // steps that turn out not to be needed (e.g. allowance already sufficient).
  PLANNED: ["READY", "COMPLETED", "BLOCKED", "CANCELLED", "EXPIRED"],
  READY: ["WAITING_FOR_USER", "BLOCKED", "CANCELLED", "EXPIRED", "PLANNED"],
  WAITING_FOR_USER: ["WAITING_FOR_CONFIRMATION", "PLANNED", "BLOCKED", "CANCELLED", "EXPIRED"],
  WAITING_FOR_CONFIRMATION: ["COMPLETED", "BLOCKED", "EXPIRED", "CANCELLED"],
  COMPLETED: [],
  BLOCKED: ["PLANNED", "READY", "CANCELLED", "EXPIRED"],
  CANCELLED: [],
  EXPIRED: ["PLANNED", "CANCELLED"],
};

export function canStepTransition(from: MissionStepState, to: MissionStepState): boolean {
  return STEP_TRANSITIONS[from].includes(to);
}

/** Step kinds the planner may emit. Nothing here can be executed by Flow AI. */
export const MISSION_STEP_TYPES = [
  "CHECK_WALLET_CHAIN",
  "PREPARE_SWAP",
  "USER_APPROVAL_IF_REQUIRED",
  "USER_SWAP",
  "VERIFY_SWAP",
  "RESOLVE_ACTUAL_OUTPUT",
  "PREPARE_STAKE",
  "USER_STAKE",
  "VERIFY_STAKE",
  /**
   * V17.1B §4 — automatic prerequisite: an explicit, user-confirmed off-chain
   * conversion of eligible FLOW Points into claimable FLOW. It is NOT a wallet
   * signature and it is never implicit.
   */
  "CONVERT_FLOW_POINTS",
  "PREPARE_CLAIM",
  "USER_CLAIM",
  "VERIFY_CLAIM",
  "COMPLETE_CAMPAIGN_TASK",
] as const;

export type MissionStepType = (typeof MISSION_STEP_TYPES)[number];

/** Steps that require the user's own wallet signature. */
export const WALLET_STEP_TYPES: readonly MissionStepType[] = [
  "USER_APPROVAL_IF_REQUIRED",
  "USER_SWAP",
  "USER_STAKE",
  "USER_CLAIM",
];

/** Steps that build an ActionIntent through the frozen V15.3 pipeline. */
export const PREPARE_STEP_TYPES: Record<string, ActionIntentType | undefined> = {
  PREPARE_SWAP: "SWAP",
  PREPARE_STAKE: "STAKE_FLOW",
  PREPARE_CLAIM: "CLAIM_FLOW",
};

/** V17 §10 — capabilities that may NEVER become a mission step. */
export const FORBIDDEN_MISSION_CAPABILITIES = [
  "TREASURY",
  "ADMIN",
  "REWARD_SIGNER",
  "PARTNER_REVIEWER",
  "KEY_CUSTODY",
] as const;

/** V17 §9 — machine-readable failure classes. */
export const MISSION_FAILURE_CLASSES = [
  "EVIDENCE_UNAVAILABLE",
  "UNSUPPORTED_ROUTE",
  "INSUFFICIENT_BALANCE",
  "INSUFFICIENT_GAS",
  "ALLOWANCE_REQUIRED",
  "SIMULATION_REVERT",
  "INTENT_EXPIRED",
  "TX_REJECTED",
  "TX_REVERTED",
  "CONFIRMATION_PENDING",
  "VERIFICATION_MISMATCH",
  /** V17.1B §7 — canonical reward-state failures. */
  "NO_CLAIMABLE_FLOW",
  "NO_CONVERTIBLE_OR_CLAIMABLE_FLOW",
  "CONVERSION_REQUIRED",
  "CONVERSION_REQUIREMENTS_UNMET",
  "REWARD_STATE_UNAVAILABLE",
] as const;

export type MissionFailureClass = (typeof MISSION_FAILURE_CLASSES)[number];

export type MissionOutcome =
  | "SWAP_THEN_STAKE"
  | "CLAIM_THEN_STAKE"
  | "SWAP_ONLY"
  | "STAKE_ONLY"
  | "CLAIM_ONLY"
  | "CAMPAIGNS_NO_SPEND";

/** Explicit user limits. They bound planning; they never replace wallet consent. */
export interface MissionConstraints {
  maxSpend: { amount: string; symbol: string } | null;
  maxSlippageBps: number | null;
  targetChainId: number | null;
  stakePortionPercent: number | null;
  neverBridge: boolean;
  noTokenSpend: boolean;
}

export const EMPTY_CONSTRAINTS: MissionConstraints = {
  maxSpend: null,
  maxSlippageBps: null,
  targetChainId: null,
  stakePortionPercent: null,
  neverBridge: false,
  noTokenSpend: false,
};

/** The typed goal produced by deterministic normalization (never by a model). */
export interface MissionGoal {
  outcome: MissionOutcome;
  chainId: number;
  assetInSymbol: string | null;
  assetOutSymbol: string | null;
  /** Exact user-supplied amount. Vague sizes ("small") never become an amount. */
  amount: string | null;
  /** Slots genuinely required before planning can produce an executable step. */
  missingSlots: readonly ("amount" | "chain")[];
  constraints: MissionConstraints;
  /** Human-readable recognition trail shown in the mission card. */
  recognized: readonly string[];
}

export interface MissionStep {
  id: string;
  type: MissionStepType;
  title: string;
  /** Step ids that must be COMPLETED first. */
  dependencies: readonly string[];
  state: MissionStepState;
  /** Evidence classes this step needs before it may become READY. */
  requiredEvidence: readonly string[];
  /** Planned, non-authoritative inputs. Re-resolved before any ActionIntent. */
  inputs: Record<string, unknown>;
  /** Canonical outputs, written only from verified results. */
  outputs: Record<string, unknown>;
  blockingReason: string | null;
  failureClass: MissionFailureClass | null;
  /** True when the amount cannot be known until an earlier step is verified. */
  amountUnresolved: boolean;
  linkedOpportunityId: string | null;
  linkedActionIntentId: string | null;
  /** Canonical settlement identity — a tx hash alone is NEVER enough. */
  linkedVerifiedActivityId: string | null;
  linkedTxHash: string | null;
  requiresWalletSignature: boolean;
}

export interface Mission {
  schemaVersion: typeof MISSION_SCHEMA_VERSION;
  id: string;
  /** Owning actor. Cross-user/org access must fail closed. */
  actorUserId: string;
  actorScope: "AUTHENTICATED_USER";
  goalText: string;
  goal: MissionGoal;
  status: MissionStatus;
  steps: readonly MissionStep[];
  currentStepId: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  version: number;
  /** Informational evidence attached at planning time. Never authority. */
  evidenceRefs: readonly EvidenceItem[];
  linkedOpportunityId: string | null;
}

export interface MissionProgress {
  completed: number;
  total: number;
  /** Number of wallet confirmations the user should still expect. */
  expectedUserConfirmations: number;
  percent: number;
}

export function missionProgress(mission: Mission): MissionProgress {
  const total = mission.steps.length;
  const completed = mission.steps.filter((s) => s.state === "COMPLETED").length;
  const expectedUserConfirmations = mission.steps.filter(
    (s) => s.requiresWalletSignature && s.state !== "COMPLETED" && s.state !== "CANCELLED",
  ).length;
  return {
    completed,
    total,
    expectedUserConfirmations,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}

export function missionExpired(mission: Mission, now: Date = new Date()): boolean {
  return new Date(mission.expiresAt).getTime() <= now.getTime();
}

/**
 * V17.1B §5 — the explicit off-chain conversion confirmation contract. Shared by
 * the server engine and the browser surface, so it lives in client-safe types.
 */
export interface MissionConversionConfirmation {
  stepId: string;
  title: string;
  body: string;
  convertibleFlowPoints: number;
  chainId: number;
  requirements: readonly { id: string; label: string; met: boolean; hint?: string }[];
  /** Constant: confirming this authorizes the off-chain conversion only. */
  authorizes: "OFF_CHAIN_CONVERSION_ONLY";
}
