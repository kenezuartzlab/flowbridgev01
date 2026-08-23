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

/* ---------------------------------------------------------------------------
 * FlowBridge V17.1E — stake handoff consumption + actor pinning.
 *
 * The V17.1D resolver above only accepted a claim-derived `resolvedAmount`. A
 * mission whose stake amount came from the goal itself (the live 500 FLOW
 * fixture) therefore resolved to NOTHING and `/stake` silently opened with its
 * standalone 10 FLOW default. V17.1E makes the prepared Mission amount the ONLY
 * initializer when a handoff exists, and every failure explicit.
 * ------------------------------------------------------------------------- */

export const STAKE_HANDOFF_FAILURES = [
  "MISSING_HANDOFF",
  "EXPIRED",
  "WALLET_CONTEXT_CHANGED",
  "CHAIN_MISMATCH",
  "AMOUNT_MISSING_OR_INVALID",
  "VAULT_MISMATCH",
  "HANDOFF_HYDRATION_FAILED",
] as const;

export type StakeHandoffFailure = (typeof STAKE_HANDOFF_FAILURES)[number];

export const STAKE_HANDOFF_FAILURE_COPY: Record<StakeHandoffFailure, string> = {
  MISSING_HANDOFF:
    "No prepared mission stake was found for this link, so nothing was prefilled. Return to Flow AI and prepare the stake again.",
  EXPIRED:
    "This mission's prepared stake expired before it was signed. Your completed claim is untouched — return to Flow AI and re-prepare the stake.",
  WALLET_CONTEXT_CHANGED:
    "WALLET CONTEXT CHANGED — this mission was prepared for another wallet. Return to Flow AI and re-prepare or revalidate the stake.",
  CHAIN_MISMATCH:
    "This mission was prepared for BOT Testnet 968. Switch your wallet to that network before staking.",
  AMOUNT_MISSING_OR_INVALID:
    "The mission's stake amount could not be loaded, so nothing was prefilled. No standalone default is used for a mission stake.",
  VAULT_MISMATCH:
    "The canonical staking vault does not match the vault this mission prepared, so the stake is blocked.",
  HANDOFF_HYDRATION_FAILED:
    "This mission stake was validated but could not be loaded into the form, so nothing was prefilled.",
};

/** The canonical, server-resolved stake handoff object (V17.1E §3). */
export interface CanonicalStakeHandoff {
  missionId: string;
  missionStepId: string;
  actionIntentId: string | null;
  actionType: "STAKE_FLOW";
  /** Exact decimal display string, e.g. "500". */
  amount: string;
  /** Base-unit string, the authoritative prepared amount. */
  amountWei: string;
  chainId: number;
  /** The wallet the mission was prepared for. */
  actorWallet: string | null;
  vault: string | null;
  economicFingerprint: string | null;
  expiresAt: string | null;
  derivation: DerivationProvenance | null;
  note: string;
}

export type CanonicalStakeHandoffResult =
  | { ok: true; handoff: CanonicalStakeHandoff }
  | { ok: false; failure: StakeHandoffFailure; message: string };

export function stakeHandoffFailure(failure: StakeHandoffFailure): CanonicalStakeHandoffResult {
  return { ok: false, failure, message: STAKE_HANDOFF_FAILURE_COPY[failure] };
}

/**
 * §4 — the mission's prepared stake amount, in precedence order:
 * canonical claim derivation → prepared base units → planned step amount →
 * the exact amount the user stated in the goal. Never a standalone default.
 */
export function deriveMissionStakeAmount(
  mission: Mission,
  stepId?: string | null,
): { step: MissionStep; amount: string; derivation: DerivationProvenance | null } | null {
  const step = stakeStepFor(mission, stepId ?? "");
  if (!step) return null;
  const wei = step.outputs.resolvedAmountWei as string | undefined;
  const candidates: (string | undefined)[] = [
    step.outputs.resolvedAmount as string | undefined,
    wei && /^\d+$/.test(wei) ? weiToFlow(wei) : undefined,
    step.inputs.amount as string | undefined,
    mission.goal?.amount ?? undefined,
  ];
  const amount = candidates.find((c) => typeof c === "string" && EXACT_AMOUNT.test(c) && Number(c) > 0);
  if (!amount) return null;
  return {
    step,
    amount,
    derivation: (step.outputs.derivation as DerivationProvenance | undefined) ?? null,
  };
}

const FLOW_DECIMALS = 18;

/** Base-unit string → exact FLOW decimal string (no floats). */
export function weiToFlow(wei: string): string {
  const digits = BigInt(wei).toString().padStart(FLOW_DECIMALS + 1, "0");
  const whole = digits.slice(0, digits.length - FLOW_DECIMALS);
  const frac = digits.slice(digits.length - FLOW_DECIMALS).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

/** Exact FLOW decimal string → base-unit string (truncating, never rounding). */
export function flowToWei(amount: string): string {
  if (!EXACT_AMOUNT.test(amount)) throw new Error("INVALID_AMOUNT");
  const [whole, frac = ""] = amount.split(".");
  return BigInt(whole + frac.slice(0, FLOW_DECIMALS).padEnd(FLOW_DECIMALS, "0")).toString();
}

/**
 * §5/§6 — actor, chain and vault pinning. Runs in the browser against the
 * CONNECTED wallet, on top of the server's own ownership checks. A mismatch is
 * always visible and never resolved by silently switching wallet, chain or vault.
 */
export function pinStakeExecutionContext(input: {
  handoff: CanonicalStakeHandoff;
  connectedWallet: string | null;
  connectedChainId: number | null;
  canonicalVault: string | null;
}): StakeHandoffFailure | null {
  const { handoff } = input;
  const same = (a: string | null, b: string | null) =>
    !!a && !!b && a.toLowerCase() === b.toLowerCase();
  if (handoff.actorWallet && input.connectedWallet && !same(handoff.actorWallet, input.connectedWallet)) {
    return "WALLET_CONTEXT_CHANGED";
  }
  if (input.connectedChainId != null && input.connectedChainId !== handoff.chainId) {
    return "CHAIN_MISMATCH";
  }
  if (handoff.vault && input.canonicalVault && !same(handoff.vault, input.canonicalVault)) {
    return "VAULT_MISMATCH";
  }
  return null;
}

