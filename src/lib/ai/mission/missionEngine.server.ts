/**
 * FlowBridge V17 §4/§5 — the mission orchestrator's server side.
 *
 * It does exactly two privileged things:
 *  1. Prepare the ONE next eligible step by re-entering the frozen V15.3
 *     ActionIntent pipeline (live evidence, policy, simulation, canonical
 *     snapshot). It never signs, submits, approves or auto-continues.
 *  2. Advance a step from CANONICAL verification only — a `verified_activity`
 *     row for swaps, an on-chain position/ledger read for stake and claim. A
 *     bare tx hash, a click, or assistant prose can never advance a mission.
 */
import type { FlowAiActor } from "../aiTypes";
import { prepareActionIntent } from "../intentPrepare.server";
import { parametersForShape, type PreparationShape } from "../preparationRouting";
import { actionTypeForStep, nextEligibleStep } from "./missionPlanner";
import {
  blockStep,
  completeStepFromEvidence,
  markStepReady,
  markStepWaitingForUser,
  skipStep,
  type MissionMutation,
} from "./missionProgress";
import type { Mission, MissionFailureClass, MissionStep } from "./missionTypes";

/** Exact base-unit → decimal string conversion (no floats, no rounding). */
function formatRaw(raw: string, decimals: number): string {
  const digits = raw.replace(/[^0-9]/g, "") || "0";
  if (decimals <= 0) return digits;
  const padded = digits.padStart(decimals + 1, "0");
  const whole = padded.slice(0, padded.length - decimals);
  const frac = padded.slice(padded.length - decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

function classifyBlockers(input: {
  decision: string;
  blockers: readonly string[];
}): MissionFailureClass {
  const text = [input.decision, ...input.blockers].join(" ").toLowerCase();
  if (/allowance/.test(text)) return "ALLOWANCE_REQUIRED";
  if (/balance|insufficient funds/.test(text)) return "INSUFFICIENT_BALANCE";
  if (/gas/.test(text)) return "INSUFFICIENT_GAS";
  if (/revert|simulation/.test(text)) return "SIMULATION_REVERT";
  if (/expired/.test(text)) return "INTENT_EXPIRED";
  if (/route|unsupported/.test(text)) return "UNSUPPORTED_ROUTE";
  return "EVIDENCE_UNAVAILABLE";
}

/** Builds canonical ActionIntent parameters for a prepare step. */
function shapeForStep(mission: Mission, step: MissionStep): PreparationShape | null {
  const actionType = actionTypeForStep(step);
  if (!actionType) return null;
  const amount =
    (step.outputs.resolvedAmount as string | undefined) ??
    (step.inputs.amount as string | undefined) ??
    mission.goal.amount ??
    null;
  return {
    type: actionType,
    chainId: mission.goal.chainId,
    tokenInSymbol: (step.inputs.tokenInSymbol as string | undefined) ?? mission.goal.assetInSymbol,
    tokenOutSymbol: (step.inputs.tokenOutSymbol as string | undefined) ?? mission.goal.assetOutSymbol,
    destinationChainId: null,
    amount: actionType === "CLAIM_FLOW" ? null : amount,
    missingFields: [],
    recognized: mission.goal.recognized,
  };
}

export interface PrepareNextStepResult {
  mission: Mission;
  step: MissionStep | null;
  prepared: unknown | null;
  /** Present when preparation could not be offered. */
  failureClass: MissionFailureClass | null;
  message: string;
  /** Constant: the orchestrator executed nothing. */
  executed: false;
}

export async function prepareNextMissionStep(input: {
  mission: Mission;
  actor: FlowAiActor;
  wallet: string | null;
  claimableFlow?: number | null;
}): Promise<PrepareNextStepResult> {
  const step = nextEligibleStep(input.mission);
  if (!step) {
    return {
      mission: input.mission,
      step: null,
      prepared: null,
      failureClass: null,
      message:
        input.mission.status === "COMPLETED"
          ? "This mission is complete."
          : "There is no eligible next step right now.",
      executed: false,
    };
  }

  // Non-economic steps carry no wallet authority and complete from live checks.
  if (step.type === "CHECK_WALLET_CHAIN") {
    if (!input.wallet) {
      const blocked = blockStep({ mission: input.mission, stepId: step.id, failureClass: "EVIDENCE_UNAVAILABLE" });
      return {
        mission: blocked.ok ? blocked.mission : input.mission,
        step,
        prepared: null,
        failureClass: "EVIDENCE_UNAVAILABLE",
        message: "Bind a wallet before this mission can prepare anything.",
        executed: false,
      };
    }
    const done = skipStep({
      mission: input.mission,
      stepId: step.id,
      reason: `wallet bound, chain ${input.mission.goal.chainId}`,
    });
    return {
      mission: done.ok ? done.mission : input.mission,
      step,
      prepared: null,
      failureClass: null,
      message: "Wallet and chain confirmed.",
      executed: false,
    };
  }

  if (step.amountUnresolved && !step.outputs.resolvedAmount) {
    return {
      mission: input.mission,
      step,
      prepared: null,
      failureClass: "CONFIRMATION_PENDING",
      message:
        "This step's amount is unresolved until the previous step is confirmed on chain, so nothing can be prepared yet.",
      executed: false,
    };
  }

  const actionType = actionTypeForStep(step);
  if (!actionType) {
    return {
      mission: input.mission,
      step,
      prepared: null,
      failureClass: null,
      message: "This step is completed by you in the product — there is nothing to sign.",
      executed: false,
    };
  }

  const shape = shapeForStep(input.mission, step);
  const built =
    shape && input.wallet
      ? parametersForShape({ shape, wallet: input.wallet, claimableFlow: input.claimableFlow ?? null })
      : null;
  if (!built) {
    const blocked = blockStep({ mission: input.mission, stepId: step.id, failureClass: "EVIDENCE_UNAVAILABLE" });
    return {
      mission: blocked.ok ? blocked.mission : input.mission,
      step,
      prepared: null,
      failureClass: "EVIDENCE_UNAVAILABLE",
      message: "The canonical inputs for this step are incomplete, so nothing was prepared.",
      executed: false,
    };
  }

  const prepared = await prepareActionIntent({
    type: built.type,
    chainId: built.chainId,
    parameters: built.parameters,
    actor: input.actor,
    actorWallet: input.wallet,
    sourceEvidenceRefs: [`mission:${input.mission.id}`, `mission-step:${step.id}`],
  });

  if (!prepared.ok) {
    const failureClass = classifyBlockers({ decision: prepared.error, blockers: [] });
    const blocked = blockStep({ mission: input.mission, stepId: step.id, failureClass });
    return {
      mission: blocked.ok ? blocked.mission : input.mission,
      step,
      prepared: null,
      failureClass,
      message: prepared.error,
      executed: false,
    };
  }

  const response = prepared.response;
  const ready = response.intent.status === "READY_FOR_USER";
  if (!ready) {
    const failureClass = classifyBlockers({
      decision: response.decision,
      blockers: response.blockers,
    });
    const blocked = blockStep({ mission: input.mission, stepId: step.id, failureClass });
    return {
      mission: blocked.ok ? blocked.mission : input.mission,
      step,
      prepared: response,
      failureClass,
      message: response.decision,
      executed: false,
    };
  }

  let mutated: MissionMutation = markStepReady({
    mission: input.mission,
    stepId: step.id,
    actionIntentId: response.intent.id,
  });
  if (mutated.ok) {
    mutated = markStepWaitingForUser({ mission: mutated.mission, stepId: step.id });
  }

  return {
    mission: mutated.ok ? mutated.mission : input.mission,
    step,
    prepared: response,
    failureClass: null,
    message:
      "Prepared and ready for YOUR wallet confirmation — Flow AI cannot sign or submit this for you.",
    executed: false,
  };
}

/**
 * §5 — canonical advancement. The caller supplies only a step id and an optional
 * tx hash; the CANONICAL evidence is read here, server-side.
 */
export async function advanceMissionStep(input: {
  mission: Mission;
  stepId: string;
  txHash?: string | null;
  userId: string;
  wallet: string | null;
}): Promise<{ mission: Mission; advanced: boolean; message: string }> {
  const step = input.mission.steps.find((s) => s.id === input.stepId);
  if (!step) return { mission: input.mission, advanced: false, message: "Unknown step." };

  if (step.type === "VERIFY_SWAP") {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("verified_activities")
      .select("activity_id,source_tx_hash,amount_raw,token,source_chain_id,status,occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(1);
    if (input.wallet) query = query.eq("user_wallet", input.wallet.toLowerCase());
    if (input.txHash) query = query.eq("source_tx_hash", input.txHash);
    const { data } = await query;
    const row: any = (data ?? [])[0];
    if (!row?.activity_id) {
      return {
        mission: input.mission,
        advanced: false,
        message:
          "No canonical verified activity yet \u2014 the mission stays where it is until settlement is verified.",
      };
    }
    /**
     * V15.3M canonical identity: the settled amount is the ledger's own
     * `amount_raw`, decoded with the registry decimals for the settled token.
     * Nothing here is an estimate.
     */
    const { tokenFor } = await import("../preparationRouting");
    const decimals =
      [input.mission.goal.assetOutSymbol, input.mission.goal.assetInSymbol, "BOT"]
        .filter(Boolean)
        .map((sym) => tokenFor(String(sym), Number(row.source_chain_id) || input.mission.goal.chainId))
        .find((t) => t && t.address === String(row.token ?? "").toLowerCase())?.decimals ?? 18;
    const resolvedAmount = formatRaw(String(row.amount_raw ?? "0"), decimals);
    const result = completeStepFromEvidence({
      mission: input.mission,
      stepId: input.stepId,
      outcome: {
        verifiedActivityId: String(row.activity_id),
        txHash: row.source_tx_hash ?? input.txHash ?? null,
        resolvedAmount,
      },
    });
    return result.ok
      ? { mission: result.mission, advanced: true, message: "Swap verified from canonical settlement." }
      : { mission: input.mission, advanced: false, message: result.error };
  }

  if (step.type === "RESOLVE_ACTUAL_OUTPUT") {
    const swapStep = input.mission.steps.find((s) => s.type === "VERIFY_SWAP");
    const resolved = swapStep?.outputs.resolvedAmount as string | undefined;
    if (!resolved) {
      return {
        mission: input.mission,
        advanced: false,
        message: "The actual received amount is not yet canonically known.",
      };
    }
    const result = completeStepFromEvidence({
      mission: input.mission,
      stepId: input.stepId,
      outcome: { onChainConfirmed: true, resolvedAmount: resolved },
    });
    return result.ok
      ? { mission: result.mission, advanced: true, message: `Actual output resolved: ${resolved}.` }
      : { mission: input.mission, advanced: false, message: result.error };
  }

  if (step.type === "VERIFY_STAKE" || step.type === "VERIFY_CLAIM") {
    const { loadStakingEvidence } = await import("../stakingEvidence.server");
    const evidence = await loadStakingEvidence(input.wallet);
    const position = evidence.find((e) => /position|staked|claim/i.test(e.id));
    if (!position) {
      return {
        mission: input.mission,
        advanced: false,
        message: "The on-chain read is unavailable, so the mission does not advance.",
      };
    }
    const result = completeStepFromEvidence({
      mission: input.mission,
      stepId: input.stepId,
      outcome: { onChainConfirmed: true, txHash: input.txHash ?? null },
    });
    return result.ok
      ? { mission: result.mission, advanced: true, message: "Confirmed from an on-chain read." }
      : { mission: input.mission, advanced: false, message: result.error };
  }

  return {
    mission: input.mission,
    advanced: false,
    message: "This step does not advance from on-chain evidence.",
  };
}
