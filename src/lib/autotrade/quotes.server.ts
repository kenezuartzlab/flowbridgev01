// Read-only BDEX V3 quotes for AutoTrade legs. Cross-check = same input quoted at
// the previous block (detects single-block manipulation) or, when configured, a
// second RPC (AUTOTRADE_SECONDARY_RPC). No signer, no writes.
import { createPublicClient, http, parseAbi, type Hex } from "viem";
import { MAINNET_CONTRACTS as M } from "@/lib/contracts";
import type { AutoTradePair } from "./config";
import type { Quote } from "./engine";

const QUOTER = M.bdexV3Quoter.toLowerCase() as Hex;
const abi = parseAbi(["function quoteExactInput(bytes path,uint256 amountIn) returns (uint256,uint160[],uint32[],uint256)"]);
export function encodePath(tokens: string[], fees: number[]): Hex {
  return ("0x" + tokens.map((t, i) => t.slice(2).toLowerCase() + (i < fees.length ? fees[i]!.toString(16).padStart(6, "0") : "")).join("")) as Hex;
}
export function legPath(p: AutoTradePair, side: "buy" | "sell") {
  return side === "sell" ? encodePath(p.path, p.fees) : encodePath([...p.path].reverse(), [...p.fees].reverse());
}

export async function quoteLeg(p: AutoTradePair, side: "buy" | "sell", amountIn: bigint): Promise<Quote> {
  const primary = createPublicClient({ transport: http("https://rpc.botchain.ai", { timeout: 8_000 }) });
  const sec = process.env["AUTOTRADE_SECONDARY_RPC"];
  const path = legPath(p, side);
  const head = await primary.getBlockNumber();
  const at = (c: typeof primary, blockNumber: bigint, amt: bigint) =>
    c.simulateContract({ address: QUOTER, abi, functionName: "quoteExactInput", args: [path, amt], blockNumber }).then((r) => r.result);
  const probeIn = amountIn / 1000n > 0n ? amountIn / 1000n : 1n;
  const [main, probe, gasPrice] = await Promise.all([at(primary, head, amountIn), at(primary, head, probeIn), primary.getGasPrice()]);
  const crossClient = sec ? createPublicClient({ transport: http(sec, { timeout: 8_000 }) }) : primary;
  const cross = await at(crossClient, sec ? head : head - 1n, amountIn).then((r) => r[0]).catch(() => null);
  const ideal = (probe[0] * amountIn) / probeIn;
  const impact = ideal > 0n && main[0] < ideal ? Number(((ideal - main[0]) * 10_000n) / ideal) : 0;
  return { amountIn, amountOut: main[0], block: Number(head), headBlock: Number(head), fetchedAt: Date.now(), crossCheckOut: cross, priceImpactBps: impact, gasUnits: main[3] + 180_000n, gasPriceWei: gasPrice };
}
