import { describe, expect, it } from "vitest";
import { goalSignature, mergeGoalTurn, normalizeGoal } from "./goalNormalizer";
import {
  applyEdit,
  createMission,
  dependentSuffix,
  eligibleSteps,
  nextEligibleStep,
  previewEdit,
} from "./missionPlanner";
import {
  blockStep,
  completeStepFromEvidence,
  markStepReady,
  markStepSubmitted,
  recoveryAdvice,
  retryStep,
  skipStep,
} from "./missionProgress";
import { missionProgress } from "./missionTypes";

const USER = "user-1";

function mission(text: string) {
  const goal = normalizeGoal({ text })!;
  return createMission({ id: "m1", actorUserId: USER, goalText: text, goal });
}

function completeWallet(m: ReturnType<typeof mission>) {
  const done = skipStep({ mission: m, stepId: "check-wallet", reason: "bound" });
  if (!done.ok) throw new Error(done.error);
  return done.mission;
}

describe("V17 goal normalization", () => {
  it("parses a two-outcome goal into a typed mission goal", () => {
    const goal = normalizeGoal({ text: "Swap 20 USDT to BOT and stake it" })!;
    expect(goal.outcome).toBe("SWAP_THEN_STAKE");
    expect(goal.assetInSymbol).toBe("USDT");
    expect(goal.assetOutSymbol).toBe("BOT");
    expect(goal.amount).toBe("20");
    expect(goal.missingSlots).toEqual([]);
  });

  it("never invents an amount from a vague size qualifier", () => {
    const goal = normalizeGoal({ text: "swap a small amount of USDT to BOT and stake it" })!;
    expect(goal.amount).toBeNull();
    expect(goal.missingSlots).toContain("amount");
  });

  it("converges one-shot and multi-turn phrasings on the same goal", () => {
    const oneShot = normalizeGoal({ text: "swap 20 USDT to BOT and stake it on BOT Testnet" })!;
    const turn1 = normalizeGoal({ text: "swap USDT to BOT and stake it on BOT Testnet" })!;
    const merged = mergeGoalTurn({ goal: turn1, text: "20 USDT" });
    expect(goalSignature(merged)).toBe(goalSignature(oneShot));
  });

  it("captures explicit constraints only", () => {
    const goal = normalizeGoal({
      text: "swap 50 USDT to BOT with max slippage 1% and stake 50% of it, never bridge",
    })!;
    expect(goal.constraints.maxSlippageBps).toBe(100);
    expect(goal.constraints.stakePortionPercent).toBe(50);
    expect(goal.constraints.neverBridge).toBe(true);
    expect(normalizeGoal({ text: "swap 5 USDT to BOT" })!.constraints.maxSlippageBps).toBeNull();
  });
});

describe("V17 mission graph", () => {
  it("builds a dependency graph with an unresolved downstream amount", () => {
    const m = mission("Swap 20 USDT to BOT and stake it");
    const stake = m.steps.find((s) => s.id === "prepare-stake")!;
    expect(stake.amountUnresolved).toBe(true);
    expect(stake.dependencies).toEqual(["resolve-output"]);
    expect(m.steps.filter((s) => s.requiresWalletSignature).length).toBeGreaterThan(1);
    expect(missionProgress(m).expectedUserConfirmations).toBeGreaterThanOrEqual(2);
  });

  it("exposes exactly one next eligible step", () => {
    const m = mission("Swap 20 USDT to BOT and stake it");
    expect(nextEligibleStep(m)!.id).toBe("check-wallet");
    expect(eligibleSteps(m).map((s) => s.id)).toEqual(["check-wallet"]);
  });

  it("refuses to make a non-next step ready", () => {
    const m = mission("Swap 20 USDT to BOT and stake it");
    const bad = markStepReady({ mission: m, stepId: "prepare-stake", actionIntentId: "i1" });
    expect(bad.ok).toBe(false);
  });

  it("never lets an unresolved step become the next step", () => {
    let m = completeWallet(mission("Swap 20 USDT to BOT and stake it"));
    for (const id of ["prepare-swap", "approve-if-required", "user-swap"]) {
      const done = skipStep({ mission: m, stepId: id, reason: "test" });
      if (!done.ok) throw new Error(done.error);
      m = done.mission;
    }
    expect(nextEligibleStep(m)!.id).toBe("verify-swap");
  });
});

describe("V17 grounded progress", () => {
  it("rejects a bare tx hash as swap completion", () => {
    let m = completeWallet(mission("Swap 20 USDT to BOT and stake it"));
    for (const id of ["prepare-swap", "approve-if-required", "user-swap"]) {
      m = (skipStep({ mission: m, stepId: id, reason: "test" }) as any).mission;
    }
    const submitted = markStepSubmitted({ mission: m, stepId: "verify-swap", txHash: "0xabc" });
    expect(submitted.ok).toBe(false);
    const attempt = completeStepFromEvidence({
      mission: m,
      stepId: "verify-swap",
      outcome: { txHash: "0xabc" },
    });
    expect(attempt.ok).toBe(false);
    expect(String((attempt as any).error)).toContain("CONFIRMATION_PENDING");
  });

  it("propagates the canonical verified amount into the unresolved stake step", () => {
    let m = completeWallet(mission("Swap 20 USDT to BOT and stake 50% of it"));
    for (const id of ["prepare-swap", "approve-if-required", "user-swap"]) {
      m = (skipStep({ mission: m, stepId: id, reason: "test" }) as any).mission;
    }
    const verified = completeStepFromEvidence({
      mission: m,
      stepId: "verify-swap",
      outcome: { verifiedActivityId: "act-1", resolvedAmount: "31.5", txHash: "0xabc" },
    });
    expect(verified.ok).toBe(true);
    const resolve = (verified as any).mission.steps.find((s: any) => s.id === "resolve-output");
    expect(resolve.outputs.resolvedAmount).toBe("31.5");
    const advanced = completeStepFromEvidence({
      mission: (verified as any).mission,
      stepId: "resolve-output",
      outcome: { onChainConfirmed: true, resolvedAmount: "31.5" },
    });
    const stake = (advanced as any).mission.steps.find((s: any) => s.id === "prepare-stake");
    expect(stake.inputs.amount).toBe("15.75");
    expect(nextEligibleStep((advanced as any).mission)!.id).toBe("prepare-stake");
  });

  it("classifies failures and always requires a fresh preparation on retry", () => {
    const m = completeWallet(mission("Swap 20 USDT to BOT"));
    const ready = markStepReady({ mission: m, stepId: "prepare-swap", actionIntentId: "i1" });
    const blocked = blockStep({
      mission: (ready as any).mission,
      stepId: "prepare-swap",
      failureClass: "INTENT_EXPIRED",
    });
    expect((blocked as any).mission.status).toBe("BLOCKED");
    expect(recoveryAdvice("INTENT_EXPIRED").requiresFreshPreparation).toBe(true);
    const retried = retryStep({ mission: (blocked as any).mission, stepId: "prepare-swap" });
    const step = (retried as any).mission.steps.find((s: any) => s.id === "prepare-swap");
    expect(step.state).toBe("PLANNED");
    expect(step.linkedActionIntentId).toBeNull();
  });
});

describe("V17 mission edits", () => {
  it("reports the invalidated suffix before accepting a material edit", () => {
    const m = mission("Swap 20 USDT to BOT and stake it");
    const nextGoal = mergeGoalTurn({ goal: { ...m.goal, amount: null }, text: "10 USDT" });
    const preview = previewEdit({ mission: m, nextGoal });
    expect(preview.material).toBe(true);
    expect(preview.invalidatedStepIds).toContain("prepare-swap");
    expect(preview.invalidatedStepIds).toContain("prepare-stake");
  });

  it("keeps completed steps and replans the rest", () => {
    const m = completeWallet(mission("Swap 20 USDT to BOT and stake it"));
    const nextGoal = { ...m.goal, amount: "10" };
    const edited = applyEdit({ mission: m, nextGoal });
    expect(edited.steps.find((s) => s.id === "check-wallet")!.state).toBe("COMPLETED");
    expect(edited.steps.find((s) => s.id === "prepare-swap")!.state).toBe("PLANNED");
    expect(edited.steps.find((s) => s.id === "prepare-swap")!.inputs.amount).toBe("10");
    expect(edited.version).toBe(m.version + 1);
  });

  it("treats a non-economic edit as immaterial", () => {
    const m = mission("Swap 20 USDT to BOT");
    const preview = previewEdit({ mission: m, nextGoal: { ...m.goal } });
    expect(preview.material).toBe(false);
    expect(preview.invalidatedStepIds).toEqual([]);
  });

  it("computes the transitive dependent suffix", () => {
    const m = mission("Swap 20 USDT to BOT and stake it");
    expect(dependentSuffix(m, ["verify-swap"])).toEqual([
      "verify-swap",
      "resolve-output",
      "prepare-stake",
      "approve-flow-if-required",
      "user-stake",

      "verify-stake",
    ]);
  });
});
