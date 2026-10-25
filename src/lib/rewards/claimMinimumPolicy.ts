/**
 * Mainnet claim minimum policy.
 *
 * Historical policy (rounds #1–#3, owner-approved 2026-10-06): regular claims
 * needed >= 1,000 eligible, funded FLOW Points. Stored batches for those
 * rounds keep their recorded terms and are never rebuilt.
 *
 * V37 owner policy (2026-10-25): the 1,000-Point minimum is REMOVED for new
 * operator-approved payouts. Any positive amount of verified, funded, eligible
 * Points may be included in a new settlement round (epoch 4+). Conversion
 * stays 1 Point = 1 FLOW; earning limits, backing and duplicate rules are
 * unchanged. Historical rounds and their canary exception are untouched.
 *
 * The payout contract does NOT enforce any minimum on-chain (claim() only
 * checks the Merkle proof, window, pause and bitmap), so the minimum is
 * enforced here, in the server-controlled allocation builder, and in the UI.
 */
export const MAINNET_MIN_CLAIM_FLOW = 1_000;

/** V37: minimum for NEW operator-approved rounds (epoch 4+). Any positive amount qualifies. */
export const MIN_OPS_CLAIM_FLOW = 1;

/** Rounds at or below this epoch are preserved under their historical terms (round #3 stored, unpublished). */
export const LAST_PRESERVED_EPOCH = 3;

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

/** Minimum that applies to a round: historical rounds keep 1,000; new Ops-approved rounds use the V37 minimum. */
export function claimMinimumForEpoch(epochId: number | null | undefined): number {
  // Unknown epoch (legacy/draft callers) fails closed under the historical minimum;
  // new Ops-approved rounds always carry an explicit epoch > LAST_PRESERVED_EPOCH.
  return epochId == null || epochId <= LAST_PRESERVED_EPOCH ? MAINNET_MIN_CLAIM_FLOW : MIN_OPS_CLAIM_FLOW;
}

/** True when this allocation leaf may be included in a settlement round. */
export function leafMeetsClaimMinimum(epochId: number | null | undefined, wallet: string, points: number): boolean {
  return Math.floor(points) >= claimMinimumForEpoch(epochId) || isCanaryException(epochId, wallet, Math.floor(points));
}

/** Progress toward the next (new-round) claim threshold. */
export function claimMinimumProgress(eligibleFundedPoints: number | null | undefined, minimum: number = MIN_OPS_CLAIM_FLOW) {
  const current = Math.max(0, Math.floor(Number(eligibleFundedPoints) || 0));
  return {
    current,
    minimum,
    remaining: Math.max(0, minimum - current),
    progress: Math.min(1, minimum > 0 ? current / minimum : 1),
    meetsMinimum: current >= minimum,
    label: `${current.toLocaleString("en-US")} verified FLOW ready for payout approval`,
  };
}
