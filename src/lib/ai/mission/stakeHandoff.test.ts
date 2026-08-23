import { describe, expect, it } from "vitest";

import { parseStakeHandoff, resolveStakeHandoff } from "./stakeHandoff";
import type { Mission, MissionStep } from "./missionTypes";

function stakeStep(outputs: Record<string, unknown>): MissionStep {
  return {
    id: "prepare-stake",
    type: "PREPARE_STAKE",
    title: "Prepare stake",
    dependencies: ["verify-claim"],
    state: "PLANNED",
    requiredEvidence: [],
    inputs: {},
    outputs,
    blockingReason: null,
    failureClass: null,
    amountUnresolved: false,
    linkedOpportunityId: null,
    linkedActionIntentId: null,
    linkedVerifiedActivityId: null,
    linkedTxHash: null,
    requiresWalletSignature: false,
  } as MissionStep;
}

function mission(step: MissionStep): Mission {
  return { id: "m1", steps: [step] } as unknown as Mission;
}

describe("V17.1D stake handoff", () => {
  it("resolves the derived amount from the mission, not the link", () => {
    const hint = parseStakeHandoff("?amount=503.5&mission=m1&mstep=prepare-stake&intent=i1");
    expect(hint.amountHint).toBe("503.5");
    const res = resolveStakeHandoff({
      hint,
      missions: [mission(stakeStep({ resolvedAmount: "503.5" }))],
    });
    expect(res.ok && res.amount).toBe("503.5");
  });

  it("fails closed when the link amount disagrees with the derivation", () => {
    const hint = parseStakeHandoff("?amount=10&mission=m1&mstep=prepare-stake");
    const res = resolveStakeHandoff({
      hint,
      missions: [mission(stakeStep({ resolvedAmount: "503.5" }))],
    });
    expect(res.ok).toBe(false);
  });

  it("fails closed when the mission has no derived amount yet", () => {
    const hint = parseStakeHandoff("?mission=m1&mstep=prepare-stake");
    const res = resolveStakeHandoff({ hint, missions: [mission(stakeStep({}))] });
    expect(res.ok).toBe(false);
  });

  it("ignores links with no correlation", () => {
    const res = resolveStakeHandoff({
      hint: parseStakeHandoff("?amount=10"),
      missions: [mission(stakeStep({ resolvedAmount: "1" }))],
    });
    expect(res).toEqual({ ok: false, reason: "NO_CORRELATION" });
  });
});
