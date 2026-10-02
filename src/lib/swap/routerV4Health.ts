import type { Address, PublicClient } from "viem";
import { FLOW_BRIDGE_ROUTER_LENS_ABI, FLOW_BRIDGE_ROUTER_V4_ABI } from "@/lib/flowbridge/routerV4Abi";
import { MAINNET_CONTRACTS } from "@/lib/contracts";
import { NATIVE_V3_MULTI_CANDIDATE } from "./executionCapability";

export const ROUTER_V4_MAINNET_EXPECTED = {
  chainId: 677,
  router: NATIVE_V3_MULTI_CANDIDATE[677].router as Address,
  lens: NATIVE_V3_MULTI_CANDIDATE[677].lens as Address,
  owner: "0x524Db06954de917025180057BCBeB36eC96A98c5" as Address,
  treasury: "0xefc13d1a1dc30ba2da0bb005ba5a783c6b229ea4" as Address,
  bdexV3Router: MAINNET_CONTRACTS.bdexV3Router as Address,
  wrappedNative: MAINNET_CONTRACTS.wbot as Address,
  routerId: 0n,
  globalFeeBps: 0n,
  effectiveFeeBps: 1n,
} as const;

export type RouterHealthKey = "router_code" | "lens_code" | "owner" | "lens_binding" | "bdex_v3_registered" | "bdex_v3_active" | "effective_fee" | "global_fee" | "treasury" | "not_paused" | "wrapped_native";
export interface RouterHealthCheck { key: RouterHealthKey; ok: boolean; detail: string }
export interface RouterV4Health { ok: boolean; checkedAt: number; checks: RouterHealthCheck[] }

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export async function readRouterV4Health(client: PublicClient): Promise<RouterV4Health> {
  const e = ROUTER_V4_MAINNET_EXPECTED;
  const [routerCode, lensCode, owner, lensBinding, feeConfig, paused, routerFee, routerConfig] = await Promise.all([
    client.getBytecode({ address: e.router }),
    client.getBytecode({ address: e.lens }),
    client.readContract({ address: e.router, abi: FLOW_BRIDGE_ROUTER_V4_ABI, functionName: "owner" }),
    client.readContract({ address: e.lens, abi: FLOW_BRIDGE_ROUTER_LENS_ABI, functionName: "flowRouter" }),
    client.readContract({ address: e.router, abi: FLOW_BRIDGE_ROUTER_V4_ABI, functionName: "getFeeConfig" }),
    client.readContract({ address: e.router, abi: FLOW_BRIDGE_ROUTER_V4_ABI, functionName: "paused" }),
    client.readContract({ address: e.router, abi: FLOW_BRIDGE_ROUTER_V4_ABI, functionName: "routerFeeBps", args: [e.routerId] }),
    client.readContract({ address: e.router, abi: FLOW_BRIDGE_ROUTER_V4_ABI, functionName: "routers", args: [e.routerId] }),
  ]);
  const config = routerConfig as readonly [Address, number, Address, boolean, string, string];
  const fees = feeConfig as readonly [bigint, bigint, Address];
  const checks: RouterHealthCheck[] = [
    { key: "router_code", ok: !!routerCode && routerCode !== "0x", detail: "Router V4 bytecode" },
    { key: "lens_code", ok: !!lensCode && lensCode !== "0x", detail: "Router Lens bytecode" },
    { key: "owner", ok: eq(owner as Address, e.owner), detail: "Router owner" },
    { key: "lens_binding", ok: eq(lensBinding as Address, e.router), detail: "Lens binding" },
    { key: "bdex_v3_registered", ok: eq(config[0], e.bdexV3Router) && Number(config[1]) === 1, detail: "BDEX V3 registration" },
    { key: "bdex_v3_active", ok: config[3] === true, detail: "BDEX V3 active" },
    { key: "effective_fee", ok: BigInt(routerFee as bigint) === e.effectiveFeeBps, detail: "BDEX V3 fee 1 bp" },
    { key: "global_fee", ok: fees[0] === e.globalFeeBps, detail: "Global fee 0 bp" },
    { key: "treasury", ok: eq(fees[2], e.treasury), detail: "Treasury" },
    { key: "not_paused", ok: paused === false, detail: "Router not paused" },
    { key: "wrapped_native", ok: eq(config[2], e.wrappedNative), detail: "WBOT configuration" },
  ];
  return { ok: checks.every((c) => c.ok), checkedAt: Date.now(), checks };
}

export function routerHealthWarning(health: RouterV4Health | null, error: boolean): string | null {
  if (error) return "Router V4 health check is temporarily unavailable. Atomic V4 routes are paused until it recovers.";
  if (!health || health.ok) return null;
  return `Router V4 configuration warning: ${health.checks.filter((c) => !c.ok).map((c) => c.detail).join(", ")}. Atomic V4 routes are paused; no contract change was attempted.`;
}
