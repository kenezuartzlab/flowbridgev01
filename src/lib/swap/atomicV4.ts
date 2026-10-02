/**
 * Atomic native BOT <-> BDEX V3 multi-pool execution through the promoted
 * extended Router V4. Pure helpers only; the swap card performs the writes.
 */
import { concatHex, numberToHex, type Address, type Hex } from "viem";
import type { SwapStep } from "./quoter";
import { NATIVE_V3_MULTI_CANDIDATE, planExecution } from "./executionCapability";

/** Uniswap-V3 packed path: token (20) | fee (3) | token (20) | ... */
export function encodeV3Path(steps: SwapStep[]): Hex {
  const parts: Hex[] = [steps[0].path[0] as Hex];
  for (const s of steps) {
    if (s.dex !== "bdex-v3" || s.v3Fee == null) throw new Error("Atomic V4 path requires BDEX V3 legs with a pool fee");
    parts.push(numberToHex(s.v3Fee, { size: 3 }), s.path[s.path.length - 1] as Hex);
  }
  return concatHex(parts);
}

export interface AtomicV4Target {
  router: Address;
  routerId: number;
  fn: "swapNativeToTokenV3MultiSafe" | "swapTokenToNativeV3MultiSafe";
}

/** Returns the V4 target only when the route class is proven and its flag is on. */
export function atomicV4Target(steps: SwapStep[], chainId: number): AtomicV4Target | null {
  const plan = planExecution(steps, chainId);
  if (plan.execution !== "ATOMIC_V4" || plan.routeClass !== "bdex-v3-native-multi") return null;
  const c = (NATIVE_V3_MULTI_CANDIDATE as Record<number, { router: string; routerId?: number }>)[chainId];
  if (!c) return null;
  return {
    router: c.router as Address,
    routerId: c.routerId ?? 0,
    fn: plan.v4Function as AtomicV4Target["fn"],
  };
}
