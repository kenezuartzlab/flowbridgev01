/**
 * FlowBridge V17.1D §5 — claim → stake handoff, read on the /stake surface.
 *
 * A mission NEVER carries authority or calldata into a product surface. The link
 * carries opaque correlation (mission id, step id, prepared intent id) plus, at
 * most, a display amount hint. The AUTHORITATIVE derived stake amount is read
 * back from the mission's own server state (the PREPARE_STAKE step outputs and
 * their derivation provenance), and the user's wallet still signs.
 *
 * Fail-closed: a malformed link, a missing mission, a missing derivation or a
 * hint that disagrees with the canonical derivation resolves to NO prefill.
 *
 * Pure module.
 */
import type { Mission, MissionStep } from "./missionTypes";
import type { DerivationProvenance } from "./settlementDerivation";
import { parseClaimHandoffCorrelation, type ClaimHandoffCorrelation } from "./claimHandoff";

export interface StakeHandoffHint {
  correlation: ClaimHandoffCorrelation | null;
  /** Display-only amount hint from the link. Never trusted on its own. */
  amountHint: string | null;
}

const EXACT_AMOUNT = /^\d+(\.\d+)?$/;

/** Parses the /stake query string. Malformed amounts are dropped, never coerced. */
export function parseStakeHandoff(search: string): StakeHandoffHint {
  const correlation = parseClaimHandoffCorrelation(search);
  let amountHint: string | null = null;
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const raw = (params.get("amount") ?? "").trim();
    if (EXACT_AMOUNT.test(raw) && Number(raw) > 0) amountHint = raw;
  } catch {
    amountHint = null;
  }
  return { correlation, amountHint };
}

export type StakeHandoffResolution =
  | { ok: false; reason: string }
  | {
      ok: true;
      missionId: string;
      stepId: string;
      /** Exact decimal string derived from the canonical claim settlement. */
      amount: string;
      derivation: DerivationProvenance | null;
      note: string;
    };

function stakeStepFor(mission: Mission, stepId: string): MissionStep | null {
  const exact = mission.steps.find((s) => s.id === stepId);
  if (exact && exact.type === "PREPARE_STAKE") return exact;
  return mission.steps.find((s) => s.type === "PREPARE_STAKE") ?? null;
}

/**
 * Resolves the derived stake amount from the mission itself. This is the ONLY
 * value the surface may prefill.
 */
export function resolveStakeHandoff(input: {
  hint: StakeHandoffHint;
  missions: readonly Mission[];
}): StakeHandoffResolution {
  const correlation = input.hint.correlation;
  if (!correlation) return { ok: false, reason: "NO_CORRELATION" };
  const mission = input.missions.find((m) => m.id === correlation.missionId);
  if (!mission) {
    return { ok: false, reason: "This staking link no longer matches an active mission." };
  }
  const step = stakeStepFor(mission, correlation.stepId);
  if (!step) {
    return { ok: false, reason: "That mission has no staking step, so nothing was prefilled." };
  }
  const amount = step.outputs.resolvedAmount as string | undefined;
  if (!amount || !EXACT_AMOUNT.test(amount) || Number(amount) <= 0) {
    return {
      ok: false,
      reason:
        "The mission's stake amount is not derived from a verified claim yet, so nothing was prefilled.",
    };
  }
  const hint = input.hint.amountHint;
  if (hint && hint !== amount && Number(hint) !== Number(amount)) {
    return {
      ok: false,
      reason:
        "The amount in this link disagrees with the mission's verified derivation, so nothing was prefilled.",
    };
  }
  const derivation = (step.outputs.derivation as DerivationProvenance | undefined) ?? null;
  return {
    ok: true,
    missionId: mission.id,
    stepId: step.id,
    amount,
    derivation,
    note: derivation
      ? `Prefilled ${amount} FLOW — ${derivation.ratioPercent}% of the ${formatSourceAmount(derivation)} FLOW your claim actually delivered. You still confirm the stake in your own wallet.`
      : `Prefilled ${amount} FLOW from your mission's verified claim settlement. You still confirm the stake in your own wallet.`,
  };
}

function formatSourceAmount(p: DerivationProvenance): string {
  try {
    const raw = BigInt(p.actualWei);
    const base = 10n ** BigInt(p.decimals);
    const whole = raw / base;
    const frac = (raw % base).toString().padStart(p.decimals, "0").slice(0, 4).replace(/0+$/, "");
    return `${whole.toString()}${frac ? `.${frac}` : ""}`;
  } catch {
    return "claimed";
  }
}
