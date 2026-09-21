/**
 * V30.2B P4A.2 / P4A.2.1 — FlowBridge FLOW/USDT route circuit breaker.
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
 *  - A risk pause (`paused_risk`) requires VALID price evidence. A failed or
 *    malformed reference read is `reference_unavailable`: retryable, blocks only
 *    the current preparation, and self-heals on the next valid read.
 *  - Recovery from a risk pause requires deviation within 5% for 30 continuous
 *    minutes.
 *  - Routes may be multi-hop. What is enforced is the canonical validity of
 *    every hop plus the *effective* execution price, not the identity of the
 *    first hop.
 */

export type ProtectionMode =
  | "normal"
  | "caution"
  | "protective"
  | "severe"
  | "paused_risk"
  | "reference_unavailable";

/** Reference availability for the breaker calculation. */
export type ReferenceState =
  | "ready"    // real multi-observation TWAP history covering the window
  | "warmup"   // pool is too young for a trustworthy window (known, not an error)
  | "failed";  // read failed / malformed / window not covered → retryable, never risk

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
  /** True when the block is a transient condition that retries by itself. */
  retryable: boolean;
  /** Human reason, shown in the UI. */
  reason: string;
}

const NORMAL: ProtectionPolicy = {
  mode: "normal",
  slippageCapBps: 100,
  maxPriceImpactBps: 200,
  reduceAmountToFit: false,
  retryable: false,
  reason: "Reference deviation below 2%.",
};

const UNAVAILABLE: ProtectionPolicy = {
  mode: "reference_unavailable",
  slippageCapBps: NORMAL.slippageCapBps,
  maxPriceImpactBps: 0,
  reduceAmountToFit: false,
  retryable: true,
  reason: "Price protection temporarily unavailable — retrying.",
};

/**
 * Resolve the protection policy from the live-vs-reference deviation.
 * `deviationBps` is ignored when the reference is not usable.
 *
 * A transport/RPC/reference failure is NEVER evidence of a 30% adverse move:
 * it resolves to the retryable `reference_unavailable` state.
 */
export function evaluateProtection(input: {
  deviationBps: number | null;
  referenceState: ReferenceState;
}): ProtectionPolicy {
  if (input.referenceState === "failed") return UNAVAILABLE;
  if (input.referenceState === "warmup") {
    return {
      ...NORMAL,
      reason: "Observation history is still warming up — normal 1% cap with live quote checks.",
    };
  }
  const dev = input.deviationBps;
  if (dev === null || !Number.isFinite(dev) || dev < 0) {
    // Malformed value from an otherwise "ready" read: still not risk evidence.
    return { ...UNAVAILABLE, reason: "Price protection reference is unreadable — retrying." };
  }
  if (dev >= BREAKER_DEVIATION_BPS) {
    return {
      mode: "paused_risk",
      slippageCapBps: NORMAL.slippageCapBps,
      maxPriceImpactBps: 0,
      reduceAmountToFit: false,
      retryable: false,
      reason: "Circuit breaker active: reference deviation is 30% or more.",
    };
  }
  if (dev >= 1000) {
    return {
      mode: "severe",
      slippageCapBps: ABSOLUTE_SLIPPAGE_CAP_BPS,
      maxPriceImpactBps: 100,
      reduceAmountToFit: true,
      retryable: false,
      reason: "Severe deviation (10%+): amount is reduced until price impact fits.",
    };
  }
  if (dev >= 500) {
    return {
      mode: "protective",
      slippageCapBps: 300,
      maxPriceImpactBps: 100,
      reduceAmountToFit: false,
      retryable: false,
      reason: "Protective mode: reference deviation between 5% and 10%.",
    };
  }
  if (dev >= 200) {
    return {
      mode: "caution",
      slippageCapBps: 200,
      maxPriceImpactBps: 150,
      reduceAmountToFit: false,
      retryable: false,
      reason: "Caution mode: reference deviation between 2% and 5%.",
    };
  }
  return NORMAL;
}

/** True when preparation is blocked by the protection state itself. */
export function isBlockingMode(mode: ProtectionMode): boolean {
  return mode === "paused_risk" || mode === "reference_unavailable";
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

/** One executed hop of the prepared route. */
export interface RouteHop {
  /** Router registry id actually used for this hop. */
  routerId: number | null;
  /** Router contract address for this hop. */
  router: string | null;
  /** Token addresses traversed by this hop. */
  path: readonly string[];
  /** V3 fee tier when this hop is a V3 pool. */
  v3Fee?: number | null;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Canonical validation of a multi-hop route: every hop must use a known router
 * from the active registry and only real token addresses. Multi-hop by itself
 * is never a reason to block.
 */
export function isRouteCanonical(
  hops: readonly RouteHop[],
  allowedRouterIds: readonly number[],
  canonicalTokens: readonly string[],
): boolean {
  if (hops.length === 0) return false;
  const allowed = new Set(allowedRouterIds);
  const known = new Set(canonicalTokens.map((t) => t.toLowerCase()));
  return hops.every((hop) => {
    if (hop.routerId === null || !allowed.has(hop.routerId)) return false;
    if (!hop.router || hop.router.toLowerCase() === ZERO_ADDRESS) return false;
    if (hop.path.length < 2) return false;
    return hop.path.every((t) => {
      const a = t.toLowerCase();
      return a !== ZERO_ADDRESS && known.has(a);
    });
  });
}

/** Route summary used inside the preparation fingerprint. */
export function routeSignature(hops: readonly RouteHop[]): string {
  return hops
    .map((h) => `${h.routerId ?? "x"}@${(h.router ?? "x").toLowerCase()}:${h.v3Fee ?? "v2"}:${h.path.map((p) => p.toLowerCase()).join(">")}`)
    .join("|");
}

export interface PreparationInput {
  chainOk: boolean;
  /** Reference pool resolved from the factory with active in-range liquidity. */
  poolActive: boolean;
  /** Every hop/router/token canonical and simulation-valid. */
  routeCanonical: boolean;
  /** Live quote output; 0n or null means the quote failed. */
  amountOut: bigint | null;
  /** Quoted pool price impact of the whole route, in bps. */
  quotedImpactBps: number | null;
  /**
   * |route-effective execution price vs protection reference| in bps.
   * Null when the reference is not usable (warm-up) — then only the quoted
   * impact is enforced.
   */
  effectiveDeviationBps: number | null;
  amountIn: bigint;
  policy: ProtectionPolicy;
}

export interface PreparationDecision {
  allowed: boolean;
  reason: string;
  /** True when this block clears itself after the next valid read. */
  retryable: boolean;
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
    retryable: false,
    slippageBps,
    ...extra,
  });

  if (isBlockingMode(input.policy.mode)) {
    return block(input.policy.reason, { retryable: input.policy.retryable });
  }
  if (!input.chainOk) return block("Wrong network — switch to BOT Mainnet to continue.");
  if (!input.poolActive) return block("No active liquidity in the FLOW/USDT range right now.");
  if (!input.routeCanonical) {
    return block("This route is not supported — only canonical BOT Chain routers and tokens can be prepared.");
  }
  if (input.amountIn <= 0n) return block("Enter an amount to continue.");
  if (input.amountOut === null || input.amountOut <= 0n) {
    return block("Live quote failed — preparation is blocked.", { retryable: true });
  }
  const impact = input.quotedImpactBps;
  if (impact === null || !Number.isFinite(impact) || impact < 0) {
    return block("Price impact could not be measured — preparation is blocked.", { retryable: true });
  }
  if (impact > input.policy.maxPriceImpactBps) {
    return block(
      `Price impact ${(impact / 100).toFixed(2)}% exceeds the ${(input.policy.maxPriceImpactBps / 100).toFixed(2)}% limit for ${input.policy.mode} mode.`,
      { maxSafeAmountIn: maxSafeAmountIn(input.amountIn, impact, input.policy.maxPriceImpactBps) },
    );
  }
  const effective = input.effectiveDeviationBps;
  if (effective !== null) {
    if (!Number.isFinite(effective) || effective < 0) {
      return block("Effective execution price could not be measured — preparation is blocked.", { retryable: true });
    }
    if (effective > input.policy.maxPriceImpactBps) {
      return block(
        `Effective execution price is ${(effective / 100).toFixed(2)}% away from the protection reference, above the ${(input.policy.maxPriceImpactBps / 100).toFixed(2)}% limit for ${input.policy.mode} mode.`,
        { maxSafeAmountIn: maxSafeAmountIn(input.amountIn, effective, input.policy.maxPriceImpactBps) },
      );
    }
  }
  return { allowed: true, reason: input.policy.reason, retryable: false, slippageBps };
}

/** Everything that invalidates a prepared transaction when it changes. */
export interface PreparationFingerprintInput {
  chainId: number;
  pool: string;
  /** Canonical signature of every executed hop. */
  route: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  mode: ProtectionMode;
}

export function preparationFingerprint(i: PreparationFingerprintInput): string {
  return [
    i.chainId,
    i.pool.toLowerCase(),
    i.route,
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
 * Breaker recovery timer. Only VALID price evidence can latch a risk pause, and
 * after a trigger deviation must stay within 5% for 30 continuous minutes
 * before FlowBridge leaves the paused state. Transport/reference failures never
 * latch and never extend an existing pause.
 */
export class BreakerRecovery {
  private trippedAt: number | null = null;
  private calmSince: number | null = null;

  /** Feed a reference observation. Returns true while a risk pause is latched. */
  observe(atSeconds: number, deviationBps: number | null, referenceState: ReferenceState): boolean {
    // Failed / warming reads carry no risk evidence: keep the current state.
    if (referenceState !== "ready") return this.trippedAt !== null;
    const dev = deviationBps;
    if (dev === null || !Number.isFinite(dev) || dev < 0) return this.trippedAt !== null;

    if (dev >= BREAKER_DEVIATION_BPS) {
      this.trippedAt = atSeconds;
      this.calmSince = null;
      return true;
    }
    if (this.trippedAt === null) return false;

    if (dev <= RECOVERY_DEVIATION_BPS) {
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
