// Pure V3 path encoding shared by quotes and executor.
import type { Hex } from "viem";
import type { AutoTradePair } from "./config";
export function encodePath(tokens: string[], fees: number[]): Hex {
  return ("0x" + tokens.map((t, i) => t.slice(2).toLowerCase() + (i < fees.length ? fees[i]!.toString(16).padStart(6, "0") : "")).join("")) as Hex;
}
export function legPath(p: AutoTradePair, side: "buy" | "sell") {
  return side === "sell" ? encodePath(p.path, p.fees) : encodePath([...p.path].reverse(), [...p.fees].reverse());
}
