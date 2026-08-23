/**
 * FlowBridge V17 §4/§5 + V17.1 — the mission orchestrator's server side.
 *
 * It does exactly two privileged things:
 *  1. Prepare the ONE next eligible step by re-entering the frozen V15.3
 *     ActionIntent pipeline (live evidence, policy, simulation, canonical
 *     snapshot). It never signs, submits, approves or auto-continues.
 *  2. Advance a step from CANONICAL evidence only — a `verified_activity` row
 *     for swaps, an on-chain claim/position reconciliation for claim and stake.
 *     A bare tx hash, a click, or assistant prose can never advance a mission.
 *
 * V17.1 additions:
 *  - Baselines are captured at preparation time so a settlement delta is exact.
 *  - Downstream amounts are derived with integer base-unit math and provenance.
 *  - The settling wallet is pinned; a wallet change blocks further progress.
 *  - Vault pause, minimum stake and bounded allowance are live gates.
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
import { deriveFromSettlement, formatUnitsExact, parseUnitsExact } from "./settlementDerivation";
import type { Mission, MissionFailureClass, MissionStep } from "./missionTypes";

const FLOW_DECIMALS = 18;

/** Exact base-unit → decimal string conversion (no floats, no rounding). */
function formatRaw(raw: string, decimals: number): string {
  const digits = raw.replace(/[^0-9]/g, "") || "0";
  return formatUnitsExact(BigInt(digits), decimals);
}

/** Writes non-authoritative bookkeeping (baselines, live gates) onto a step. */
function patchStepOutputs(
  mission: Mission,
  stepId: string,
  patch: Record<string, unknown>,
): Mission {
  const steps = mission.steps.map((s) =>
    s.id === stepId ? { ...s, outputs: { ...s.outputs, ...patch } } : s,
  );
  return { ...mission, steps, updatedAt: new Date().toISOString() };
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

/**
 * V17.1 §7 — the wallet that settled an earlier economic step is pinned. If the
 * bound wallet changed, no later step may be prepared until it is revalidated.
 */
function walletMismatch(mission: Mission, wallet: string | null): string | null {
  const pinned = mission.steps
    .map((s) => s.outputs.settlementWallet)
    .find((w): w is string => typeof w === "string" && w.length > 0);
  if (!pinned) return null;
  if (!wallet) return "The wallet that settled the earlier step is no longer bound.";
  if (wallet.toLowerCase() !== pinned.toLowerCase()) {
    return `This mission settled with ${pinned.slice(0, 6)}…${pinned.slice(-4)}; the bound wallet is different, so nothing further was prepared.`;
  }
  return null;
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
  let mission = input.mission;
  const step = nextEligibleStep(mission);
  if (!step) {
    return {
      mission,
      step: null,
      prepared: null,
      failureClass: null,
      message:
        mission.status === "COMPLETED"
          ? "This mission is complete."
          : "There is no eligible next step right now.",
      executed: false,
    };
  }

  // Non-economic steps carry no wallet authority and complete from live checks.
  if (step.type === "CHECK_WALLET_CHAIN") {
    if (!input.wallet) {
      const blocked = blockStep({ mission, stepId: step.id, failureClass: "EVIDENCE_UNAVAILABLE" });
      return {
        mission: blocked.ok ? blocked.mission : mission,
        step,
        prepared: null,
        failureClass: "EVIDENCE_UNAVAILABLE",
        message: "Bind a wallet before this mission can prepare anything.",
        executed: false,
      };
    }
    const done = skipStep({
      mission,
      stepId: step.id,
      reason: `wallet bound, chain ${mission.goal.chainId}`,
    });
    return {
      mission: done.ok ? done.mission : mission,
      step,
      prepared: null,
      failureClass: null,
      message: "Wallet and chain confirmed.",
      executed: false,
    };
  }

  // §7 — actor/wallet revalidation before anything downstream is prepared.
  const mismatch = walletMismatch(mission, input.wallet);
  if (mismatch) {
    const blocked = blockStep({
      mission,
      stepId: step.id,
      failureClass: "VERIFICATION_MISMATCH",
      reason: mismatch,
    });
    return {
      mission: blocked.ok ? blocked.mission : mission,
      step,
      prepared: null,
      failureClass: "VERIFICATION_MISMATCH",
      message: mismatch,
      executed: false,
    };
  }

  if (step.amountUnresolved && !step.outputs.resolvedAmount) {
    return {
      mission,
      step,
      prepared: null,
      failureClass: "CONFIRMATION_PENDING",
      message:
        "This step's amount is unresolved until the previous step is confirmed on chain, so nothing can be prepared yet.",
      executed: false,
    };
  }

  // §6 — bounded allowance is a separate, explicit user confirmation.
  if (step.type === "USER_APPROVAL_IF_REQUIRED") {
    const stakeStep = mission.steps.find((s) => s.type === "PREPARE_STAKE");
    const required = stakeStep?.outputs.resolvedAmountWei as string | undefined;
    if (!required || !input.wallet) {
      return {
        mission,
        step,
        prepared: null,
        failureClass: null,
        message: "This approval is only decided once the amount to spend is canonical.",
        executed: false,
      };
    }
    const { readStakeState } = await import("./missionChainReads.server");
    const state = await readStakeState({ chainId: mission.goal.chainId, account: input.wallet });
    if (!state) {
      return {
        mission,
        step,
        prepared: null,
        failureClass: "EVIDENCE_UNAVAILABLE",
        message: "The allowance read is unavailable, so no approval was proposed.",
        executed: false,
      };
    }
    if ((state.allowanceWei ?? 0n) >= BigInt(required)) {
      const done = skipStep({
        mission,
        stepId: step.id,
        reason: `allowance ${formatUnitsExact(state.allowanceWei ?? 0n, FLOW_DECIMALS)} FLOW already covers the stake`,
      });
      return {
        mission: done.ok ? done.mission : mission,
        step,
        prepared: null,
        failureClass: null,
        message: "Your existing FLOW allowance already covers this stake — no approval is needed.",
        executed: false,
      };
    }
    mission = patchStepOutputs(mission, step.id, {
      approvalRequired: {
        token: state.token,
        spender: state.vault,
        exactAmountWei: required,
        exactAmount: formatUnitsExact(BigInt(required), FLOW_DECIMALS),
        currentAllowanceWei: (state.allowanceWei ?? 0n).toString(),
        unlimited: false,
      },
    });
    return {
      mission,
      step,
      prepared: null,
      failureClass: "ALLOWANCE_REQUIRED",
      message: `Approve exactly ${formatUnitsExact(BigInt(required), FLOW_DECIMALS)} FLOW for the staking vault in your own wallet — Flow AI never approves for you and never requests an unlimited allowance.`,
      executed: false,
    };
  }

  const actionType = actionTypeForStep(step);
  if (!actionType) {
    return {
      mission,
      step,
      prepared: null,
      failureClass: null,
      message: "This step is completed by you in the product — there is nothing to sign.",
      executed: false,
    };
  }

  // §2/§5 — capture the canonical baseline BEFORE the user's transaction, so a
  // settlement delta later is exact instead of inferred.
  if (input.wallet && (step.type === "PREPARE_CLAIM" || step.type === "PREPARE_STAKE")) {
    if (step.type === "PREPARE_CLAIM") {
      const { readClaimState } = await import("./missionChainReads.server");
      const claimState = await readClaimState({ chainId: mission.goal.chainId, account: input.wallet });
      if (!claimState) {
        const blocked = blockStep({
          mission,
          stepId: step.id,
          failureClass: "EVIDENCE_UNAVAILABLE",
          reason: "The distributor state could not be read, so no claim was prepared.",
        });
        return {
          mission: blocked.ok ? blocked.mission : mission,
          step,
          prepared: null,
          failureClass: "EVIDENCE_UNAVAILABLE",
          message: "The distributor state could not be read, so no claim was prepared.",
          executed: false,
        };
      }
      mission = patchStepOutputs(mission, step.id, {
        claimedBaselineWei: claimState.claimedWei.toString(),
        baselineBlockNumber: claimState.blockNumber,
        walletFlowBaselineWei: claimState.walletFlowWei.toString(),
        distributor: claimState.distributor,
      });
    } else {
      const { readStakeState } = await import("./missionChainReads.server");
      const stakeState = await readStakeState({ chainId: mission.goal.chainId, account: input.wallet });
      if (!stakeState) {
        const blocked = blockStep({
          mission,
          stepId: step.id,
          failureClass: "EVIDENCE_UNAVAILABLE",
          reason: "The staking vault state could not be read, so nothing was prepared.",
        });
        return {
          mission: blocked.ok ? blocked.mission : mission,
          step,
          prepared: null,
          failureClass: "EVIDENCE_UNAVAILABLE",
          message: "The staking vault state could not be read, so nothing was prepared.",
          executed: false,
        };
      }
      if (stakeState.paused) {
        const blocked = blockStep({
          mission,
          stepId: step.id,
          failureClass: "SIMULATION_REVERT",
          reason: "The staking vault is paused right now — your FLOW stays in your wallet.",
        });
        return {
          mission: blocked.ok ? blocked.mission : mission,
          step,
          prepared: null,
          failureClass: "SIMULATION_REVERT",
          message: "The staking vault is paused right now — your FLOW stays in your wallet.",
          executed: false,
        };
      }
      const amountStr =
        (step.outputs.resolvedAmount as string | undefined) ??
        (step.inputs.amount as string | undefined) ??
        mission.goal.amount ??
        null;
      const amountWei = amountStr ? parseUnitsExact(amountStr, FLOW_DECIMALS) : null;
      if (amountWei != null && stakeState.minStakeWei != null && amountWei < stakeState.minStakeWei) {
        const reason = `The derived stake (${amountStr} FLOW) is below the vault minimum of ${formatUnitsExact(stakeState.minStakeWei, FLOW_DECIMALS)} FLOW.`;
        const blocked = blockStep({
          mission,
          stepId: step.id,
          failureClass: "INSUFFICIENT_BALANCE",
          reason,
        });
        return {
          mission: blocked.ok ? blocked.mission : mission,
          step,
          prepared: null,
          failureClass: "INSUFFICIENT_BALANCE",
          message: reason,
          executed: false,
        };
      }
      if (amountWei != null && stakeState.walletFlowWei != null && amountWei > stakeState.walletFlowWei) {
        const reason = `Your wallet holds ${formatUnitsExact(stakeState.walletFlowWei, FLOW_DECIMALS)} FLOW, which is less than the derived stake of ${amountStr} FLOW.`;
        const blocked = blockStep({
          mission,
          stepId: step.id,
          failureClass: "INSUFFICIENT_BALANCE",
          reason,
        });
        return {
          mission: blocked.ok ? blocked.mission : mission,
          step,
          prepared: null,
          failureClass: "INSUFFICIENT_BALANCE",
          message: reason,
          executed: false,
        };
      }
      mission = patchStepOutputs(mission, step.id, {
        stakedBaselineWei: stakeState.stakedWei.toString(),
        baselineBlockNumber: stakeState.blockNumber,
        minStakeWei: stakeState.minStakeWei?.toString() ?? null,
        allowanceWei: (stakeState.allowanceWei ?? 0n).toString(),
        vault: stakeState.vault,
        resolvedAmountWei: amountWei?.toString() ?? null,
      });
    }
  }

  const shape = shapeForStep(mission, step);
  const built =
    shape && input.wallet
      ? parametersForShape({ shape, wallet: input.wallet, claimableFlow: input.claimableFlow ?? null })
      : null;
  if (!built) {
    const blocked = blockStep({ mission, stepId: step.id, failureClass: "EVIDENCE_UNAVAILABLE" });
    return {
      mission: blocked.ok ? blocked.mission : mission,
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
    sourceEvidenceRefs: [`mission:${mission.id}`, `mission-step:${step.id}`],
  });

  if (!prepared.ok) {
    const failureClass = classifyBlockers({ decision: prepared.error, blockers: [] });
    const blocked = blockStep({ mission, stepId: step.id, failureClass, reason: prepared.error });
    return {
      mission: blocked.ok ? blocked.mission : mission,
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
    const blocked = blockStep({ mission, stepId: step.id, failureClass, reason: response.decision });
    return {
      mission: blocked.ok ? blocked.mission : mission,
      step,
      prepared: response,
      failureClass,
      message: response.decision,
      executed: false,
    };
  }

  let mutated: MissionMutation = markStepReady({
    mission,
    stepId: step.id,
    actionIntentId: response.intent.id,
  });
  if (mutated.ok) {
    mutated = markStepWaitingForUser({ mission: mutated.mission, stepId: step.id });
  }

  return {
    mission: mutated.ok ? mutated.mission : mission,
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

  /**
   * V17.1 §3 — a user wallet step closes on a SUCCESSFUL receipt for the user's
   * own transaction. That proves inclusion only; the following VERIFY_* step
   * still requires canonical state reconciliation before the mission advances
   * economically, and an approval receipt never proves a stake occurred.
   */
  if (step.requiresWalletSignature) {
    if (!input.txHash) {
      return {
        mission: input.mission,
        advanced: false,
        message: "A transaction hash from your own wallet confirmation is required.",
      };
    }
    const { readReceipt } = await import("./missionChainReads.server");
    const receipt = await readReceipt({ chainId: input.mission.goal.chainId, txHash: input.txHash });
    if (!receipt) {
      return {
        mission: input.mission,
        advanced: false,
        message: "The receipt is not available yet — the mission stays exactly where it is.",
      };
    }
    if (receipt.status !== "success") {
      const blocked = blockStep({
        mission: input.mission,
        stepId: step.id,
        failureClass: "TX_REVERTED",
        reason: "The transaction reverted on chain, so this step did not complete.",
      });
      return {
        mission: blocked.ok ? blocked.mission : input.mission,
        advanced: false,
        message: "The transaction reverted on chain, so this step did not complete.",
      };
    }
    if (input.wallet && receipt.from && receipt.from !== input.wallet.toLowerCase()) {
      const blocked = blockStep({
        mission: input.mission,
        stepId: step.id,
        failureClass: "VERIFICATION_MISMATCH",
        reason: "The transaction was sent by a different wallet than the bound one.",
      });
      return {
        mission: blocked.ok ? blocked.mission : input.mission,
        advanced: false,
        message: "The transaction was sent by a different wallet than the bound one.",
      };
    }
    const result = completeStepFromEvidence({
      mission: input.mission,
      stepId: input.stepId,
      outcome: { onChainConfirmed: true, txHash: input.txHash },
    });
    return result.ok
      ? {
          mission: result.mission,
          advanced: true,
          message: "Your transaction is included — canonical verification is next.",
        }
      : { mission: input.mission, advanced: false, message: result.error };
  }

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
    const rawDigits = String(row.amount_raw ?? "0").replace(/[^0-9]/g, "") || "0";
    const resolvedAmount = formatRaw(rawDigits, decimals);
    const result = completeStepFromEvidence({
      mission: input.mission,
      stepId: input.stepId,
      outcome: {
        verifiedActivityId: String(row.activity_id),
        txHash: row.source_tx_hash ?? input.txHash ?? null,
        resolvedAmount,
        resolvedAmountWei: rawDigits,
        decimals,
        sourceKind: "VERIFIED_ACTIVITY",
        sourceIdentity: String(row.activity_id),
        settlementWallet: input.wallet,
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
      outcome: {
        onChainConfirmed: true,
        resolvedAmount: resolved,
        resolvedAmountWei: (swapStep?.outputs.resolvedAmountWei as string | undefined) ?? null,
        decimals: 18,
        sourceKind: "VERIFIED_ACTIVITY",
        sourceIdentity: (swapStep?.outputs.verifiedActivityId as string | undefined) ?? null,
      },
    });
    return result.ok
      ? { mission: result.mission, advanced: true, message: `Actual output resolved: ${resolved}.` }
      : { mission: input.mission, advanced: false, message: result.error };
  }

  /**
   * §3/§4 — canonical claim settlement. The exact FLOW delivered is the increase
   * of `distributor.claimed[account]` over the baseline captured at preparation.
   * Only after this may a downstream amount be derived.
   */
  if (step.type === "VERIFY_CLAIM") {
    if (!input.wallet) {
      return { mission: input.mission, advanced: false, message: "No bound wallet to reconcile against." };
    }
    const prepareStep = input.mission.steps.find((s) => s.type === "PREPARE_CLAIM");
    const baselineRaw = prepareStep?.outputs.claimedBaselineWei as string | undefined;
    if (baselineRaw == null) {
      return {
        mission: input.mission,
        advanced: false,
        message: "No pre-claim baseline was recorded, so the delivered FLOW cannot be proven.",
      };
    }
    const { readClaimState } = await import("./missionChainReads.server");
    const state = await readClaimState({ chainId: input.mission.goal.chainId, account: input.wallet });
    if (!state) {
      return {
        mission: input.mission,
        advanced: false,
        message: "The distributor read is unavailable, so the mission does not advance.",
      };
    }
    const deltaWei = state.claimedWei - BigInt(baselineRaw);
    if (deltaWei <= 0n) {
      return {
        mission: input.mission,
        advanced: false,
        message:
          "The distributor still shows no additional FLOW delivered — the claim is not canonically settled yet.",
      };
    }
    const identity = `claimed:${state.distributor.toLowerCase()}:${input.wallet.toLowerCase()}@${state.blockNumber ?? "latest"}`;
    const result = completeStepFromEvidence({
      mission: input.mission,
      stepId: input.stepId,
      outcome: {
        onChainConfirmed: true,
        txHash: input.txHash ?? null,
        resolvedAmount: formatUnitsExact(deltaWei, FLOW_DECIMALS),
        resolvedAmountWei: deltaWei.toString(),
        decimals: FLOW_DECIMALS,
        sourceKind: "ON_CHAIN_CLAIM",
        sourceIdentity: identity,
        settlementWallet: input.wallet,
      },
    });
    if (!result.ok) return { mission: input.mission, advanced: false, message: result.error };
    const pct = input.mission.goal.constraints.stakePortionPercent;
    const derived = pct
      ? deriveFromSettlement({
          actualWei: deltaWei,
          decimals: FLOW_DECIMALS,
          ratioPercent: pct,
          sourceStepId: input.stepId,
          sourceKind: "ON_CHAIN_CLAIM",
          sourceIdentity: identity,
        })
      : null;
    return {
      mission: result.mission,
      advanced: true,
      message: `Claim verified from canonical distributor state: ${formatUnitsExact(deltaWei, FLOW_DECIMALS)} FLOW delivered.${
        derived ? ` Derived stake target: ${derived.derivedAmount} FLOW (${pct}% of the verified claim).` : ""
      }`,
    };
  }

  /** §6 — the stake is proven by the increase of the user's vault position. */
  if (step.type === "VERIFY_STAKE") {
    if (!input.wallet) {
      return { mission: input.mission, advanced: false, message: "No bound wallet to reconcile against." };
    }
    const prepareStep = input.mission.steps.find((s) => s.type === "PREPARE_STAKE");
    const baselineRaw = prepareStep?.outputs.stakedBaselineWei as string | undefined;
    const expectedRaw = prepareStep?.outputs.resolvedAmountWei as string | undefined;
    const { readStakeState } = await import("./missionChainReads.server");
    const state = await readStakeState({ chainId: input.mission.goal.chainId, account: input.wallet });
    if (!state) {
      return {
        mission: input.mission,
        advanced: false,
        message: "The on-chain position read is unavailable, so the mission does not advance.",
      };
    }
    if (baselineRaw == null) {
      return {
        mission: input.mission,
        advanced: false,
        message: "No pre-stake position baseline was recorded, so the stake cannot be reconciled.",
      };
    }
    const deltaWei = state.stakedWei - BigInt(baselineRaw);
    if (deltaWei <= 0n) {
      return {
        mission: input.mission,
        advanced: false,
        message: "Your vault position has not increased yet — the stake is not canonically settled.",
      };
    }
    if (expectedRaw && deltaWei < BigInt(expectedRaw)) {
      const blocked = blockStep({
        mission: input.mission,
        stepId: step.id,
        failureClass: "VERIFICATION_MISMATCH",
        reason: `Your position rose by ${formatUnitsExact(deltaWei, FLOW_DECIMALS)} FLOW but the prepared stake was ${formatUnitsExact(BigInt(expectedRaw), FLOW_DECIMALS)} FLOW.`,
      });
      return {
        mission: blocked.ok ? blocked.mission : input.mission,
        advanced: false,
        message: "The settled stake does not match the prepared amount, so the mission stopped for review.",
      };
    }
    const result = completeStepFromEvidence({
      mission: input.mission,
      stepId: input.stepId,
      outcome: {
        onChainConfirmed: true,
        txHash: input.txHash ?? null,
        sourceKind: "ON_CHAIN_POSITION",
        sourceIdentity: `staked:${state.vault.toLowerCase()}:${input.wallet.toLowerCase()}@${state.blockNumber ?? "latest"}`,
        settlementWallet: input.wallet,
      },
    });
    return result.ok
      ? {
          mission: result.mission,
          advanced: true,
          message: `Stake verified on chain: position increased by ${formatUnitsExact(deltaWei, FLOW_DECIMALS)} FLOW (total ${formatUnitsExact(state.stakedWei, FLOW_DECIMALS)} FLOW).`,
        }
      : { mission: input.mission, advanced: false, message: result.error };
  }

  return {
    mission: input.mission,
    advanced: false,
    message: "This step does not advance from on-chain evidence.",
  };
}
