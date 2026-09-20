/**
 * V30.2B P4A.2 — FlowBridge FLOW/USDT route circuit breaker.
 *
 * Application-side protection for transaction *preparation* only. It never
 * touches the BDEX pool, never freezes liquidity, never seizes funds and never
 * prevents a user from trading on BDEX directly. It only decides whether
 * FlowBridge is willing to prepare a swap, with what slippage cap, and at what
 * price-impact ceiling.
 *
 * Hard rules encoded here:
 *  - 30% is a BREAKER THRESHOLD, never a slippage value.
 *  - The absolute user slippage ceiling is 5% (500 bps) in every mode.
 *  - A failed / malformed / short reference read fails CLOSED (paused).
 *  - Recovery requires deviation within 5% for 30 continuous minutes.
 */

export type ProtectionMode = "normal" | "caution" | "protective" | "severe" | "paused";

/** Reference availability for the breaker calculation. */
export type ReferenceState =
  | "ready"    // real multi-observation TWAP history covering the window
  | "warmup"   // pool is too young for a trustworthy window (known, not an error)
  | "failed";  // read failed / malformed / window not covered → fail closed

export const BREAKER_DEVIATION_BPS = 3000;      // 30% — threshold only
export const ABSOLUTE_SLIPPAGE_CAP_BPS = 500;   // 5% — never exceeded
export const RECOVERY_DEVIATION_BPS = 500;      // 5%
export const RECOVERY_WINDOW_SECONDS = 1800;    // 30 continuous minutes
export const FAST_TWAP_SECONDS = 1800;          // 30m protection reference
export const REGIME_TWAP_SECONDS = 21600;       // 6h regime confirmation
export const ORACLE_TWAP_SECONDS = 604800;      // 7d — staking-oracle candidate only

export interface ProtectionPolicy {
  mode: ProtectionMode;
  /** Auto slippage cap in bps. Always <= ABSOLUTE_SLIPPAGE_CAP_BPS. */
  slippageCapBps: number;
  /** Maximum quoted price impact FlowBridge will prepare, in bps. */
  maxPriceImpactBps: number;
  /** True when an oversized amount must be reduced instead of widening slippage. */
  reduceAmountToFit: boolean;
  /** Human reason, shown in the UI. */
  reason: string;
}

const NORMAL: ProtectionPolicy = {
  mode: "normal",
  slippageCapBps: 100,
  maxPriceImpactBps: 200,
  reduceAmountToFit: false,
  reason: "Reference deviation below 2%.",
};

/**
 * Resolve the protection policy from the live-vs-reference deviation.
 * `deviationBps` is ignored when the reference is not usable.
 */
export function evaluateProtection(input: {
  deviationBps: number | null;
  referenceState: ReferenceState;
}): ProtectionPolicy {
  if (input.referenceState === "failed") {
    return {
      mode: "paused",
      slippageCapBps: NORMAL.slippageCapBps,
      maxPriceImpactBps: 0,
      reduceAmountToFit: false,
      reason: "Protection reference unavailable — swap preparation is paused (fail closed).",
    };
  }
  if (input.referenceState === "warmup") {
    return {
      ...NORMAL,
      reason: "Observation history is still warming up — normal 1% cap with live quote checks.",
    };
  }
  const dev = input.deviationBps;
  if (dev === null || !Number.isFinite(dev) || dev < 0) {
    return {
      mode: "paused",
      slippageCapBps: NORMAL.slippageCapBps,
      maxPriceImpactBps: 0,
      reduceAmountToFit: false,
      reason: "Reference deviation is malformed — swap preparation is paused (fail closed).",
    };
  }
  if (dev >= BREAKER_DEVIATION_BPS) {
    return {
      mode: "paused",
      slippageCapBps: NORMAL.slippageCapBps,
      maxPriceImpactBps: 0,
      reduceAmountToFit: false,
      reason: "Circuit breaker active: reference deviation is 30% or more.",
    };
  }
  if (dev >= 1000) {
    return {
      mode: "severe",
      slippageCapBps: ABSOLUTE_SLIPPAGE_CAP_BPS,
      maxPriceImpactBps: 100,
      reduceAmountToFit: true,
      reason: "Severe deviation (10%+): amount is reduced until price impact fits.",
    };
  }
  if (dev >= 500) {
    return {
      mode: "protective",
      slippageCapBps: 300,
      maxPriceImpactBps: 100,
      reduceAmountToFit: false,
      reason: "Protective mode: reference deviation between 5% and 10%.",
    };
  }
  if (dev >= 200) {
    return {
      mode: "caution",
      slippageCapBps: 200,
      maxPriceImpactBps: 150,
      reduceAmountToFit: false,
      reason: "Caution mode: reference deviation between 2% and 5%.",
    };
  }
  return NORMAL;
}

/** Clamp any user slippage request to the active mode and the absolute ceiling. */
export function clampSlippageBps(requestedBps: number, policy: ProtectionPolicy): number {
  const ceiling = Math.min(policy.slippageCapBps, ABSOLUTE_SLIPPAGE_CAP_BPS);
  if (!Number.isFinite(requestedBps) || requestedBps <= 0) return ceiling;
  return Math.min(Math.floor(requestedBps), ceiling);
}

/**
 * Largest input amount whose quoted price impact still fits the ceiling.
 * Impact scales ~linearly in size inside the active range, so we scale down
 * and keep a 5% safety margin. Returns 0n when no size fits.
 */
export function maxSafeAmountIn(
  amountIn: bigint,
  quotedImpactBps: number,
  ceilingBps: number,
): bigint {
  if (amountIn <= 0n || ceilingBps <= 0) return 0n;
  if (!Number.isFinite(quotedImpactBps) || quotedImpactBps <= 0) return amountIn;
  if (quotedImpactBps <= ceilingBps) return amountIn;
  const scaled = (amountIn * BigInt(Math.floor(ceilingBps * 95))) / BigInt(Math.ceil(quotedImpactBps * 100));
  return scaled > 0n ? scaled : 0n;
}

export interface PreparationInput {
  chainOk: boolean;
  /** Pool resolved from the factory with active in-range liquidity. */
  poolActive: boolean;
  /** Fee tier of the quoted route. Must be the live 1% tier. */
  routeFee: number | null;
  expectedRouteFee: number;
  /** Live quote output; 0n or null means the quote failed. */
  amountOut: bigint | null;
  quotedImpactBps: number | null;
  amountIn: bigint;
  policy: ProtectionPolicy;
}

export interface PreparationDecision {
  allowed: boolean;
  reason: string;
  /** Present when the requested amount exceeds the impact ceiling. */
  maxSafeAmountIn?: bigint;
  slippageBps: number;
}

/** Fail-closed gate run before a wallet signature is offered. */
export function evaluatePreparation(input: PreparationInput): PreparationDecision {
  const slippageBps = clampSlippageBps(input.policy.slippageCapBps, input.policy);
  const block = (reason: string, extra?: Partial<PreparationDecision>): PreparationDecision => ({
    allowed: false,
    reason,
    slippageBps,
    ...extra,
  });

  if (input.policy.mode === "paused") return block(input.policy.reason);
  if (!input.chainOk) return block("Wrong network — switch to BOT Mainnet to continue.");
  if (!input.poolActive) return block("No active liquidity in the FLOW/USDT range right now.");
  if (input.routeFee === null || input.routeFee !== input.expectedRouteFee) {
    return block("Route or fee tier mismatch — only the live 1% FLOW/USDT pool can be prepared.");
  }
  if (input.amountIn <= 0n) return block("Enter an amount to continue.");
  if (input.amountOut === null || input.amountOut <= 0n) {
    return block("Live quote failed — preparation is blocked.");
  }
  const impact = input.quotedImpactBps;
  if (impact === null || !Number.isFinite(impact) || impact < 0) {
    return block("Price impact could not be measured — preparation is blocked.");
  }
  if (impact > input.policy.maxPriceImpactBps) {
    return block(
      `Price impact ${(impact / 100).toFixed(2)}% exceeds the ${(input.policy.maxPriceImpactBps / 100).toFixed(2)}% limit for ${input.policy.mode} mode.`,
      { maxSafeAmountIn: maxSafeAmountIn(input.amountIn, impact, input.policy.maxPriceImpactBps) },
    );
  }
  return { allowed: true, reason: input.policy.reason, slippageBps };
}

/** Everything that invalidates a prepared transaction when it changes. */
export interface PreparationFingerprintInput {
  chainId: number;
  pool: string;
  routerId: number;
  routeFee: number;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  mode: ProtectionMode;
}

export function preparationFingerprint(i: PreparationFingerprintInput): string {
  return [
    i.chainId,
    i.pool.toLowerCase(),
    i.routerId,
    i.routeFee,
    i.tokenIn.toLowerCase(),
    i.tokenOut.toLowerCase(),
    i.amountIn.toString(),
    i.mode,
  ].join("|");
}

/** True when the revalidated state no longer matches what the user approved. */
export function isPreparationStale(approved: string, revalidated: string): boolean {
  return approved !== revalidated;
}

/**
 * Breaker recovery timer. After a trigger, deviation must stay within 5% for
 * 30 continuous minutes before FlowBridge leaves the paused state.
 */
export class BreakerRecovery {
  private trippedAt: number | null = null;
  private calmSince: number | null = null;

  /** Feed a reference observation. Returns true while still paused. */
  observe(atSeconds: number, deviationBps: number | null, referenceState: ReferenceState): boolean {
    const unusable = referenceState !== "ready" || deviationBps === null || !Number.isFinite(deviationBps);
    if (referenceState === "failed" || (unusable && referenceState !== "warmup")) {
      this.trippedAt = atSeconds;
      this.calmSince = null;
      return true;
    }
    if (referenceState === "warmup") return this.trippedAt !== null;

    if ((deviationBps as number) >= BREAKER_DEVIATION_BPS) {
      this.trippedAt = atSeconds;
      this.calmSince = null;
      return true;
    }
    if (this.trippedAt === null) return false;

    if ((deviationBps as number) <= RECOVERY_DEVIATION_BPS) {
      if (this.calmSince === null) this.calmSince = atSeconds;
      if (atSeconds - this.calmSince >= RECOVERY_WINDOW_SECONDS) {
        this.trippedAt = null;
        this.calmSince = null;
        return false;
      }
      return true;
    }
    this.calmSince = null;
    return true;
  }

  get paused(): boolean {
    return this.trippedAt !== null;
  }

  /** Seconds of calm still required before recovery, or null when not paused. */
  secondsUntilRecovery(nowSeconds: number): number | null {
    if (this.trippedAt === null) return null;
    if (this.calmSince === null) return RECOVERY_WINDOW_SECONDS;
    return Math.max(0, RECOVERY_WINDOW_SECONDS - (nowSeconds - this.calmSince));
  }
}
