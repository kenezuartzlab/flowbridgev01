import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { toFunctionSelector, type AbiFunction } from "viem";
import {
  FLOW_BRIDGE_ROUTER_LENS_ABI,
  FLOW_BRIDGE_ROUTER_V4_ABI,
  FLOW_BRIDGE_ROUTER_V4_MAINNET_ABI,
  NATIVE_V3_MULTI_FUNCTIONS,
  V30_1B1_REMOVED_ROUTER_FUNCTIONS,
} from "./routerV4Abi";
import * as contractsAbi from "../../../contracts/production/router-v4/FlowBridgeRouterV4.abi";
import { classifyRoute, planExecution, V4_ATOMIC_FLAGS } from "../swap/executionCapability";
import type { SwapStep } from "../swap/quoter";

const DIR = resolve(__dirname, "../../../contracts/production/router-v4-native-v3-multi");
const artifact = JSON.parse(readFileSync(`${DIR}/abi/FlowBridgeRouterV4.abi.json`, "utf8"));
const lensArtifact = JSON.parse(readFileSync(`${DIR}/abi/FlowBridgeRouterLens.abi.json`, "utf8"));
const source = readFileSync(`${DIR}/FlowBridgeRouterV4.sol`, "utf8");

const fns = (abi: readonly unknown[]) =>
  (abi as AbiFunction[]).filter((x) => x.type === "function");
const selectors = (abi: readonly unknown[]) => fns(abi).map((f) => toFunctionSelector(f)).sort();

describe("Router V4 ABI parity (browser / server / Lens / contracts)", () => {
  it("app V4 ABI equals the compiled artifact exactly", () => {
    expect(JSON.parse(JSON.stringify(FLOW_BRIDGE_ROUTER_V4_ABI))).toEqual(artifact);
    expect(FLOW_BRIDGE_ROUTER_V4_MAINNET_ABI).toBe(FLOW_BRIDGE_ROUTER_V4_ABI);
  });
  it("Lens ABI equals the compiled Lens artifact", () => {
    expect(JSON.parse(JSON.stringify(FLOW_BRIDGE_ROUTER_LENS_ABI))).toEqual(lensArtifact);
  });
  it("contracts tooling ABI is the same object", () => {
    expect(contractsAbi.FLOW_BRIDGE_ROUTER_V4_ABI).toBe(FLOW_BRIDGE_ROUTER_V4_ABI);
    expect(contractsAbi.FLOW_BRIDGE_ROUTER_LENS_ABI).toBe(FLOW_BRIDGE_ROUTER_LENS_ABI);
  });
  it("no removed legacy selector survives in V4", () => {
    const names = fns(FLOW_BRIDGE_ROUTER_V4_ABI).map((f) => f.name);
    for (const r of V30_1B1_REMOVED_ROUTER_FUNCTIONS) expect(names).not.toContain(r);
    for (const n of names.filter((n) => n.startsWith("swap"))) expect(n.endsWith("Safe")).toBe(true);
  });
  it("exposes the new atomic native V3 multi-pool functions", () => {
    const names = fns(FLOW_BRIDGE_ROUTER_V4_ABI).map((f) => f.name);
    for (const n of NATIVE_V3_MULTI_FUNCTIONS) expect(names).toContain(n);
  });
  it("every external swap function in the frozen source is in the ABI", () => {
    const declared = [...source.matchAll(/function (swap\w+Safe)\(/g)].map((m) => m[1]);
    const names = new Set(fns(FLOW_BRIDGE_ROUTER_V4_ABI).map((f) => f.name));
    expect(declared.length).toBeGreaterThanOrEqual(8);
    for (const d of declared) expect(names.has(d)).toBe(true);
    expect(new Set(selectors(FLOW_BRIDGE_ROUTER_V4_ABI)).size).toBe(selectors(FLOW_BRIDGE_ROUTER_V4_ABI).length);
  });
});

const step = (dex: string, o: Partial<SwapStep> = {}): SwapStep =>
  ({ dex, routerId: 0, router: "0x0", path: [], symbolPath: [], inIsNative: false, outIsNative: false, expectedOut: 0n, ...o }) as unknown as SwapStep;

describe("Smart Trade execution capability matrix", () => {
  it("classifies route families", () => {
    expect(classifyRoute([step("bdex-v3", { inIsNative: true }), step("bdex-v3")])).toBe("bdex-v3-native-multi");
    expect(classifyRoute([step("bdex-v3"), step("bdex-v3", { outIsNative: true })])).toBe("bdex-v3-native-multi");
    expect(classifyRoute([step("bdex-v3"), step("bdex-v3")])).toBe("bdex-v3-token-multi");
    expect(classifyRoute([step("bdex-v2"), step("bdex-v3")])).toBe("mixed-v2-v3");
    expect(classifyRoute([step("caswap"), step("bdex-v3")])).toBe("caswap-v3");
    expect(classifyRoute([step("caswap"), step("bdex-v2")])).toBe("v2-cross-router");
  });
  it("mixed V2/V3 and CaSwap+V3 are always staged, even with every flag on", () => {
    const saved = { ...V4_ATOMIC_FLAGS[677] };
    V4_ATOMIC_FLAGS[677] = { nativeV3Multi: true, tokenV3Multi: true, v2CrossRouter: true };
    expect(planExecution([step("bdex-v2"), step("bdex-v3")], 677).execution).toBe("STAGED");
    expect(planExecution([step("caswap"), step("bdex-v3")], 677).execution).toBe("STAGED");
    const p = planExecution([step("bdex-v3", { inIsNative: true }), step("bdex-v3")], 677);
    expect(p).toMatchObject({ execution: "ATOMIC_V4", v4Function: "swapNativeToTokenV3MultiSafe", label: "ATOMIC — V4" });
    V4_ATOMIC_FLAGS[677] = saved;
  });
  it("Mainnet (promoted) runs only native BOT <-> V3 multi-pool atomically", () => {
    const nativeIn = planExecution([step("bdex-v3", { inIsNative: true }), step("bdex-v3")], 677);
    expect(nativeIn.execution).toBe("ATOMIC_V4");
    expect(nativeIn.v4Function).toBe("swapNativeToTokenV3MultiSafe");
    const nativeOut = planExecution([step("bdex-v3"), step("bdex-v3", { outIsNative: true })], 677);
    expect(nativeOut.v4Function).toBe("swapTokenToNativeV3MultiSafe");
    // Every other class stays staged on Mainnet.
    expect(planExecution([step("bdex-v3"), step("bdex-v3")], 677).execution).toBe("STAGED");
    expect(planExecution([step("bdex-v2"), step("bdex-v3")], 677).execution).toBe("STAGED");
    expect(planExecution([step("caswap"), step("bdex-v3")], 677).execution).toBe("STAGED");
    // Testnet flag stays off.
    expect(planExecution([step("bdex-v3", { inIsNative: true }), step("bdex-v3")], 968).execution).toBe("STAGED");
  });
});
