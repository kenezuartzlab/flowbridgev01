/**
 * V30.2B P4A.2 / P4A.2.1 — React binding for the FLOW/USDT route circuit breaker.
 *
 * Read-only: polls the live BDEX V3 pool reference, resolves the protection
 * mode, and produces a fail-closed preparation decision plus a revalidation
 * fingerprint. Only the canonical FLOW/USDT pair is guarded; every other pair
 * is untouched.
 *
 * P4A.2.1 behaviour:
 *  - A failed reference read is retryable (`reference_unavailable`), retried with
 *    bounded backoff, and clears itself on the next valid read without a reload.
 *  - Only valid price evidence can latch a risk pause.
 *  - Multi-hop routes are allowed. Canonical hop validation plus the effective
 *    execution price decide, never the identity of the first hop.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { getContracts } from "@/lib/contracts";
import type { Token } from "./tokenRegistry";
import { getActiveRouters } from "./quoter";
import {
  readFlowUsdtReference,
  effectiveTradeDeviationBps,
  type PoolReference,
} from "./poolReference";
import {
  BreakerRecovery,
  clampSlippageBps,
  evaluatePreparation,
  evaluateProtection,
  isRouteCanonical,
  preparationFingerprint,
  routeSignature,
  type PreparationDecision,
  type ProtectionPolicy,
  type RouteHop,
} from "./routeGuard";

const POLL_MS = 60_000;
const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 30_000;

export interface FlowRouteGuard {
  /** True when this pair is the guarded canonical FLOW/USDT route. */
  guarded: boolean;
  reference: PoolReference | null;
  policy: ProtectionPolicy | null;
  decision: PreparationDecision | null;
  /** Slippage ceiling in percent for the active mode (guarded pairs only). */
  slippageCapPct: number | null;
  /** Fingerprint of the prepared transaction; changes invalidate it. */
  fingerprint: string | null;
  /** Effective execution deviation from the reference, in bps. */
  effectiveDeviationBps: number | null;
}

export function useFlowRouteGuard(args: {
  isMainnet: boolean;
  tokenIn: Token;
  tokenOut: Token;
  amountIn: bigint;
  amountOut: bigint | null;
  /** Every executed hop of the quoted route, in order. */
  hops: readonly RouteHop[];
  quotedImpactBps: number | null;
  chainOk: boolean;
}): FlowRouteGuard {
  const { isMainnet, tokenIn, tokenOut, amountIn, amountOut, hops, quotedImpactBps, chainOk } = args;

  const guarded = useMemo(() => {
    if (!isMainnet) return false;
    const c = getContracts(true);
    const flow = c.flowToken.toLowerCase();
    const usdt = c.usdtBot.toLowerCase();
    const a = tokenIn.isNative ? "native" : tokenIn.address.toLowerCase();
    const b = tokenOut.isNative ? "native" : tokenOut.address.toLowerCase();
    return (a === flow && b === usdt) || (a === usdt && b === flow);
  }, [isMainnet, tokenIn, tokenOut]);

  const tokenInIsFlow = useMemo(
    () => !tokenIn.isNative && tokenIn.address.toLowerCase() === getContracts(true).flowToken.toLowerCase(),
    [tokenIn],
  );

  const [reference, setReference] = useState<PoolReference | null>(null);
  const recovery = useRef(new BreakerRecovery());

  // Canonical routers/tokens allowed in a guarded route.
  const [allowedRouterIds, setAllowedRouterIds] = useState<number[]>([]);
  useEffect(() => {
    if (!guarded) return;
    let cancelled = false;
    void getActiveRouters(isMainnet)
      .then((rs) => {
        if (!cancelled) setAllowedRouterIds(rs.map((r) => r.routerId));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [guarded, isMainnet]);

  const canonicalTokens = useMemo(() => {
    const c = getContracts(isMainnet);
    return [c.flowToken, c.usdtBot, c.wbot, c.caWbot, c.caToken].filter(Boolean).map((a) => a.toLowerCase());
  }, [isMainnet]);

  // Reference polling with bounded backoff. A failed read never latches a risk
  // pause and never stops the retry loop; the next valid read heals the state.
  useEffect(() => {
    if (!guarded) {
      setReference(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;

    const schedule = (ms: number) => {
      if (cancelled) return;
      timer = setTimeout(() => void tick(), ms);
    };

    const tick = async () => {
      let ref: PoolReference | null = null;
      try {
        ref = await readFlowUsdtReference(isMainnet);
      } catch {
        ref = null;
      }
      if (cancelled) return;
      if (!ref || ref.referenceState === "failed") {
        failures += 1;
        // Keep the last known reference so a transient hiccup does not erase it,
        // but surface the retryable unavailable state for this preparation.
        setReference(ref ?? null);
        schedule(Math.min(RETRY_BASE_MS * 2 ** (failures - 1), RETRY_MAX_MS));
        return;
      }
      failures = 0;
      recovery.current.observe(Math.floor(Date.now() / 1000), ref.deviationBps, ref.referenceState);
      setReference(ref);
      schedule(POLL_MS);
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [guarded, isMainnet]);

  return useMemo(() => {
    const idle: FlowRouteGuard = {
      guarded: false,
      reference: null,
      policy: null,
      decision: null,
      slippageCapPct: null,
      fingerprint: null,
      effectiveDeviationBps: null,
    };
    if (!guarded) return idle;

    if (!reference || reference.referenceState === "failed") {
      // Retryable: blocks only this preparation and self-heals on the next read.
      const policy = evaluateProtection({ deviationBps: null, referenceState: "failed" });
      return {
        ...idle,
        guarded: true,
        reference,
        policy,
        decision: {
          allowed: false,
          reason: policy.reason,
          retryable: true,
          slippageBps: clampSlippageBps(policy.slippageCapBps, policy),
        },
        slippageCapPct: policy.slippageCapBps / 100,
      };
    }

    const basePolicy = evaluateProtection({
      deviationBps: reference.deviationBps,
      referenceState: reference.referenceState,
    });
    const policy: ProtectionPolicy =
      recovery.current.paused && basePolicy.mode !== "paused_risk"
        ? {
            ...basePolicy,
            mode: "paused_risk",
            maxPriceImpactBps: 0,
            reduceAmountToFit: false,
            retryable: false,
            reason: "Recovering from a price-protection pause — waiting for 30 calm minutes.",
          }
        : basePolicy;

    const routeCanonical = isRouteCanonical(hops, allowedRouterIds, canonicalTokens);

    const effective =
      reference.referenceState === "ready" &&
      reference.fastTwapTick !== null &&
      reference.flowIsToken1 !== null &&
      amountOut !== null
        ? effectiveTradeDeviationBps({
            amountIn,
            amountOut,
            tokenInIsFlow,
            referenceTick: reference.fastTwapTick,
            flowIsToken1: reference.flowIsToken1,
          })
        : null;

    const decision = evaluatePreparation({
      chainOk,
      poolActive: reference.poolActive,
      routeCanonical,
      amountOut,
      quotedImpactBps,
      effectiveDeviationBps: effective,
      amountIn,
      policy,
    });

    const fingerprint =
      reference.pool && hops.length > 0
        ? preparationFingerprint({
            chainId: 677,
            pool: reference.pool,
            route: routeSignature(hops),
            tokenIn: tokenIn.address,
            tokenOut: tokenOut.address,
            amountIn,
            mode: policy.mode,
          })
        : null;

    return {
      guarded: true,
      reference,
      policy,
      decision,
      slippageCapPct: policy.slippageCapBps / 100,
      fingerprint,
      effectiveDeviationBps: effective,
    };
  }, [
    guarded,
    reference,
    chainOk,
    hops,
    allowedRouterIds,
    canonicalTokens,
    amountOut,
    quotedImpactBps,
    amountIn,
    tokenIn,
    tokenOut,
    tokenInIsFlow,
  ]);
}
