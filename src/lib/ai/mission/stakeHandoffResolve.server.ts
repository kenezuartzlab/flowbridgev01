/**
 * FlowBridge V17.1E §3 — server-resolved stake handoff.
 *
 * `/stake` may not trust any client-supplied amount, wallet, chain or contract.
 * It sends opaque correlation (mission id, step id, prepared intent id) and this
 * resolver re-derives every economic field from the owning user's OWN mission
 * state plus the canonical prepared ActionIntent and the staking registry.
 *
 * Authority boundary unchanged: this returns a plan for a form to hydrate. The
 * user's wallet still signs approval and stake as two separate confirmations.
 */
import { getFlowStakingChainConfig } from "@/lib/staking/flowStakingRegistry";
import type { Mission } from "./missionTypes";
import {
  deriveMissionStakeAmount,
  flowToWei,
  stakeHandoffFailure,
  type CanonicalStakeHandoff,
  type CanonicalStakeHandoffResult,
} from "./stakeHandoff";

const CANONICAL_STAKE_CHAIN_ID = 968;

export async function resolveStakeHandoffForUser(input: {
  mission: Mission;
  stepId: string | null;
  intentId: string | null;
  userId: string;
  /** The wallet bound to the authenticated account. */
  boundWallet: string | null;
  now?: Date;
}): Promise<CanonicalStakeHandoffResult> {
  const derived = deriveMissionStakeAmount(input.mission, input.stepId);
  if (!derived) return stakeHandoffFailure("MISSING_HANDOFF");
  const { step } = derived;

  const chainId = input.mission.goal.chainId;
  if (chainId !== CANONICAL_STAKE_CHAIN_ID) return stakeHandoffFailure("CHAIN_MISMATCH");

  const registry = getFlowStakingChainConfig(chainId);
  const canonicalVault = registry?.vault ?? null;
  if (!canonicalVault) return stakeHandoffFailure("VAULT_MISMATCH");

  const preparedVault = (step.outputs.vault as string | undefined) ?? null;
  if (preparedVault && preparedVault.toLowerCase() !== canonicalVault.toLowerCase()) {
    return stakeHandoffFailure("VAULT_MISMATCH");
  }

  /**
   * The ActionIntent amount is authoritative when the step has one. It is read
   * back by opaque id for the OWNING user, so a leaked link resolves nothing.
   */
  const actionIntentId =
    input.intentId ??
    step.linkedActionIntentId ??
    (step.outputs.preparedActionIntentId as string | null) ??
    null;

  let amount = derived.amount;
  let expiresAt: string | null = null;
  let fingerprint: string | null = null;
  let intentWallet: string | null = null;

  if (actionIntentId) {
    const { resolvePreparedIntentForUser } = await import("@/lib/ai/preparedIntentStore.server");
    const resolution = await resolvePreparedIntentForUser({
      intentId: actionIntentId,
      userId: input.userId,
      now: input.now,
    });
    if (resolution.status === "EXPIRED") return stakeHandoffFailure("EXPIRED");
    const canonical = resolution.canonical;
    if (canonical) {
      if (canonical.type !== "STAKE_FLOW") return stakeHandoffFailure("MISSING_HANDOFF");
      if (canonical.chainId !== chainId) return stakeHandoffFailure("CHAIN_MISMATCH");
      if (
        canonical.targetContract &&
        canonical.targetContract.toLowerCase() !== canonicalVault.toLowerCase()
      ) {
        return stakeHandoffFailure("VAULT_MISMATCH");
      }
      const raw = (canonical.parameters as Record<string, unknown>)?.["amountFlow"];
      const display =
        typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";
      if (/^\d+(\.\d+)?$/.test(display) && Number(display) > 0) amount = display;
      expiresAt = canonical.expiresAt;
      fingerprint = canonical.digest;
      intentWallet = canonical.actorWallet ?? null;
    }
  }

  let amountWei: string;
  try {
    amountWei = flowToWei(amount);
  } catch {
    return stakeHandoffFailure("AMOUNT_MISSING_OR_INVALID");
  }
  if (BigInt(amountWei) <= 0n) return stakeHandoffFailure("AMOUNT_MISSING_OR_INVALID");

  /**
   * §5 — actor pinning. The mission actor is the intent's wallet (or the wallet
   * that settled an earlier step); it must still equal the account's bound
   * wallet. Never silently substitute another known wallet.
   */
  const pinnedSettlement = input.mission.steps
    .map((s) => s.outputs.settlementWallet)
    .find((w): w is string => typeof w === "string" && /^0x[a-fA-F0-9]{40}$/.test(w)) ?? null;
  const actorWallet = intentWallet ?? pinnedSettlement ?? input.boundWallet;
  if (actorWallet && input.boundWallet && actorWallet.toLowerCase() !== input.boundWallet.toLowerCase()) {
    return stakeHandoffFailure("WALLET_CONTEXT_CHANGED");
  }
  if (actorWallet && !input.boundWallet) return stakeHandoffFailure("WALLET_CONTEXT_CHANGED");

  const handoff: CanonicalStakeHandoff = {
    missionId: input.mission.id,
    missionStepId: step.id,
    actionIntentId,
    actionType: "STAKE_FLOW",
    amount,
    amountWei,
    chainId,
    actorWallet: actorWallet ?? null,
    vault: canonicalVault,
    economicFingerprint: fingerprint,
    expiresAt,
    derivation: derived.derivation,
    note: derived.derivation
      ? `Prefilled ${amount} FLOW derived from your mission's verified claim settlement (${derived.derivation.ratioPercent}%). You still confirm approval and the stake in your own wallet.`
      : `Prefilled ${amount} FLOW from your mission's prepared stake. You still confirm approval and the stake in your own wallet.`,
  };
  return { ok: true, handoff };
}
