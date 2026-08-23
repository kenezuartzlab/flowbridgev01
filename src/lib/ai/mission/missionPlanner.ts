/**
 * FlowBridge V17 §3/§4/§8 — the mission planner.
 *
 * Produces a typed dependency graph (DAG), not a free-form checklist. Rules:
 *  - Later transaction calldata is NEVER precomputed from an estimate; a step
 *    whose amount depends on a previous verified result is `amountUnresolved`.
 *  - Only the NEXT eligible economic step may become READY.
 *  - A material edit invalidates the dependent suffix, and the planner reports
 *    exactly which steps that is before the edit is accepted.
 *
 * Pure module: no network, no DB, no keys, no authority.
 */
import type { ActionIntentType } from "../actionIntent";
import { goalSignature } from "./goalNormalizer";
import {
  MISSION_SCHEMA_VERSION,
  MISSION_TTL_MS,
  PREPARE_STEP_TYPES,
  WALLET_STEP_TYPES,
  type Mission,
  type MissionGoal,
  type MissionStep,
  type MissionStepType,
} from "./missionTypes";

interface StepSeed {
  id: string;
  type: MissionStepType;
  title: string;
  dependencies: readonly string[];
  requiredEvidence: readonly string[];
  inputs?: Record<string, unknown>;
  amountUnresolved?: boolean;
}

function seedToStep(seed: StepSeed): MissionStep {
  return {
    id: seed.id,
    type: seed.type,
    title: seed.title,
    dependencies: seed.dependencies,
    state: "PLANNED",
    requiredEvidence: seed.requiredEvidence,
    inputs: seed.inputs ?? {},
    outputs: {},
    blockingReason: null,
    failureClass: null,
    amountUnresolved: seed.amountUnresolved === true,
    linkedOpportunityId: null,
    linkedActionIntentId: null,
    linkedVerifiedActivityId: null,
    linkedTxHash: null,
    requiresWalletSignature: WALLET_STEP_TYPES.includes(seed.type),
  };
}

const LIVE = ["WALLET_BINDING", "CHAIN_ID"] as const;

function swapLegs(goal: MissionGoal): StepSeed[] {
  const inSym = goal.assetInSymbol ?? "USDT";
  const outSym = goal.assetOutSymbol ?? "BOT";
  return [
    {
      id: "prepare-swap",
      type: "PREPARE_SWAP",
      title: `Prepare swap ${goal.amount ?? "?"} ${inSym} → ${outSym}`,
      dependencies: ["check-wallet"],
      requiredEvidence: ["BALANCE", "ALLOWANCE", "FEE_CONFIG", "QUOTE", "SIMULATION"],
      inputs: { amount: goal.amount, tokenInSymbol: inSym, tokenOutSymbol: outSym, chainId: goal.chainId },
    },
    {
      id: "approve-if-required",
      type: "USER_APPROVAL_IF_REQUIRED",
      title: `Approve ${inSym} spending (only if allowance is short)`,
      dependencies: ["prepare-swap"],
      requiredEvidence: ["ALLOWANCE"],
    },
    {
      id: "user-swap",
      type: "USER_SWAP",
      title: "You confirm the swap in your own wallet",
      dependencies: ["approve-if-required"],
      requiredEvidence: ["ACTION_INTENT_READY"],
    },
    {
      id: "verify-swap",
      type: "VERIFY_SWAP",
      title: "Canonical verification of the swap",
      dependencies: ["user-swap"],
      requiredEvidence: ["VERIFIED_ACTIVITY"],
    },
    {
      id: "resolve-output",
      type: "RESOLVE_ACTUAL_OUTPUT",
      title: `Resolve the actual ${outSym} received`,
      dependencies: ["verify-swap"],
      requiredEvidence: ["VERIFIED_ACTIVITY"],
      amountUnresolved: true,
    },
  ];
}

function stakeLegs(dependsOn: string, unresolved: boolean, goal: MissionGoal): StepSeed[] {
  const pct = goal.constraints.stakePortionPercent;
  const label = unresolved
    ? `Prepare stake — amount UNRESOLVED UNTIL ${dependsOn === "resolve-output" ? "SWAP" : "CLAIM"} CONFIRMED`
    : `Prepare stake of ${goal.amount ?? "?"} FLOW`;
  return [
    {
      id: "prepare-stake",
      type: "PREPARE_STAKE",
      title: pct ? `${label} (${pct}% of the result)` : label,
      dependencies: [dependsOn],
      requiredEvidence: ["BALANCE", "MIN_STAKE", "VAULT_STATE", "SIMULATION"],
      inputs: { chainId: goal.chainId, stakePortionPercent: pct, amount: unresolved ? null : goal.amount },
      amountUnresolved: unresolved,
    },
    {
      id: "approve-flow-if-required",
      type: "USER_APPROVAL_IF_REQUIRED",
      title: "Approve exactly the FLOW to be staked (only if allowance is short)",
      dependencies: ["prepare-stake"],
      requiredEvidence: ["ALLOWANCE"],
    },
    {
      id: "user-stake",
      type: "USER_STAKE",
      title: "You confirm the stake in your own wallet",
      dependencies: ["approve-flow-if-required"],
      requiredEvidence: ["ACTION_INTENT_READY"],
    },

    {
      id: "verify-stake",
      type: "VERIFY_STAKE",
      title: "Canonical verification of the stake",
      dependencies: ["user-stake"],
      requiredEvidence: ["ON_CHAIN_POSITION"],
    },
  ];
}

function claimLegs(goal: MissionGoal): StepSeed[] {
  return [
    {
      id: "prepare-claim",
      type: "PREPARE_CLAIM",
      title: "Prepare your FLOW claim from the canonical ledger",
      dependencies: ["check-wallet"],
      requiredEvidence: ["LEDGER_CLAIMABLE", "DISTRIBUTOR_STATE", "SIMULATION"],
      inputs: { chainId: goal.chainId },
    },
    {
      id: "user-claim",
      type: "USER_CLAIM",
      title: "You confirm the claim in your own wallet",
      dependencies: ["prepare-claim"],
      requiredEvidence: ["ACTION_INTENT_READY"],
    },
    {
      id: "verify-claim",
      type: "VERIFY_CLAIM",
      title: "Canonical verification of the claim",
      dependencies: ["user-claim"],
      requiredEvidence: ["LEDGER_SETTLEMENT"],
    },
  ];
}

export function planSteps(goal: MissionGoal): MissionStep[] {
  const seeds: StepSeed[] = [
    {
      id: "check-wallet",
      type: "CHECK_WALLET_CHAIN",
      title: `Check bound wallet and chain ${goal.chainId}`,
      dependencies: [],
      requiredEvidence: [...LIVE],
      inputs: { chainId: goal.chainId },
    },
  ];

  switch (goal.outcome) {
    case "SWAP_THEN_STAKE":
      seeds.push(...swapLegs(goal), ...stakeLegs("resolve-output", true, goal));
      break;
    case "SWAP_ONLY":
      seeds.push(...swapLegs(goal));
      break;
    case "CLAIM_THEN_STAKE":
      seeds.push(...claimLegs(goal), ...stakeLegs("verify-claim", true, goal));
      break;
    case "CLAIM_ONLY":
      seeds.push(...claimLegs(goal));
      break;
    case "STAKE_ONLY":
      seeds.push(...stakeLegs("check-wallet", false, goal));
      break;
    case "CAMPAIGNS_NO_SPEND":
      seeds.push({
        id: "campaign-tasks",
        type: "COMPLETE_CAMPAIGN_TASK",
        title: "Complete the campaign tasks you already qualify for",
        dependencies: ["check-wallet"],
        requiredEvidence: ["CAMPAIGN_ELIGIBILITY"],
        inputs: { noTokenSpend: true },
      });
      break;
  }

  return seeds.map(seedToStep);
}

export function createMission(input: {
  id: string;
  actorUserId: string;
  goalText: string;
  goal: MissionGoal;
  linkedOpportunityId?: string | null;
  now?: Date;
}): Mission {
  const now = input.now ?? new Date();
  const steps = planSteps(input.goal);
  const planned = input.goal.missingSlots.length === 0;
  return {
    schemaVersion: MISSION_SCHEMA_VERSION,
    id: input.id,
    actorUserId: input.actorUserId,
    actorScope: "AUTHENTICATED_USER",
    goalText: input.goalText,
    goal: input.goal,
    status: planned ? "PLANNED" : "DRAFT",
    steps,
    currentStepId: steps[0]?.id ?? null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + MISSION_TTL_MS).toISOString(),
    version: 1,
    evidenceRefs: [],
    linkedOpportunityId: input.linkedOpportunityId ?? null,
  };
}

/** Steps whose dependencies are all COMPLETED and which are not finished. */
export function eligibleSteps(mission: Mission): readonly MissionStep[] {
  const byId = new Map(mission.steps.map((s) => [s.id, s]));
  return mission.steps.filter((s) => {
    if (["COMPLETED", "CANCELLED"].includes(s.state)) return false;
    return s.dependencies.every((d) => byId.get(d)?.state === "COMPLETED");
  });
}

/**
 * §4 — exactly ONE next step. A mission never queues two wallet confirmations,
 * and a step whose amount is still unresolved can never be prepared.
 */
export function nextEligibleStep(mission: Mission): MissionStep | null {
  if (mission.status !== "PLANNED" && mission.status !== "ACTIVE") return null;
  const waiting = mission.steps.find(
    (s) => s.state === "WAITING_FOR_USER" || s.state === "WAITING_FOR_CONFIRMATION",
  );
  if (waiting) return waiting;
  const candidates = eligibleSteps(mission);
  for (const step of candidates) {
    if (step.state === "BLOCKED") continue;
    if (step.amountUnresolved && !step.outputs.resolvedAmount) continue;
    return step;
  }
  return null;
}

export function actionTypeForStep(step: MissionStep): ActionIntentType | null {
  return PREPARE_STEP_TYPES[step.type] ?? null;
}

/** All steps that transitively depend on the given step ids. */
export function dependentSuffix(mission: Mission, fromStepIds: readonly string[]): string[] {
  const out = new Set<string>(fromStepIds);
  let grew = true;
  while (grew) {
    grew = false;
    for (const step of mission.steps) {
      if (out.has(step.id)) continue;
      if (step.dependencies.some((d) => out.has(d))) {
        out.add(step.id);
        grew = true;
      }
    }
  }
  return mission.steps.filter((s) => out.has(s.id)).map((s) => s.id);
}

export interface EditPreview {
  material: boolean;
  invalidatedStepIds: readonly string[];
  invalidatedActionIntentIds: readonly string[];
  reason: string;
}

/** §8 — what a proposed edit would invalidate, computed BEFORE accepting it. */
export function previewEdit(input: { mission: Mission; nextGoal: MissionGoal }): EditPreview {
  const material = goalSignature(input.mission.goal) !== goalSignature(input.nextGoal);
  if (!material) {
    return {
      material: false,
      invalidatedStepIds: [],
      invalidatedActionIntentIds: [],
      reason: "No economic constraint changed — nothing is invalidated.",
    };
  }
  const notCompleted = input.mission.steps.filter((s) => s.state !== "COMPLETED").map((s) => s.id);
  const affected = dependentSuffix(input.mission, notCompleted);
  const intents = input.mission.steps
    .filter((s) => affected.includes(s.id) && s.linkedActionIntentId)
    .map((s) => s.linkedActionIntentId!);
  return {
    material: true,
    invalidatedStepIds: affected,
    invalidatedActionIntentIds: intents,
    reason:
      "This edit changes the mission economics, so every prepared action and simulation for the remaining steps is discarded and replanned.",
  };
}

/**
 * Applies an edit: completed steps and their canonical outputs are preserved,
 * the dependent suffix is replanned from scratch, and any prepared ActionIntent
 * on those steps is dropped (never reused).
 */
export function applyEdit(input: { mission: Mission; nextGoal: MissionGoal; now?: Date }): Mission {
  const now = input.now ?? new Date();
  const preview = previewEdit({ mission: input.mission, nextGoal: input.nextGoal });
  if (!preview.material) {
    return { ...input.mission, goal: input.nextGoal, updatedAt: now.toISOString() };
  }
  const fresh = planSteps(input.nextGoal);
  const completed = new Map(
    input.mission.steps.filter((s) => s.state === "COMPLETED").map((s) => [s.id, s]),
  );
  const steps = fresh.map((s) => completed.get(s.id) ?? s);
  return {
    ...input.mission,
    goal: input.nextGoal,
    steps,
    status: input.nextGoal.missingSlots.length === 0 ? "PLANNED" : "DRAFT",
    currentStepId: steps.find((s) => s.state !== "COMPLETED")?.id ?? null,
    version: input.mission.version + 1,
    updatedAt: now.toISOString(),
  };
}
