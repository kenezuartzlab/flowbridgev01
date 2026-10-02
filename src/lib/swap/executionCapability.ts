/**
 * Smart Trade execution capability matrix.
 *
 * Decides, per route, whether FlowBridge can execute it in ONE Router V4
 * transaction ("ATOMIC — V4") or must run it step by step ("STAGED").
 * Atomic classes only apply on a chain whose extended Router V4 candidate is
 * promoted (feature flag below). Everything else is staged, and the UI must
 * disclose the transaction count before execution.
 */
import type { SwapStep } from "./quoter";

export type ExecutionClass = "ATOMIC_V4" | "STAGED";

export type RouteClass =
  | "single-step"
  | "bdex-v3-native-multi"   // BOT <-> BDEX V3 multi-pool (new V4 functions)
  | "bdex-v3-token-multi"    // ERC20 -> BDEX V3 multi-pool -> ERC20 (swapV3MultiSafe)
  | "v2-cross-router"        // V2-only hops across routers (swapMultiHopSafe)
  | "mixed-v2-v3"            // BDEX V2 + BDEX V3 — always staged in this revision
  | "caswap-v3"              // CaSwap + BDEX V3 — always staged in this revision
  | "other";

/** Extended Router V4 (native V3 multi-pool) deployments. */
export const NATIVE_V3_MULTI_CANDIDATE = {
  677: {
    // Promoted 2026-10-02; BDEX V3 = routerId 0, fee 1 bp, both Mainnet canaries PASS.
    router: "0x79653140D84B78C19354ee984f236Ec92160fc61",
    lens: "0xb82038aC3d2df60f5B5fE06D6FDe3CFDd1B76BD0",
    routerId: 0,
    runtimeSha256: "a42e53b15977c57b81fa63c575b9cb39100b873c50a523b68f02df7bd8bec41d",
    runtimeBytes: 21838,
  },
  968: {
    router: "0xd985B142F7d614577f08e2736C67d6b5Bcd41C1E",
    routerId: 0,
    runtimeSha256: "a42e53b15977c57b81fa63c575b9cb39100b873c50a523b68f02df7bd8bec41d",
    runtimeBytes: 21838,
  },
} as const;

/**
 * Feature flags: app execution through the extended V4. Only the proven
 * native BOT <-> BDEX V3 multi-pool class is enabled, on BOT Mainnet only.
 * Everything else stays on Router V3 / staged.
 */
export const V4_ATOMIC_FLAGS: Record<number, { nativeV3Multi: boolean; tokenV3Multi: boolean; v2CrossRouter: boolean }> = {
  677: { nativeV3Multi: true, tokenV3Multi: false, v2CrossRouter: false },
  968: { nativeV3Multi: false, tokenV3Multi: false, v2CrossRouter: false },
};

const isV3 = (s: SwapStep) => s.dex === "bdex-v3";
const isCa = (s: SwapStep) => s.dex === "caswap";
const isV2 = (s: SwapStep) => !isV3(s);

export function classifyRoute(steps: SwapStep[]): RouteClass {
  if (steps.length <= 1) return "single-step";
  const anyV3 = steps.some(isV3);
  const allV3 = steps.every(isV3);
  if (anyV3 && steps.some(isCa)) return "caswap-v3";
  if (anyV3 && !allV3) return "mixed-v2-v3";
  if (allV3) {
    const native = steps[0].inIsNative || steps[steps.length - 1].outIsNative;
    return native ? "bdex-v3-native-multi" : "bdex-v3-token-multi";
  }
  if (steps.every(isV2) && !steps[0].inIsNative && !steps[steps.length - 1].outIsNative) return "v2-cross-router";
  return "other";
}

export interface ExecutionPlan {
  routeClass: RouteClass;
  execution: ExecutionClass;
  /** Router V4 function when atomic. */
  v4Function?: "swapNativeToTokenV3MultiSafe" | "swapTokenToNativeV3MultiSafe" | "swapV3MultiSafe" | "swapMultiHopSafe";
  label: string;
}

export function planExecution(steps: SwapStep[], chainId: number): ExecutionPlan {
  const routeClass = classifyRoute(steps);
  const f = V4_ATOMIC_FLAGS[chainId] ?? { nativeV3Multi: false, tokenV3Multi: false, v2CrossRouter: false };
  const staged = (label = "STAGED"): ExecutionPlan => ({ routeClass, execution: "STAGED", label });
  switch (routeClass) {
    case "bdex-v3-native-multi":
      if (!f.nativeV3Multi) return staged();
      return {
        routeClass,
        execution: "ATOMIC_V4",
        v4Function: steps[0].inIsNative ? "swapNativeToTokenV3MultiSafe" : "swapTokenToNativeV3MultiSafe",
        label: "ATOMIC — V4",
      };
    case "bdex-v3-token-multi":
      return f.tokenV3Multi
        ? { routeClass, execution: "ATOMIC_V4", v4Function: "swapV3MultiSafe", label: "ATOMIC — V4" }
        : staged();
    case "v2-cross-router":
      return f.v2CrossRouter
        ? { routeClass, execution: "ATOMIC_V4", v4Function: "swapMultiHopSafe", label: "ATOMIC — V4" }
        : staged();
    case "mixed-v2-v3":
    case "caswap-v3":
    case "other":
      return staged();
    case "single-step":
      return { routeClass, execution: "STAGED", label: "SINGLE" };
  }
}
