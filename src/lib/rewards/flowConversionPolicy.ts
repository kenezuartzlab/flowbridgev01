/**
 * FlowBridge V12.2 — FLOW Points→FLOW conversion policy holder.
 *
 * The owner approved a conversion policy for BOT TESTNET (968) ONLY:
 *   1 FLOW Point = 1 FLOW (1e18 base units), cumulative entitlement,
 *   Campaign PTS never included, 900-second authorization lifetime.
 *
 * Every other chain — including BOT Mainnet 677 — remains UNAPPROVED and
 * fail-closed. Do NOT populate a mainnet policy from chat history, UI copy or
 * env values; it may only be filled from an approved, reviewed specification
 * committed to the repo.
 */
import { APPROVED_BOT_TESTNET } from "./flowApprovedTestnetPolicy";

export interface FlowConversionPolicy {
  /** How many FLOW base units one claimable FLOW Point converts to. */
  flowWeiPerPoint: bigint;
  /** Identifier of the approved specification document/commit. */
  approvedSpecRef: string;
}

/** Owner-approved BOT Testnet validation policy (testnet only). */
export const FLOW_TESTNET_CONVERSION_POLICY: FlowConversionPolicy = {
  flowWeiPerPoint: APPROVED_BOT_TESTNET.claim.flowWeiPerPoint,
  approvedSpecRef: APPROVED_BOT_TESTNET.claim.conversionPolicyRef,
};

/**
 * Global/default policy: still null. There is no chain-agnostic approved
 * conversion policy, and mainnet has none at all.
 */
export const FLOW_CONVERSION_POLICY: FlowConversionPolicy | null = null;

/** Chain-scoped resolution. Only BOT Testnet 968 has an approved policy. */
export function getFlowConversionPolicy(chainId: number | null | undefined): FlowConversionPolicy | null {
  if (chainId === APPROVED_BOT_TESTNET.chainId) return FLOW_TESTNET_CONVERSION_POLICY;
  return FLOW_CONVERSION_POLICY;
}

export function isFlowConversionPolicyApproved(
  policy: FlowConversionPolicy | null = FLOW_CONVERSION_POLICY,
): boolean {
  return !!policy && policy.flowWeiPerPoint > 0n && policy.approvedSpecRef.length > 0;
}

/** Convenience: is there an approved policy for this exact chain? */
export function isFlowConversionPolicyApprovedForChain(chainId: number | null | undefined): boolean {
  return isFlowConversionPolicyApproved(getFlowConversionPolicy(chainId));
}

/**
 * Cumulative FLOW entitlement (base units) for a lifetime claimed-points total.
 * Returns null whenever no approved policy exists — never a guessed value.
 */
export function cumulativeFlowEntitlement(
  lifetimeClaimedPoints: number,
  policy: FlowConversionPolicy | null = FLOW_CONVERSION_POLICY,
): bigint | null {
  if (!isFlowConversionPolicyApproved(policy)) return null;
  const points = Math.max(0, Math.floor(Number(lifetimeClaimedPoints) || 0));
  return BigInt(points) * policy!.flowWeiPerPoint;
}
