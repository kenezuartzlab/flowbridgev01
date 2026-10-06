/**
 * Owner-approved Mainnet claim minimum (final policy, 2026-10-06).
 *
 * - Regular claims need >= 1,000 eligible, funded FLOW Points (1 point = 1 FLOW).
 * - Below the minimum, users keep accruing; no normal claim, no auto-settlement leaf.
 * - Verified + funded signup/referral bonuses count toward the minimum.
 * - The payout contract does NOT enforce any minimum on-chain (claim() only checks
 *   the Merkle proof, window, pause and bitmap), so the minimum is enforced here,
 *   in the server-controlled allocation builder, and in the UI.
 * - Single exception: the round #2 controlled canary for kentrosh2002 (10 FLOW).
 */
export const MAINNET_MIN_CLAIM_FLOW = 1_000;

export const MAINNET_CLAIM_CANARY_EXCEPTION = Object.freeze({
  epochId: 2,
  wallet: "0x628e237b73c5a37ef3968527563fa1a26b32bb97",
  points: 10,
});

export const CONTRACT_ENFORCES_MIN_CLAIM = false;

export function isCanaryException(epochId: number | null | undefined, wallet: string, points: number): boolean {
  const e = MAINNET_CLAIM_CANARY_EXCEPTION;
  return epochId === e.epochId && wallet.toLowerCase() === e.wallet && points === e.points;
}

/** True when this allocation leaf may be included in a settlement round. */
export function leafMeetsClaimMinimum(epochId: number | null | undefined, wallet: string, points: number): boolean {
  return Math.floor(points) >= MAINNET_MIN_CLAIM_FLOW || isCanaryException(epochId, wallet, Math.floor(points));
}

export function claimMinimumProgress(eligibleFundedPoints: number | null | undefined) {
  const current = Math.max(0, Math.floor(Number(eligibleFundedPoints) || 0));
  return {
    current,
    minimum: MAINNET_MIN_CLAIM_FLOW,
    remaining: Math.max(0, MAINNET_MIN_CLAIM_FLOW - current),
    progress: Math.min(1, current / MAINNET_MIN_CLAIM_FLOW),
    meetsMinimum: current >= MAINNET_MIN_CLAIM_FLOW,
    label: `${current.toLocaleString("en-US")} / ${MAINNET_MIN_CLAIM_FLOW.toLocaleString("en-US")} FLOW toward minimum claim`,
  };
}
