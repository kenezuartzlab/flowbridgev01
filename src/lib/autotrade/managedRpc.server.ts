/** Independent-node transport IO. Reads are safe; broadcast always checks the source kill switch first. */
import { decodeEventLog, decodeFunctionData, type Hex } from "viem";
import { FLOW_BRIDGE_ROUTER_V4_GENERATED_ABI as V4 } from "@/lib/flowbridge/routerV4Abi.generated";
import { AUTOTRADE_LIVE_ENABLED, ROUTER_V4, TOKENS } from "./config";
import { validateIndependentRpc, type InfrastructureConfig } from "./canaryPreparation";
import type { ManagedEffectRequest } from "./liveTransport";

type RpcBlock = { hash: Hex; timestamp: Hex };
type RpcReceipt = { transactionHash: Hex; blockHash: Hex; blockNumber: Hex; status: Hex; from: Hex; to: Hex; logs: { address: Hex; topics: Hex[]; data: Hex }[] };
async function rpc<T>(url: string, method: string, params: unknown[], send: typeof fetch): Promise<T> {
  const r = await send(url, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(5_000), headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  if (!r.ok || r.status >= 300) throw new Error("RPC_TRANSPORT_FAILED");
  const b = await r.json() as { result?: T; error?: unknown };
  if (b.error || b.result === undefined) throw new Error("RPC_RESPONSE_FAILED");
  return b.result;
}

/** Receipt-native output from the deployed Router's exact SwapActivity, never a balance delta. */
export function canaryReceiptOutput(r: RpcReceipt, request: ManagedEffectRequest): bigint {
  if (r.transactionHash.length !== 66 || r.from.toLowerCase() !== request.account.toLowerCase() || r.to.toLowerCase() !== request.call.to.toLowerCase()) throw new Error("RECEIPT_IDENTITY");
  if (request.side === "approve" || request.side === "revoke") return 0n;
  const d = decodeFunctionData({ abi: V4, data: request.call.data });
  if (d.functionName !== "swapNativeToTokenV3MultiSafe" && d.functionName !== "swapTokenToNativeV3MultiSafe") throw new Error("CANARY_PAIR_ONLY");
  const args = d.args;
  const [routerId, token, , amountIn, minOut, recipient, , fee] = args;
  if (token.toLowerCase() !== TOKENS.CA.address.toLowerCase() || recipient.toLowerCase() !== request.account.toLowerCase() || routerId !== 0n) throw new Error("CANARY_CALL_IDENTITY");
  const zero = "0x0000000000000000000000000000000000000000";
  const nativeBuy = d.functionName === "swapNativeToTokenV3MultiSafe";
  const events: bigint[] = [];
  for (const log of r.logs) {
    if (log.address.toLowerCase() !== ROUTER_V4.toLowerCase()) continue;
    let decoded;
    try { decoded = decodeEventLog({ abi: V4, data: log.data, topics: log.topics as [Hex, ...Hex[]], strict: true }); } catch { continue; }
    if (decoded.eventName !== "SwapActivity") continue;
    const a = decoded.args;
    if (a.sender.toLowerCase() !== request.account.toLowerCase() || a.recipient.toLowerCase() !== recipient.toLowerCase() || a.routerId !== routerId
      || a.tokenIn.toLowerCase() !== (nativeBuy ? zero : token.toLowerCase()) || a.tokenOut.toLowerCase() !== (nativeBuy ? token.toLowerCase() : zero)
      || a.amountIn !== amountIn || a.protocolFee !== fee || a.amountOut < minOut) throw new Error("RECEIPT_EVENT_MISMATCH");
    events.push(a.amountOut);
  }
  if (events.length !== 1 || events[0] === undefined) throw new Error("RECEIPT_EVENT_MISSING_OR_DUPLICATE");
  return events[0];
}

export function createManagedRpcConnector(config: InfrastructureConfig, send: typeof fetch = fetch) {
  const assertConfig = () => { const errors = validateIndependentRpc(config); if (errors.length) throw new Error(errors.join(",")); };
  const at = <T>(url: string, method: string, params: unknown[] = []) => rpc<T>(url, method, params, send);
  const consensus = async () => {
    assertConfig();
    const [ca, cb, ha, hb] = await Promise.all([
      at<Hex>(config.primaryUrl, "eth_chainId"), at<Hex>(config.secondaryUrl, "eth_chainId"),
      at<Hex>(config.primaryUrl, "eth_blockNumber"), at<Hex>(config.secondaryUrl, "eth_blockNumber"),
    ]);
    if (BigInt(ca) !== 677n || BigInt(cb) !== 677n) throw new Error("RPC_CHAIN_MISMATCH");
    const a = BigInt(ha), b = BigInt(hb), common = a < b ? a : b;
    if ((a > b ? a - b : b - a) > 3n) throw new Error("RPC_HEAD_DIVERGENCE");
    const height = `0x${common.toString(16)}`;
    const [ba, bb] = await Promise.all([at<RpcBlock>(config.primaryUrl, "eth_getBlockByNumber", [height, false]), at<RpcBlock>(config.secondaryUrl, "eth_getBlockByNumber", [height, false])]);
    if (!ba?.hash || ba.hash !== bb?.hash) throw new Error("RPC_HASH_DIVERGENCE");
    const age = Date.now() - Number(BigInt(ba.timestamp)) * 1000;
    if (age < 0 || age > 15_000) throw new Error("RPC_BLOCK_STALE");
    return common;
  };
  return {
    consensus,
    broadcast: async (raw: Hex) => {
      if (!AUTOTRADE_LIVE_ENABLED) throw new Error("LIVE_DISABLED");
      await consensus();
      return at<Hex>(config.primaryUrl, "eth_sendRawTransaction", [raw]);
    },
    receipt: async (hash: Hex, request: ManagedEffectRequest) => {
      const common = await consensus();
      const [a, b] = await Promise.all([at<RpcReceipt | null>(config.primaryUrl, "eth_getTransactionReceipt", [hash]), at<RpcReceipt | null>(config.secondaryUrl, "eth_getTransactionReceipt", [hash])]);
      if (!a || !b) return null;
      if (a.transactionHash.toLowerCase() !== hash.toLowerCase() || JSON.stringify(a) !== JSON.stringify(b)) throw new Error("RPC_RECEIPT_DIVERGENCE");
      if (a.from.toLowerCase() !== request.account.toLowerCase() || a.to.toLowerCase() !== request.call.to.toLowerCase()) throw new Error("RECEIPT_IDENTITY");
      const [ba, bb] = await Promise.all([at<RpcBlock>(config.primaryUrl, "eth_getBlockByNumber", [a.blockNumber, false]), at<RpcBlock>(config.secondaryUrl, "eth_getBlockByNumber", [a.blockNumber, false])]);
      if (ba?.hash !== a.blockHash || bb?.hash !== a.blockHash) throw new Error("REORG_REVIEW");
      if (a.status !== "0x1" && a.status !== "0x0") throw new Error("RECEIPT_STATUS_INVALID");
      return { final: common >= BigInt(a.blockNumber) + 5n, status: a.status === "0x1" ? "success" as const : "reverted" as const, actualOut: a.status === "0x1" ? canaryReceiptOutput(a, request) : 0n };
    },
  };
}