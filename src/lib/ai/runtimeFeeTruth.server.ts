/**
 * V15.3E §3 — RuntimeFeeTruth skill: live, read-only fee configuration.
 *
 * Reads `getFeeConfig()` and `feeConfigNonce()` from the registry-resolved
 * FlowBridge router with `eth_call`. Nothing is cached, nothing is inferred and
 * there is no prose fallback: when the read fails the caller must say so.
 */
import { decodeFunctionResult, encodeFunctionData } from "viem";
import { FLOW_BRIDGE_ROUTER_V4_ABI } from "@/lib/flowbridge/routerV4Abi";
import { resolveFlowBridgeExecution } from "@/lib/flowbridge/executionRegistry";
import type { EvidenceItem } from "./aiTypes";
import type { FeeTruthResult, RuntimeFeeTruth } from "./economicsGuard";

const RPC_URLS: Record<number, string> = {
  968: "https://rpc.bohr.life",
  677: "https://rpc.botchain.ai",
};
const TIMEOUT_MS = 4_000;

async function ethCall(chainId: number, to: string, data: string): Promise<string | null> {
  const url = RPC_URLS[chainId];
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to, data }, "latest"],
      }),
      signal: controller.signal,
    });
    const json = (await res.json()) as { result?: string; error?: unknown };
    if (json.error || !json.result || json.result === "0x") return null;
    return json.result;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Live fee configuration for a FlowBridge chain, or an explicit failure reason. */
export async function readRuntimeFeeTruth(chainId: number): Promise<FeeTruthResult> {
  const target = resolveFlowBridgeExecution(chainId);
  if (!target.configured) {
    return { ok: false, reason: `FlowBridge execution is not configured on chain ${chainId}` };
  }
  const router = target.router;

  const [feeHex, nonceHex] = await Promise.all([
    ethCall(
      chainId,
      router,
      encodeFunctionData({ abi: FLOW_BRIDGE_ROUTER_V4_ABI, functionName: "getFeeConfig" }),
    ),
    ethCall(
      chainId,
      router,
      encodeFunctionData({ abi: FLOW_BRIDGE_ROUTER_V4_ABI, functionName: "feeConfigNonce" }),
    ),
  ]);

  if (!feeHex) return { ok: false, reason: "router fee configuration could not be read" };

  try {
    const decoded = decodeFunctionResult({
      abi: FLOW_BRIDGE_ROUTER_V4_ABI,
      functionName: "getFeeConfig",
      data: feeHex as `0x${string}`,
    }) as readonly [bigint, bigint, string];
    let nonce: string | null = null;
    if (nonceHex) {
      try {
        nonce = String(
          decodeFunctionResult({
            abi: FLOW_BRIDGE_ROUTER_V4_ABI,
            functionName: "feeConfigNonce",
            data: nonceHex as `0x${string}`,
          }) as bigint,
        );
      } catch {
        nonce = null;
      }
    }
    const truth: RuntimeFeeTruth = {
      chainId,
      contract: router.toLowerCase(),
      globalFeeBps: Number(decoded[0]),
      maxFeeBps: Number(decoded[1]),
      feeTreasury: String(decoded[2]).toLowerCase(),
      feeConfigNonce: nonce,
      observedAt: new Date().toISOString(),
      source: "ON_CHAIN",
    };
    return { ok: true, truth };
  } catch {
    return { ok: false, reason: "router fee configuration response was unreadable" };
  }
}

/** Authoritative live evidence item for the fee configuration. */
export function feeTruthEvidence(truth: RuntimeFeeTruth): EvidenceItem {
  return {
    id: "chain.router.feeConfig",
    label: `FlowBridge router fee configuration (live eth_call, chain ${truth.chainId})`,
    dataClass: "ON_CHAIN",
    authority: "AUTHORITATIVE_STATE",
    freshness: "REALTIME",
    observedAt: truth.observedAt,
    value: {
      globalFeeBps: truth.globalFeeBps,
      maxFeeBps: truth.maxFeeBps,
      feeConfigNonce: truth.feeConfigNonce,
      router: truth.contract,
    },
    excerpt: `Live router fee configuration on chain ${truth.chainId}: swap fee ${truth.globalFeeBps} bps (${truth.globalFeeBps / 100}%), maximum ${truth.maxFeeBps ?? "?"} bps, fee config nonce ${truth.feeConfigNonce ?? "unknown"}. This value is mutable on chain and overrides every document or cached figure.`,
  };
}
