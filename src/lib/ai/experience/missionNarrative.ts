/**
 * FlowBridge V25 §5/§6 — mission progress as a narrative, not a graph.
 *
 * Pure presentation. It reads the FROZEN V17 mission object and decides what to
 * say: what is done, what is happening now, what comes next, and what cannot be
 * known yet. It never advances, prepares, retries or completes anything.
 */
import { missionProgress, type Mission, type MissionStep } from "../mission/missionTypes";
import type { ExperienceStatus } from "./experienceModel";

export const UNRESOLVED_VALUE_COPY = "Calculated after the previous step completes";

export function stepStatus(step: MissionStep): ExperienceStatus {
  switch (step.state) {
    case "COMPLETED":
      return "COMPLETED";
    case "BLOCKED":
      return "BLOCKED";
    case "WAITING_FOR_CONFIRMATION":
      return "VERIFYING";
    case "WAITING_FOR_USER":
      return "WAITING_FOR_USER";
    default:
      return step.requiresWalletSignature ? "WAITING_FOR_USER" : "VERIFIED";
  }
}

/** Human sentence for one step, with unresolved amounts stated honestly. */
export function stepDetail(step: MissionStep): string {
  if (step.blockingReason) return step.blockingReason;
  if (step.state === "COMPLETED") {
    const amount = step.outputs?.resolvedAmount;
    return amount ? `Done · ${String(amount)}` : "Done";
  }
  if (step.state === "WAITING_FOR_CONFIRMATION") return "Verifying on-chain settlement";
  if (step.amountUnresolved && !step.outputs?.resolvedAmount) return UNRESOLVED_VALUE_COPY;
  if (step.requiresWalletSignature) return "Your wallet confirms this step";
  return "Ready when you are";
}

export interface MissionNarrative {
  goalText: string;
  percent: number;
  completedCount: number;
  totalCount: number;
  /** Confirmations the user should still expect from their own wallet. */
  expectedUserConfirmations: number;
  completed: MissionStep[];
  current: MissionStep | null;
  next: MissionStep | null;
  /** One-line "what you should do now", or null when nothing is actionable. */
  nextActionLabel: string | null;
  blocked: boolean;
}

export function missionNarrative(mission: Mission): MissionNarrative {
  const p = missionProgress(mission);
  const open = mission.steps.filter((s) => s.state !== "COMPLETED" && s.state !== "CANCELLED");
  const current =
    mission.steps.find((s) => s.id === mission.currentStepId && s.state !== "COMPLETED") ??
    open[0] ??
    null;
  const next = open.find((s) => s.id !== current?.id) ?? null;
  return {
    goalText: mission.goalText,
    percent: p.percent,
    completedCount: p.completed,
    totalCount: p.total,
    expectedUserConfirmations: p.expectedUserConfirmations,
    completed: mission.steps.filter((s) => s.state === "COMPLETED"),
    current,
    next,
    nextActionLabel: current
      ? current.state === "WAITING_FOR_CONFIRMATION"
        ? "Check confirmation"
        : current.requiresWalletSignature
          ? "Review and confirm in your wallet"
          : "Prepare this step"
      : null,
    blocked: !!current?.blockingReason,
  };
}

/**
 * V25 §6 — the completion moment. A durable, read-only sentence such as
 * "Claimed 1,000 FLOW → staked 500 FLOW → completed." built only from verified
 * step outputs; nothing is inferred and no control is offered.
 */
export function completionSummary(mission: Mission): {
  sentence: string;
  evidence: { stepId: string; title: string; amount: string | null; txHash: string }[];
  completedAt: string | null;
} {
  const parts: string[] = [];
  const evidence: { stepId: string; title: string; amount: string | null; txHash: string }[] = [];
  for (const step of mission.steps) {
    if (step.state !== "COMPLETED") continue;
    const tx = String(step.linkedTxHash ?? step.outputs?.txHash ?? "");
    const amount = step.outputs?.resolvedAmount ? String(step.outputs.resolvedAmount) : null;
    if (tx) evidence.push({ stepId: step.id, title: step.title, amount, txHash: tx });
    if (amount) parts.push(`${step.title} · ${amount}`);
  }
  const tail = mission.status === "COMPLETED" ? "completed" : mission.status.toLowerCase();
  return {
    sentence: parts.length > 0 ? `${parts.join(" → ")} → ${tail}.` : `${mission.goalText} → ${tail}.`,
    evidence,
    completedAt: mission.completedAt ?? null,
  };
}
