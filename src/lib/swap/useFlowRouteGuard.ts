/**
 * V30.2B P4A.2 — React binding for the FLOW/USDT route circuit breaker.
 *
 * Read-only: polls the live BDEX V3 pool reference, resolves the protection
 * mode, and produces a fail-closed preparation decision plus a revalidation
 * fingerprint. Only the canonical FLOW/USDT pair is guarded; every other pair
 * is untouched.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { getContracts } from "@/lib/contracts";
import type { Token } from "./tokenRegistry";
import { readFlowUsdtReference, FLOW_USDT_FEE_TIER, type PoolReference } from "./poolReference";
import {
  BreakerRecovery,
  clampSlippageBps,
  evaluatePreparation,
  evaluateProtection,
  preparationFingerprint,
  type PreparationDecision,
  type ProtectionPolicy,
} from "./routeGuard";

const POLL_MS = 60_000;

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
}

export function useFlowRouteGuard(args: {
  isMainnet: boolean;
  tokenIn: Token;
  tokenOut: Token;
  amountIn: bigint;
  amountOut: bigint | null;
  routeFee: number | null;
  routerId: number | null;
  quotedImpactBps: number | null;
  chainOk: boolean;
}): FlowRouteGuard {
  const { isMainnet, tokenIn, tokenOut, amountIn, amountOut, routeFee, routerId, quotedImpactBps, chainOk } = args;

  const guarded = useMemo(() => {
    if (!isMainnet) return false;
    const c = getContracts(true);
    const flow = c.flowToken.toLowerCase();
    const usdt = c.usdtBot.toLowerCase();
    const a = tokenIn.isNative ? "native" : tokenIn.address.toLowerCase();
    const b = tokenOut.isNative ? "native" : tokenOut.address.toLowerCase();
    return (a === flow && b === usdt) || (a === usdt && b === flow);
  }, [isMainnet, tokenIn, tokenOut]);

  const [reference, setReference] = useState<PoolReference | null>(null);
  const recovery = useRef(new BreakerRecovery());

  useEffect(() => {
    if (!guarded) {
      setReference(null);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const ref = await readFlowUsdtReference(isMainnet);
      if (cancelled) return;
      recovery.current.observe(Math.floor(Date.now() / 1000), ref.deviationBps, ref.referenceState);
      setReference(ref);
    };
    void tick();
    const handle = setInterval(() => void tick(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [guarded, isMainnet]);

  return useMemo(() => {
    if (!guarded) {
      return { guarded: false, reference: null, policy: null, decision: null, slippageCapPct: null, fingerprint: null };
    }
    if (!reference) {
      // Reference not read yet — fail closed until it is.
      const policy = evaluateProtection({ deviationBps: null, referenceState: "failed" });
      return {
        guarded: true,
        reference: null,
        policy,
        decision: { allowed: false, reason: "Checking live price protection…", slippageBps: clampSlippageBps(policy.slippageCapBps, policy) },
        slippageCapPct: policy.slippageCapBps / 100,
        fingerprint: null,
      };
    }

    const basePolicy = evaluateProtection({
      deviationBps: reference.deviationBps,
      referenceState: reference.referenceState,
    });
    const policy = recovery.current.paused && basePolicy.mode !== "paused"
      ? {
          ...basePolicy,
          mode: "paused" as const,
          maxPriceImpactBps: 0,
          reduceAmountToFit: false,
          reason: "Recovering from a price-protection pause — waiting for 30 calm minutes.",
        }
      : basePolicy;

    const decision = evaluatePreparation({
      chainOk,
      poolActive: reference.poolActive,
      routeFee,
      expectedRouteFee: FLOW_USDT_FEE_TIER,
      amountOut,
      quotedImpactBps,
      amountIn,
      policy,
    });

    const fingerprint =
      reference.pool && routeFee !== null && routerId !== null
        ? preparationFingerprint({
            chainId: 677,
            pool: reference.pool,
            routerId,
            routeFee,
            tokenIn: tokenIn.address,
            tokenOut: tokenOut.address,
            amountIn,
            mode: policy.mode,
          })
        : null;

    return { guarded: true, reference, policy, decision, slippageCapPct: policy.slippageCapBps / 100, fingerprint };
  }, [guarded, reference, chainOk, routeFee, routerId, amountOut, quotedImpactBps, amountIn, tokenIn, tokenOut]);
}
