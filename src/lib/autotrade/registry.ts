// Router V4 venue registry: read model + owner-authorized registerRouter PREVIEWS for
// a closed candidate list. Never sends; Ops UI only shows calldata for the owner to review.
import { encodeFunctionData, type Hex } from "viem";
import { MAINNET_CONTRACTS as M } from "@/lib/contracts";
import { ROUTER_V4 } from "./config";

export const REGISTRY_WRITES_ENABLED = false as const;
const ABI = [{ type: "function", name: "registerRouter", stateMutability: "nonpayable", inputs: [{ name: "router", type: "address" }, { name: "rtype", type: "uint8" }, { name: "wrappedNative", type: "address" }, { name: "name", type: "string" }, { name: "version", type: "string" }], outputs: [{ type: "uint256" }] }] as const;

export interface VenueCandidate { key: "caswap-v2" | "bdex-v2"; router: string; rtype: 0; wrappedNative: string; name: string; version: string;
  abiCompatible: boolean; forkProven: boolean; usefulDepth: boolean; recommendation: "DO_NOT_REGISTER" | "OPTIONAL"; evidence: string }
export const VENUE_CANDIDATES: readonly VenueCandidate[] = [
  { key: "caswap-v2", router: M.caSwapRouter, rtype: 0, wrappedNative: M.caWbot, name: "CaSwap V2", version: "2",
    abiCompatible: true, forkProven: true, usefulDepth: false, recommendation: "DO_NOT_REGISTER",
    evidence: "Router exposes WBOT()=caWBOT (fully native-backed Wrapped BOT) and swapExactETHForTokens/TokensForETH; fork-registered as V2 and native BOT->CA via swapNativeToTokenSafe succeeded atomically. Only pool CA/caWBOT holds ~8.4e-11 CA / ~1.7e-5 BOT, so 1 BOT returned 0 CA: no executable depth. No caWBOT/USDT pair, so no CA/USDT path." },
  { key: "bdex-v2", router: M.bdexV2Router, rtype: 0, wrappedNative: M.wbot, name: "BDEX V2", version: "2",
    abiCompatible: true, forkProven: true, usefulDepth: false, recommendation: "OPTIONAL",
    evidence: "Fork registration succeeded; only WBOT/USDT exists and BDEX V3 quotes better. Adds no CA route." },
];
export function registerPreview(key: VenueCandidate["key"], owner: string) {
  const c = VENUE_CANDIDATES.find((v) => v.key === key); if (!c) throw new Error("UNKNOWN_CANDIDATE");
  return { from: owner, to: ROUTER_V4 as Hex, value: "0", data: encodeFunctionData({ abi: ABI, functionName: "registerRouter", args: [c.router as Hex, c.rtype, c.wrappedNative as Hex, c.name, c.version] }),
    note: "PREVIEW ONLY — must be simulated, reviewed and signed by the Router V4 owner wallet; activation delay is 0 so it is live immediately and inherits the 10 bp global fee.",
    writesEnabled: REGISTRY_WRITES_ENABLED, recommendation: c.recommendation };
}
