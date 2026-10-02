/**
 * Smart AI — swap route explanations built only from the verified quote and
 * the execution capability matrix. No invented routes or liquidity.
 */
import type { SwapStep } from "./quoter";
import { dexLabel, routeDexes } from "./quoter";
import { planExecution } from "./executionCapability";

export interface RouteExplanation {
  execution: "ATOMIC_V4" | "STAGED";
  label: string;
  transactions: number;
  lines: string[];
}

export function explainRoute(steps: SwapStep[], chainId: number, pref: string = "auto"): RouteExplanation {
  const plan = planExecution(steps, chainId);
  const dexes = routeDexes(steps);
  const atomic = plan.execution === "ATOMIC_V4";
  const tx = atomic ? 1 : Math.max(1, steps.length);
  const lines: string[] = [];
  if (pref === "auto") lines.push(`Auto chose ${dexes.join(" + ")} because it gave the best executable output in the live quote.`);
  else lines.push(`You picked ${dexes.join(" + ")}. FlowBridge only routes through that venue.`);
  if (steps.length > 1) lines.push(`There's no direct pool with enough liquidity, so the route goes through ${steps.slice(0, -1).map((s) => s.symbolPath[s.symbolPath.length - 1]).join(", ")}.`);
  if (atomic) lines.push("Router V4 runs every BDEX V3 pool step in ONE transaction. If the final amount is below your minimum, the whole swap reverts.");
  else if (steps.length > 1) {
    if (dexes.length > 1) lines.push(`This route uses ${dexes.length} DEXs. No approved FlowBridge router can combine them atomically, so it runs as ${tx} separate transactions, each re-quoted before you sign.`);
    else lines.push(`This route class isn't enabled for one-transaction execution, so it runs as ${tx} separate transactions.`);
  }
  const fees = steps.map((s) => `${dexLabel(s.dex)} pool fee ${s.v3Fee != null ? (s.v3Fee / 10_000).toFixed(2) : "0.30"}%`);
  lines.push(`Pool fees go to liquidity providers (${fees.join(", ")}). The FlowBridge fee is a separate service fee charged by the FlowBridge router.`);
  return { execution: atomic ? "ATOMIC_V4" : "STAGED", label: plan.label, transactions: tx, lines };
}
