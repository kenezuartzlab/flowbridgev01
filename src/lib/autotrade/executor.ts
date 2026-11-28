// AutoTrade V1.1 live executor core — PURE planning/verification only. It builds
// exact Router V4 calls from a closed allowlist (no arbitrary calldata/targets),
// derives minOut from the TOTAL pulled (swap + protocol fee, fee counted once),
// checks deployment identity, two-RPC consensus, gas caps, nonce reservations and
// outbox/receipt transitions. Signing/broadcast are not here and stay disabled.
import { encodeFunctionData, toFunctionSelector, type Hex } from "viem";
import { FLOW_BRIDGE_ROUTER_V4_GENERATED_ABI as V4 } from "@/lib/flowbridge/routerV4Abi.generated";
import { AUTOTRADE_LIVE_ENABLED, ROUTER_V4, type AutoTradePair } from "./config";
import { legPath } from "./path";

/** Runtime keccak of deployed Router V4 at 0x7965…fc61 (BOT 677, read 2026-11-26/28). */
export const ROUTER_V4_RUNTIME_KECCAK = "0x13f0ab2696d66683cadc3a82a220c232799b690db36c45ed7dd9f325a7619ad0" as const;
export const BOT_CHAIN_ID = 677;
export const LEG_FUNCTIONS = ["swapV3MultiSafe", "swapNativeToTokenV3MultiSafe", "swapTokenToNativeV3MultiSafe"] as const;
export type LegFunction = (typeof LEG_FUNCTIONS)[number];
export const LEG_SELECTORS: Record<LegFunction, Hex> = Object.fromEntries(LEG_FUNCTIONS.map((n) => {
  const f = (V4 as readonly any[]).find((x) => x.type === "function" && x.name === n);
  if (!f) throw new Error(`ABI_MISSING_${n}`);
  return [n, toFunctionSelector(f)];
})) as any;

/** Router V4: fee = floor(swap*bps/1e4); pulled = swap + fee <= budget. minOut uses `pulled`. */
export function planAmounts(budget: bigint, bps: number) {
  if (budget <= 0n || bps < 0 || bps > 1000) throw new Error("PLAN_INPUT");
  let swap = (budget * 10_000n) / (10_000n + BigInt(bps));
  // largest swap with swap + fee(swap) <= budget
  while (swap + 1n + ((swap + 1n) * BigInt(bps)) / 10_000n <= budget) swap += 1n;
  const fee = (swap * BigInt(bps)) / 10_000n;
  return { swapAmount: swap, fee, pulled: swap + fee, dust: budget - swap - fee };
}

export interface DeploymentFacts { chainId: number; codeKeccak: string; paused: boolean; owner: string; routerCount: number;
  entry: { router: string; rtype: number; wrappedNative: string; active: boolean }; routerFeeBps: number; selectorsInCode: Record<string, boolean> }
export function verifyDeployment(f: DeploymentFacts, expect: { routerId: number; v3Router: string; wbot: string; feeBps: number }): string[] {
  const e: string[] = [];
  if (f.chainId !== BOT_CHAIN_ID) e.push("CHAIN_ID");
  if (f.codeKeccak.toLowerCase() !== ROUTER_V4_RUNTIME_KECCAK) e.push("CODE_HASH");
  if (f.paused) e.push("PAUSED");
  if (expect.routerId >= f.routerCount) e.push("ROUTER_ID");
  if (f.entry.rtype !== 1 || !f.entry.active) e.push("VENUE_NOT_ACTIVE_V3");
  if (f.entry.router.toLowerCase() !== expect.v3Router.toLowerCase()) e.push("VENUE_ROUTER");
  if (f.entry.wrappedNative.toLowerCase() !== expect.wbot.toLowerCase()) e.push("WRAPPED_NATIVE");
  if (f.routerFeeBps !== expect.feeBps) e.push("FEE_CHANGED");
  for (const n of LEG_FUNCTIONS) if (!f.selectorsInCode[LEG_SELECTORS[n]]) e.push(`SELECTOR_${n}`);
  return e;
}

/** Two distinct RPC hosts must agree on chain and on the block hash at a common height. */
export interface RpcObservation { host: string; chainId: number; head: number; hashAtCommon: string | null; observedAt: number }
export function rpcConsensus(a: RpcObservation, b: RpcObservation, now: number, maxLag = 3, maxAgeMs = 10_000): string | null {
  if (!a || !b) return "SECOND_RPC_MISSING";
  if (new URL(a.host).host === new URL(b.host).host) return "RPC_NOT_INDEPENDENT";
  if (a.chainId !== BOT_CHAIN_ID || b.chainId !== BOT_CHAIN_ID) return "CHAIN_MISMATCH";
  if (now - a.observedAt > maxAgeMs || now - b.observedAt > maxAgeMs) return "RPC_STALE";
  if (Math.abs(a.head - b.head) > maxLag) return "RPC_HEAD_DIVERGENCE";
  if (!a.hashAtCommon || a.hashAtCommon !== b.hashAtCommon) return "RPC_HASH_DIVERGENCE";
  return null;
}

export interface LegCall { to: Hex; data: Hex; value: bigint; fn: LegFunction;
  approval: { token: Hex; spender: Hex; amount: bigint } | null; revokeAfter: boolean }
/** Exact Router V4 call for a leg. Approval is exactly `pulled`; native-in uses value = pulled. */
export function buildLegCall(p: AutoTradePair, side: "buy" | "sell", plan: { swapAmount: bigint; fee: bigint }, minOut: bigint, to: Hex, deadline: bigint): LegCall {
  if (minOut <= 0n) throw new Error("MIN_OUT_ZERO");
  const path = legPath(p, side);
  const tokenIn = (side === "sell" ? p.base : p.quote);
  const tokenOut = (side === "sell" ? p.quote : p.base);
  const pulled = plan.swapAmount + plan.fee;
  const R = ROUTER_V4.toLowerCase() as Hex;
  if (tokenIn.native) {
    return { fn: "swapNativeToTokenV3MultiSafe", to: R, value: pulled, approval: null, revokeAfter: false,
      data: encodeFunctionData({ abi: V4, functionName: "swapNativeToTokenV3MultiSafe", args: [BigInt(p.routerId), tokenOut.address as Hex, path, plan.swapAmount, minOut, to, deadline, plan.fee] as any }) };
  }
  const approval = { token: tokenIn.address.toLowerCase() as Hex, spender: R, amount: pulled };
  if (tokenOut.native) {
    return { fn: "swapTokenToNativeV3MultiSafe", to: R, value: 0n, approval, revokeAfter: true,
      data: encodeFunctionData({ abi: V4, functionName: "swapTokenToNativeV3MultiSafe", args: [BigInt(p.routerId), tokenIn.address as Hex, path, plan.swapAmount, minOut, to, deadline, plan.fee] as any }) };
  }
  return { fn: "swapV3MultiSafe", to: R, value: 0n, approval, revokeAfter: true,
    data: encodeFunctionData({ abi: V4, functionName: "swapV3MultiSafe", args: [BigInt(p.routerId), tokenIn.address as Hex, tokenOut.address as Hex, path, plan.swapAmount, minOut, to, deadline, plan.fee] as any }) };
}
/** Rejects anything that is not exactly one of our three Router V4 selectors to Router V4. */
export function assertAllowlisted(call: { to: string; data: string }) {
  if (call.to.toLowerCase() !== ROUTER_V4.toLowerCase()) throw new Error("TARGET_NOT_ALLOWED");
  if (!Object.values(LEG_SELECTORS).includes(call.data.slice(0, 10).toLowerCase() as Hex)) throw new Error("SELECTOR_NOT_ALLOWED");
}

/** Gas cap is separate from price bounds: total worst-case fee must fit maxGasWeiPerLeg. */
export function checkGas(gasLimit: bigint, maxFeePerGas: bigint, capWei: bigint): string | null {
  if (gasLimit <= 0n || maxFeePerGas <= 0n) return "GAS_INPUT";
  return gasLimit * maxFeePerGas > capWei ? "GAS_CAP" : null;
}

/** Nonce reservation: next = max(chain pending, highest reserved + 1); never reuse an open reservation. */
export function reserveNonce(chainPending: number, reserved: number[]): number {
  return Math.max(chainPending, reserved.length ? Math.max(...reserved) + 1 : 0);
}

export type OutboxState = "RESERVED" | "SIGNED" | "BROADCAST" | "MINED" | "FINAL" | "REVERTED" | "REPLACED" | "DROPPED";
export interface OutboxEntry { idempotencyKey: string; nonce: number; state: OutboxState; txHash: string | null; minedBlock: number | null; minedHash: string | null }
export type OutboxEvent =
  | { type: "signed"; txHash: string } | { type: "broadcast" }
  | { type: "mined"; block: number; blockHash: string; status: "success" | "reverted" }
  | { type: "head"; head: number; hashAtMined: string | null; minConf: number }
  | { type: "nonceUsedByOther" } | { type: "missing"; afterMs: number };
const TERMINAL: OutboxState[] = ["FINAL", "REVERTED", "REPLACED", "DROPPED"];
export function outboxApply(e: OutboxEntry, ev: OutboxEvent): OutboxEntry {
  if (TERMINAL.includes(e.state)) return e; // idempotent; terminal never re-opens
  const n = { ...e };
  switch (ev.type) {
    case "signed": if (n.state !== "RESERVED") throw new Error("ILLEGAL_SIGN"); n.state = "SIGNED"; n.txHash = ev.txHash; return n;
    case "broadcast": if (n.state !== "SIGNED" && n.state !== "BROADCAST") throw new Error("ILLEGAL_BROADCAST"); n.state = "BROADCAST"; return n; // rebroadcast of SAME signed bytes only
    case "mined": if (n.state !== "BROADCAST" && n.state !== "MINED") throw new Error("ILLEGAL_MINED");
      if (ev.status === "reverted") { n.state = "REVERTED"; return n; }
      n.state = "MINED"; n.minedBlock = ev.block; n.minedHash = ev.blockHash; return n;
    case "head": if (n.state !== "MINED") return n;
      if (ev.hashAtMined !== n.minedHash) { n.state = "BROADCAST"; n.minedBlock = null; n.minedHash = null; return n; } // reorg: await re-inclusion, never re-sign
      if (ev.head - n.minedBlock! + 1 >= ev.minConf) n.state = "FINAL"; return n;
    case "nonceUsedByOther": n.state = "REPLACED"; return n; // nonce consumed by a different tx: leg did NOT fill
    case "missing": return n; // V1.2: never terminal on a timer — a late inclusion would be an unrecorded fill. Only nonceUsedByOther/mined resolve it.
  }
}

const TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const topicAddr = (t: string) => ("0x" + t.slice(26)).toLowerCase();
/** Actual received token amount from receipt logs (only Transfer(token -> trader)). */
export function receivedFromLogs(logs: { address: string; topics: string[]; data: string }[], token: string, trader: string): bigint {
  let s = 0n;
  for (const l of logs) if (l.address.toLowerCase() === token.toLowerCase() && l.topics[0] === TRANSFER && topicAddr(l.topics[2]!) === trader.toLowerCase()) s += BigInt(l.data);
  return s;
}
/** Native received = balance delta + gas paid (gas is charged to the trader in the same tx). */
export function nativeReceived(before: bigint, after: bigint, gasUsed: bigint, effGasPrice: bigint): bigint { return after - before + gasUsed * effGasPrice; }

/** The one gate in front of any signer. Throws while live is disabled. */
export function assertExecutionAllowed(ctx: { liveFlag?: boolean; emergencyPaused: boolean; signerConfigured: boolean; consensus: string | null; deploymentErrors: string[] }) {
  if (!(ctx.liveFlag ?? AUTOTRADE_LIVE_ENABLED)) throw new Error("LIVE_DISABLED");
  if (ctx.emergencyPaused) throw new Error("EMERGENCY_PAUSED");
  if (!ctx.signerConfigured) throw new Error("SIGNER_NOT_CONFIGURED");
  if (ctx.consensus) throw new Error(ctx.consensus);
  if (ctx.deploymentErrors.length) throw new Error("DEPLOYMENT:" + ctx.deploymentErrors.join(","));
}
