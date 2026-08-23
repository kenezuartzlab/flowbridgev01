/**
 * FlowBridge V17 §5/§6/§9 — grounded progress and failure classification.
 *
 * A step advances ONLY from a canonical verified outcome. Assistant prose, a
 * click, an optimistic UI state or a bare tx hash are never sufficient: a swap
 * completes on a `verified_activity_id` (V15.3M canonical identity), a stake on
 * an on-chain position read, a claim on a canonical ledger settlement.
 *
 * Pure module.
 */
import {
  canStepTransition,
  type Mission,
  type MissionFailureClass,
  type MissionStatus,
  type MissionStep,
  type MissionStepState,
} from "./missionTypes";
import { nextEligibleStep } from "./missionPlanner";

function replaceStep(mission: Mission, next: MissionStep, now: Date): Mission {
  const steps = mission.steps.map((s) => (s.id === next.id ? next : s));
  const allDone = steps.every((s) => s.state === "COMPLETED" || s.state === "CANCELLED");
  const blocked = steps.some((s) => s.state === "BLOCKED");
  const status: MissionStatus = allDone
    ? "COMPLETED"
    : blocked
      ? "BLOCKED"
      : mission.status === "DRAFT"
        ? "DRAFT"
        : "ACTIVE";
  const updated: Mission = {
    ...mission,
    steps,
    status,
    updatedAt: now.toISOString(),
    version: mission.version + 1,
  };
  return { ...updated, currentStepId: nextEligibleStep(updated)?.id ?? null };
}

export type MissionMutation =
  | { ok: false; error: string }
  | { ok: true; mission: Mission };

function transition(
  mission: Mission,
  stepId: string,
  to: MissionStepState,
  patch: Partial<MissionStep>,
  now: Date,
): MissionMutation {
  const step = mission.steps.find((s) => s.id === stepId);
  if (!step) return { ok: false, error: "unknown step" };
  if (step.state !== to && !canStepTransition(step.state, to)) {
    return { ok: false, error: `illegal transition ${step.state} → ${to}` };
  }
  return { ok: true, mission: replaceStep(mission, { ...step, ...patch, state: to }, now) };
}

/** Marks a prepared step READY and links its ActionIntent (never authorization). */
export function markStepReady(input: {
  mission: Mission;
  stepId: string;
  actionIntentId: string | null;
  now?: Date;
}): MissionMutation {
  const now = input.now ?? new Date();
  const next = nextEligibleStep(input.mission);
  if (!next || next.id !== input.stepId) {
    return { ok: false, error: "only the next eligible step may become ready" };
  }
  return transition(
    input.mission,
    input.stepId,
    "READY",
    { linkedActionIntentId: input.actionIntentId, blockingReason: null, failureClass: null },
    now,
  );
}

/** The user has been handed the plan; the mission now waits for their wallet. */
export function markStepWaitingForUser(input: {
  mission: Mission;
  stepId: string;
  now?: Date;
}): MissionMutation {
  return transition(input.mission, input.stepId, "WAITING_FOR_USER", {}, input.now ?? new Date());
}

/** A tx hash was observed — NOT progress yet. Confirmation must be canonical. */
export function markStepSubmitted(input: {
  mission: Mission;
  stepId: string;
  txHash: string;
  now?: Date;
}): MissionMutation {
  return transition(
    input.mission,
    input.stepId,
    "WAITING_FOR_CONFIRMATION",
    { linkedTxHash: input.txHash },
    input.now ?? new Date(),
  );
}

export interface CanonicalOutcome {
  /** Canonical settlement identity for swaps (V15.3M). */
  verifiedActivityId?: string | null;
  /** On-chain read for stake/claim settlement. */
  onChainConfirmed?: boolean;
  /** Actual received/settled amount, as an exact decimal string. */
  resolvedAmount?: string | null;
  txHash?: string | null;
}

const CANONICAL_REQUIREMENT: Partial<Record<MissionStep["type"], "VERIFIED_ACTIVITY" | "ON_CHAIN">> = {
  VERIFY_SWAP: "VERIFIED_ACTIVITY",
  VERIFY_STAKE: "ON_CHAIN",
  VERIFY_CLAIM: "ON_CHAIN",
};

/**
 * Completes a step from canonical evidence only. Returns a machine-readable
 * failure when the evidence offered is not canonical.
 */
export function completeStepFromEvidence(input: {
  mission: Mission;
  stepId: string;
  outcome: CanonicalOutcome;
  now?: Date;
}): MissionMutation {
  const now = input.now ?? new Date();
  const step = input.mission.steps.find((s) => s.id === input.stepId);
  if (!step) return { ok: false, error: "unknown step" };

  const requirement = CANONICAL_REQUIREMENT[step.type];
  if (requirement === "VERIFIED_ACTIVITY" && !input.outcome.verifiedActivityId) {
    return { ok: false, error: "CONFIRMATION_PENDING: a canonical verified activity is required" };
  }
  if (requirement === "ON_CHAIN" && input.outcome.onChainConfirmed !== true) {
    return { ok: false, error: "CONFIRMATION_PENDING: an on-chain position read is required" };
  }

  const outputs: Record<string, unknown> = { ...step.outputs };
  if (input.outcome.resolvedAmount) outputs.resolvedAmount = input.outcome.resolvedAmount;
  if (input.outcome.verifiedActivityId) outputs.verifiedActivityId = input.outcome.verifiedActivityId;

  const done = transition(
    input.mission,
    input.stepId,
    "COMPLETED",
    {
      outputs,
      linkedVerifiedActivityId: input.outcome.verifiedActivityId ?? step.linkedVerifiedActivityId,
      linkedTxHash: input.outcome.txHash ?? step.linkedTxHash,
      blockingReason: null,
      failureClass: null,
    },
    now,
  );
  if (!done.ok) return done;

  /**
   * §3 — the resolved actual output is propagated to the dependent step that was
   * deliberately left unresolved. This is the ONLY way an unresolved amount is
   * ever filled: from a verified result, never from a pre-trade estimate.
   */
  if (input.outcome.resolvedAmount) {
    const steps = done.mission.steps.map((s) => {
      if (!s.amountUnresolved || s.state === "COMPLETED") return s;
      if (!s.dependencies.includes(input.stepId)) return s;
      /**
       * A portion constraint applies ONCE, where the amount is actually spent
       * (the prepare step); pass-through resolution steps carry the full result.
       */
      const pct = input.mission.goal.constraints.stakePortionPercent;
      const base = Number(input.outcome.resolvedAmount);
      const amount =
        pct && s.type.startsWith("PREPARE_")
          ? String((base * pct) / 100)
          : input.outcome.resolvedAmount!;
      return { ...s, outputs: { ...s.outputs, resolvedAmount: amount }, inputs: { ...s.inputs, amount } };
    });
    const mission = { ...done.mission, steps };
    return { ok: true, mission: { ...mission, currentStepId: nextEligibleStep(mission)?.id ?? null } };
  }
  return done;
}

/** Skips a conditional step that turned out not to be needed (e.g. allowance ok). */
export function skipStep(input: { mission: Mission; stepId: string; reason: string; now?: Date }): MissionMutation {
  return transition(
    input.mission,
    input.stepId,
    "COMPLETED",
    { outputs: { skipped: true, reason: input.reason } },
    input.now ?? new Date(),
  );
}

export interface MissionRecoveryAdvice {
  failureClass: MissionFailureClass;
  message: string;
  /** True when the user can retry the same step after fixing the condition. */
  retryable: boolean;
  /** True when a NEW ActionIntent must be prepared (never a resurrected one). */
  requiresFreshPreparation: boolean;
}

const RECOVERY: Record<MissionFailureClass, Omit<MissionRecoveryAdvice, "failureClass">> = {
  EVIDENCE_UNAVAILABLE: {
    message: "Live evidence for this step is unavailable, so nothing was prepared. Try again shortly.",
    retryable: true,
    requiresFreshPreparation: true,
  },
  UNSUPPORTED_ROUTE: {
    message: "This route is not supported on the selected chain, so the mission cannot continue as planned.",
    retryable: false,
    requiresFreshPreparation: true,
  },
  INSUFFICIENT_BALANCE: {
    message: "Your balance is below the planned amount. Lower the amount or top up, then prepare again.",
    retryable: true,
    requiresFreshPreparation: true,
  },
  INSUFFICIENT_GAS: {
    message: "There is not enough native gas to confirm this step. Add gas and prepare again.",
    retryable: true,
    requiresFreshPreparation: true,
  },
  ALLOWANCE_REQUIRED: {
    message: "An allowance confirmation is required first. That is a separate wallet confirmation you control.",
    retryable: true,
    requiresFreshPreparation: false,
  },
  SIMULATION_REVERT: {
    message: "The simulation reverted, so no plan was offered for signature.",
    retryable: true,
    requiresFreshPreparation: true,
  },
  INTENT_EXPIRED: {
    message: "The prepared action expired. Preparing again creates a new plan with fresh evidence.",
    retryable: true,
    requiresFreshPreparation: true,
  },
  TX_REJECTED: {
    message: "You rejected the confirmation in your wallet. The mission is paused exactly where it was.",
    retryable: true,
    requiresFreshPreparation: true,
  },
  TX_REVERTED: {
    message: "The transaction reverted on chain, so this step did not complete.",
    retryable: true,
    requiresFreshPreparation: true,
  },
  CONFIRMATION_PENDING: {
    message: "Waiting for canonical confirmation. The mission will not advance until it settles.",
    retryable: false,
    requiresFreshPreparation: false,
  },
  VERIFICATION_MISMATCH: {
    message: "The settled result does not match the prepared plan, so the mission stopped for your review.",
    retryable: false,
    requiresFreshPreparation: true,
  },
};

export function blockStep(input: {
  mission: Mission;
  stepId: string;
  failureClass: MissionFailureClass;
  now?: Date;
}): MissionMutation {
  const advice = RECOVERY[input.failureClass];
  return transition(
    input.mission,
    input.stepId,
    "BLOCKED",
    { failureClass: input.failureClass, blockingReason: advice.message },
    input.now ?? new Date(),
  );
}

export function recoveryAdvice(failureClass: MissionFailureClass): MissionRecoveryAdvice {
  return { failureClass, ...RECOVERY[failureClass] };
}

/** Retry always re-enters preparation; a stale ActionIntent is never revived. */
export function retryStep(input: { mission: Mission; stepId: string; now?: Date }): MissionMutation {
  return transition(
    input.mission,
    input.stepId,
    "PLANNED",
    { linkedActionIntentId: null, blockingReason: null, failureClass: null },
    input.now ?? new Date(),
  );
}

export function pauseMission(mission: Mission, now: Date = new Date()): Mission {
  return { ...mission, status: "PAUSED", updatedAt: now.toISOString(), version: mission.version + 1 };
}

export function resumeMission(mission: Mission, now: Date = new Date()): Mission {
  return { ...mission, status: "ACTIVE", updatedAt: now.toISOString(), version: mission.version + 1 };
}

export function cancelMission(mission: Mission, now: Date = new Date()): Mission {
  return {
    ...mission,
    status: "CANCELLED",
    steps: mission.steps.map((s) =>
      s.state === "COMPLETED" ? s : { ...s, state: "CANCELLED", linkedActionIntentId: null },
    ),
    currentStepId: null,
    updatedAt: now.toISOString(),
    version: mission.version + 1,
  };
}
