/**
 * FlowBridge V12 — Points→FLOW conversion policy holder.
 *
 * AUDIT RESULT (V12 gate): no canonical, source-controlled FLOW tokenomics or
 * PTS→FLOW conversion specification exists in this repository, its docs, or its
 * deployment config. Therefore the policy below is intentionally `null` and all
 * on-chain FLOW claim authorization is fail-closed.
 *
 * Do NOT populate this from chat history, guesses, or UI/env values. It may only
 * be filled from an approved, reviewed specification committed to the repo.
 */

export interface FlowConversionPolicy {
  /** How many FLOW base units one claimable FLOW Point converts to. */
  flowWeiPerPoint: bigint;
  /** Identifier of the approved specification document/commit. */
  approvedSpecRef: string;
}

export const FLOW_CONVERSION_POLICY: FlowConversionPolicy | null = null;

export function isFlowConversionPolicyApproved(
  policy: FlowConversionPolicy | null = FLOW_CONVERSION_POLICY,
): boolean {
  return !!policy && policy.flowWeiPerPoint > 0n && policy.approvedSpecRef.length > 0;
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
