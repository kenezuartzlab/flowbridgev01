import { describe, expect, it } from "vitest";
import { decodeFunctionData, type Hex } from "viem";
import { FLOW_BRIDGE_ROUTER_V4_GENERATED_ABI as V4 } from "@/lib/flowbridge/routerV4Abi.generated";
import { pairById, ROUTER_V4 } from "./config";
import { assertAllowlisted, assertExecutionAllowed, buildLegCall, checkGas, nativeReceived, outboxApply, planAmounts, receivedFromLogs, reserveNonce, rpcConsensus, verifyDeployment, LEG_SELECTORS, ROUTER_V4_RUNTIME_KECCAK, type OutboxEntry } from "./executor";
import { nextBlockToProcess, percentile, pickBatch, pool } from "./worker";
import { loadTradingSigner } from "./signer";
import { registerPreview, REGISTRY_WRITES_ENABLED, VENUE_CANDIDATES } from "./registry";

const ME = "0x00000000000000000000000000000000000000aa" as Hex;
describe("fee accounting (fee once, minOut on total pulled)", () => {
  it("1 bp on 5 USDT: swap 4999501, fee 499, pulled = budget (no dust)", () => {
    const p = planAmounts(5_000_000n, 1);
    expect(p).toEqual({ swapAmount: 4_999_501n, fee: 499n, pulled: 5_000_000n, dust: 0n });
  });
  it("swap is maximal: one more wei would exceed budget", () => {
    for (const b of [1n, 999n, 10_001n, 10n ** 18n + 7n]) { const p = planAmounts(b, 1); expect(p.pulled <= b).toBe(true); const s = p.swapAmount + 1n; expect(s + s / 10_000n > b).toBe(true); }
  });
  it("0 bps means no fee", () => expect(planAmounts(100n, 0)).toMatchObject({ swapAmount: 100n, fee: 0n }));
});
describe("leg calls: closed allowlist and exact approvals", () => {
  const plan = planAmounts(10n ** 18n, 1);
  it("CA/BOT buy is native-in with value = swap+fee and no approval", () => {
    const c = buildLegCall(pairById("CA/BOT")!, "buy", plan, 5n, ME, 9n);
    expect(c.fn).toBe("swapNativeToTokenV3MultiSafe"); expect(c.value).toBe(plan.pulled); expect(c.approval).toBeNull();
    const d = decodeFunctionData({ abi: V4, data: c.data }); expect(d.args?.[3]).toBe(plan.swapAmount); expect(d.args?.[7]).toBe(plan.fee);
  });
  it("CA/BOT sell approves exactly pulled and is token->native", () => {
    const c = buildLegCall(pairById("CA/BOT")!, "sell", plan, 5n, ME, 9n);
    expect(c.fn).toBe("swapTokenToNativeV3MultiSafe"); expect(c.approval?.amount).toBe(plan.pulled); expect(c.revokeAfter).toBe(true);
  });
  it("CA/USDT is a single atomic multi-hop through WBOT", () => {
    const c = buildLegCall(pairById("CA/USDT")!, "buy", plan, 5n, ME, 9n);
    expect(c.fn).toBe("swapV3MultiSafe"); expect(c.approval?.amount).toBe(plan.pulled);
  });
  it("rejects zero minOut, foreign targets and foreign selectors", () => {
    expect(() => buildLegCall(pairById("BOT/USDT")!, "buy", plan, 0n, ME, 9n)).toThrow("MIN_OUT_ZERO");
    expect(() => assertAllowlisted({ to: ME, data: LEG_SELECTORS.swapV3MultiSafe })).toThrow("TARGET_NOT_ALLOWED");
    expect(() => assertAllowlisted({ to: ROUTER_V4, data: "0x095ea7b3" })).toThrow("SELECTOR_NOT_ALLOWED");
  });
});
describe("deployment identity and independent RPC consensus", () => {
  const facts = { chainId: 677, codeKeccak: ROUTER_V4_RUNTIME_KECCAK, paused: false, owner: ME, routerCount: 1, routerFeeBps: 1,
    entry: { router: "0x07032d47A1b9f8460cBeE9dC17c1d3E438693929", rtype: 1, wrappedNative: "0xd5452816194a3784dba983426cce7c122f4abd30", active: true },
    selectorsInCode: Object.fromEntries(Object.values(LEG_SELECTORS).map((s) => [s, true])) };
  const exp = { routerId: 0, v3Router: "0x07032d47A1b9f8460cBeE9dC17c1d3E438693929", wbot: "0xd5452816194a3784dba983426cce7c122f4abd30", feeBps: 1 };
  it("passes on the recorded deployment", () => expect(verifyDeployment(facts, exp)).toEqual([]));
  it("fails closed on code hash, pause, fee change and missing selector", () => {
    expect(verifyDeployment({ ...facts, codeKeccak: "0x00", paused: true, routerFeeBps: 2, selectorsInCode: {} }, exp)).toEqual(expect.arrayContaining(["CODE_HASH", "PAUSED", "FEE_CHANGED", "SELECTOR_swapV3MultiSafe"]));
  });
  const o = (host: string, o2 = {}) => ({ host, chainId: 677, head: 100, hashAtCommon: "0xh", observedAt: 1000, ...o2 });
  it("same host is not independent; hash/head/chain/stale divergence fails", () => {
    expect(rpcConsensus(o("https://a.x"), o("https://a.x/other"), 1000)).toBe("RPC_NOT_INDEPENDENT");
    expect(rpcConsensus(o("https://a.x"), o("https://b.x", { hashAtCommon: "0xz" }), 1000)).toBe("RPC_HASH_DIVERGENCE");
    expect(rpcConsensus(o("https://a.x"), o("https://b.x", { head: 110 }), 1000)).toBe("RPC_HEAD_DIVERGENCE");
    expect(rpcConsensus(o("https://a.x"), o("https://b.x", { chainId: 1 }), 1000)).toBe("CHAIN_MISMATCH");
    expect(rpcConsensus(o("https://a.x"), o("https://b.x"), 60_000)).toBe("RPC_STALE");
    expect(rpcConsensus(o("https://a.x"), o("https://b.x"), 1000)).toBeNull();
  });
});
describe("gas, nonces, outbox, receipts", () => {
  it("gas cap is separate from price", () => { expect(checkGas(300_000n, 10n ** 9n, 3n * 10n ** 14n)).toBeNull(); expect(checkGas(300_001n, 10n ** 9n, 3n * 10n ** 14n)).toBe("GAS_CAP"); });
  it("nonce reservations never collide", () => { expect(reserveNonce(5, [])).toBe(5); expect(reserveNonce(5, [5, 6])).toBe(7); expect(reserveNonce(9, [5])).toBe(9); });
  const e0: OutboxEntry = { idempotencyKey: "k", nonce: 1, state: "RESERVED", txHash: null, minedBlock: null, minedHash: null };
  const mined = outboxApply(outboxApply(outboxApply(e0, { type: "signed", txHash: "0xt" }), { type: "broadcast" }), { type: "mined", block: 10, blockHash: "0xb", status: "success" });
  it("finality after 6 confirmations; reorg returns to BROADCAST (await same tx), never re-sign", () => {
    expect(outboxApply(mined, { type: "head", head: 14, hashAtMined: "0xb", minConf: 6 }).state).toBe("MINED");
    expect(outboxApply(mined, { type: "head", head: 15, hashAtMined: "0xb", minConf: 6 }).state).toBe("FINAL");
    const r = outboxApply(mined, { type: "head", head: 15, hashAtMined: "0xother", minConf: 6 });
    expect(r.state).toBe("BROADCAST"); expect(r.txHash).toBe("0xt");
    expect(() => outboxApply(r, { type: "signed", txHash: "0xnew" })).toThrow("ILLEGAL_SIGN");
  });
  it("replaced/dropped/reverted are terminal and idempotent", () => {
    const b = outboxApply(outboxApply(e0, { type: "signed", txHash: "0xt" }), { type: "broadcast" });
    const rep = outboxApply(b, { type: "nonceUsedByOther" }); expect(rep.state).toBe("REPLACED");
    expect(outboxApply(rep, { type: "broadcast" })).toBe(rep);
    expect(outboxApply(b, { type: "missing", afterMs: 31 * 60_000 }).state).toBe("DROPPED");
    expect(outboxApply(b, { type: "mined", block: 1, blockHash: "0x", status: "reverted" }).state).toBe("REVERTED");
  });
  it("actual output comes from Transfer logs to the trader only", () => {
    const T = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"; const pad = (a: string) => "0x" + a.slice(2).padStart(64, "0");
    const logs = [{ address: "0xTok", topics: [T, pad(ME), pad(ME)], data: "0x05" }, { address: "0xtok", topics: [T, pad(ME), pad("0x00000000000000000000000000000000000000bb")], data: "0x09" }, { address: "0xother", topics: [T, pad(ME), pad(ME)], data: "0x07" }];
    expect(receivedFromLogs(logs, "0xtok", ME)).toBe(5n);
    expect(nativeReceived(100n, 150n, 10n, 2n)).toBe(70n);
  });
});
describe("hard gates", () => {
  const ok = { emergencyPaused: false, signerConfigured: true, consensus: null, deploymentErrors: [] };
  it("default build: LIVE_DISABLED before anything else", () => expect(() => assertExecutionAllowed({ ...ok })).toThrow("LIVE_DISABLED"));
  it("even with live flag, pause/signer/consensus/deployment block", () => {
    expect(() => assertExecutionAllowed({ ...ok, liveFlag: true, emergencyPaused: true })).toThrow("EMERGENCY_PAUSED");
    expect(() => assertExecutionAllowed({ ...ok, liveFlag: true, signerConfigured: false })).toThrow("SIGNER_NOT_CONFIGURED");
    expect(() => assertExecutionAllowed({ ...ok, liveFlag: true, consensus: "SECOND_RPC_MISSING" })).toThrow("SECOND_RPC_MISSING");
    expect(() => assertExecutionAllowed({ ...ok, liveFlag: true, deploymentErrors: ["CODE_HASH"] })).toThrow("DEPLOYMENT:CODE_HASH");
  });
  it("no signer exists; registry writes disabled; CaSwap not recommended", () => {
    expect(loadTradingSigner()).toEqual({ status: "NOT_CONFIGURED", signer: null });
    expect(REGISTRY_WRITES_ENABLED).toBe(false);
    expect(VENUE_CANDIDATES.find((v) => v.key === "caswap-v2")).toMatchObject({ abiCompatible: true, usefulDepth: false, recommendation: "DO_NOT_REGISTER" });
    expect(registerPreview("caswap-v2", ME).data.startsWith("0x")).toBe(true);
  });
});
describe("worker scheduling", () => {
  it("coalesces missed blocks and skips repeats", () => { expect(nextBlockToProcess(10, 10).process).toBe(false); expect(nextBlockToProcess(10, 14)).toEqual({ process: true, skipped: 3 }); });
  it("bounded fair batch", () => expect(pickBatch([{ id: "b", checkedAt: 2 }, { id: "a", checkedAt: 1 }, { id: "c", checkedAt: 3 }], 2).map((x) => x.id)).toEqual(["a", "b"]));
  it("pool never exceeds limit", async () => { let live = 0, max = 0; await pool([...Array(20).keys()], 6, async () => { live++; max = Math.max(max, live); await new Promise((r) => setTimeout(r, 1)); live--; }); expect(max).toBe(6); });
  it("percentiles", () => { expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3); expect(percentile([...Array(100).keys()].map((i) => i + 1), 95)).toBe(95); });
});
