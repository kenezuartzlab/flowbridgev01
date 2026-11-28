import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeFunctionData, keccak256, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildLegCall, planAmounts } from "./executor";
import { pairById, ROUTER_V4 } from "./config";
import { executeManagedEffect, type ManagedEffectIO, type ManagedEffectRequest } from "./liveTransport";
import { ManagedExecutionStore } from "./managedStore.server";
import { brokerSign } from "./managedSigner.server";
import { managedDatabaseFixture, FIXTURE_ORDER, FIXTURE_HOLDER, FIXTURE_ATTEMPT } from "../../../scripts/autotrade/managed-store-fixture";

// Public disposable local fixture key. No external RPC, funding or real account.
const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const pair = pairById("CA/BOT"); if (!pair) throw new Error("PAIR");
const buyLeg = buildLegCall(pair, "buy", planAmounts(10n ** 18n, 1), 1n, account.address, 9999999999n);
const buy: ManagedEffectRequest = { key: "local:buy", orderId: FIXTURE_ORDER, account: account.address, side: "buy", call: buyLeg, leg: buyLeg, gas: 400000n, maxFeePerGas: 1000000000n, maxGasWei: 10n ** 16n, routeGuard: { verified: true, registered: true, quoteOnly: false, feeMutable: false, externalFeeBps: 0 } };
const sellLeg = buildLegCall(pair, "sell", planAmounts(123n, 1), 1n, account.address, 9999999999n);
const approveCall = (amount: bigint) => ({ to: sellLeg.approval?.token as Hex, value: 0n, data: encodeFunctionData({ abi: parseAbi(["function approve(address,uint256) returns (bool)"]), functionName: "approve", args: [ROUTER_V4, amount] }) });
const requests: ManagedEffectRequest[] = [buy, { ...buy, key: "local:approve", side: "approve", leg: sellLeg, call: approveCall(sellLeg.approval?.amount ?? 0n) }, { ...buy, key: "local:sell", side: "sell", leg: sellLeg, call: sellLeg }, { ...buy, key: "local:revoke", side: "revoke", leg: sellLeg, call: approveCall(0n) }];
let fixture: Awaited<ReturnType<typeof managedDatabaseFixture>>, nonce: number, store: ManagedExecutionStore, io: ManagedEffectIO;
const signer = { origin: "https://offline-broker.example.org", credential: "offline-fixture", keyId: "fixture", account: account.address, custodyReviewed: true };
beforeAll(async () => { fixture = await managedDatabaseFixture(); }, 60000);
afterAll(async () => { await fixture?.db.close(); });
beforeEach(async () => {
  await fixture.reset(); await fixture.seed(requests); nonce = 0;
  store = new ManagedExecutionStore(fixture.client, { holder: FIXTURE_HOLDER, fencing: 1, attempt: FIXTURE_ATTEMPT }, async () => nonce);
  io = { authorize: store.authorize, reserve: store.reserve, advance: async () => {},
    sign: vi.fn((r, n) => brokerSign(signer, r, n, async () => store.authorize(r), async (_url, init) => {
      const p = JSON.parse(String(init?.body));
      return Response.json({ serializedTransaction: await account.signTransaction({ chainId: p.chainId, nonce: p.nonce, to: p.to, data: p.data, value: BigInt(p.value), gas: BigInt(p.gas), gasPrice: BigInt(p.maxFeePerGas) }) });
    })), broadcast: vi.fn(async raw => { nonce++; return keccak256(raw); }),
    receipt: vi.fn(async () => ({ final: true, status: "success" as const, actualOut: 123n, blockNumber: 100n, blockHash: `0x${"ab".repeat(32)}` as Hex })),
  };
});
const execute = (request: ManagedEffectRequest) => executeManagedEffect(request, { ...io, advance: store.advance(request) });
describe("actual PostgreSQL managed store and mocked broker transport", () => {
  it("completes four effects, canonical amounts and order progression atomically", async () => {
    for (const r of requests) expect((await execute(r)).state).toBe("FINAL");
    const rows = await fixture.db.query<{ nonce: number }>("SELECT nonce FROM autotrade_managed_effects ORDER BY nonce");
    expect(rows.rows.map(r => r.nonce)).toEqual([0, 1, 2, 3]);
    const o = (await fixture.db.query<{ state: string; version: number; order_json: { acquiredBase: { $big: string }; proceedsQuote: { $big: string } } }>("SELECT state,version,order_json FROM autotrade_orders")).rows[0];
    expect(o).toMatchObject({ state: "COMPLETED", version: 4, order_json: { acquiredBase: { $big: "123" }, proceedsQuote: { $big: "123" } } });
    expect(io.sign).toHaveBeenCalledTimes(4);
  });
  it("crash after broadcast restarts with stored bytes and no duplicate effect", async () => {
    vi.mocked(io.broadcast).mockImplementationOnce(async () => { nonce++; throw new Error("CRASH"); });
    await expect(execute(buy)).rejects.toThrow("CRASH");
    expect((await execute(buy)).actualOut).toBe(123n);
    expect((await execute(buy)).actualOut).toBe(123n);
    expect(io.sign).toHaveBeenCalledTimes(1); expect(io.broadcast).toHaveBeenCalledTimes(1);
  });
  it("unknown submission remains reserved across pause and expiry without resend", async () => {
    vi.mocked(io.receipt).mockResolvedValue(null); await execute(buy);
    await fixture.db.exec("UPDATE autotrade_control SET emergency_paused=true; UPDATE autotrade_managed_intents SET expires_at=now()-interval '1 hour';");
    expect((await execute(buy)).state).toBe("BROADCAST");
    expect(io.sign).toHaveBeenCalledTimes(1); expect(io.broadcast).toHaveBeenCalledTimes(1);
  });
  it("same-lease duplicate attempt cannot acquire a RESERVED signing effect", async () => {
    await store.reserve(buy);
    const duplicate = new ManagedExecutionStore(fixture.client, { holder: FIXTURE_HOLDER, fencing: 1, attempt: "10000000-0000-4000-8000-000000000004" }, async () => nonce);
    await expect(duplicate.reserve(buy)).rejects.toThrow("EFFECT_BUSY"); expect(io.sign).not.toHaveBeenCalled();
  });
  it("stale fencing cannot reserve even with exact approved intent", async () => {
    await fixture.db.exec("UPDATE autotrade_worker_lease SET fencing=2");
    await expect(execute(buy)).rejects.toThrow("FENCE_LOST"); expect(io.sign).not.toHaveBeenCalled();
  });
  it("pause prevents sign before broker effects", async () => {
    await fixture.db.exec("UPDATE autotrade_control SET emergency_paused=true");
    await expect(execute(buy)).rejects.toThrow("EMERGENCY_PAUSED"); expect(io.sign).not.toHaveBeenCalled();
  });
  it.each(["approved", "infrastructure_reviewed", "security_reviewed", "gas_approved", "order_authorized"])("requires separate %s authorization", async field => {
    await fixture.db.exec(`UPDATE autotrade_managed_intents SET ${field}=false`);
    await expect(execute(buy)).rejects.toThrow("LIVE_APPROVALS_REQUIRED"); expect(io.sign).not.toHaveBeenCalled();
  });
  it("rejects exact request tampering", async () => {
    await expect(execute({ ...buy, gas: buy.gas + 1n })).rejects.toThrow("EXACT_INTENT_REQUIRED");
  });
  it("rejects trade exposure greater than the approved 5 USDT-equivalent cap", async () => {
    await fixture.db.exec("UPDATE autotrade_managed_intents SET valuation_usdt6_per_bot=6000000");
    await expect(execute(buy)).rejects.toThrow("CANARY_TRADE_CAP"); expect(io.sign).not.toHaveBeenCalled();
  });
  it("reserves gas cumulatively and refuses excess separate gas cap", async () => {
    await fixture.db.exec("UPDATE autotrade_managed_intents SET total_gas_cap_wei=500000000000000");
    await execute(buy);
    const approve = requests[1]; if (!approve) throw new Error("APPROVE");
    await expect(execute(approve)).rejects.toThrow("TOTAL_GAS_CAP"); expect(io.sign).toHaveBeenCalledTimes(1);
  });
  it("does not permit skipped predecessor or out-of-order effects", async () => {
    await fixture.db.exec("UPDATE autotrade_managed_intents SET order_version=0");
    const sell = requests[2]; if (!sell) throw new Error("SELL");
    await expect(execute(sell)).rejects.toThrow("PREDECESSOR_NOT_FINAL"); expect(io.sign).not.toHaveBeenCalled();
  });
  it("blocks unauthorized roles from both tables and reserve RPC", async () => {
    for (const role of ["anon", "authenticated"]) {
      await fixture.db.exec(`SET ROLE ${role}`);
      await expect(fixture.db.query("SELECT * FROM autotrade_managed_intents")).rejects.toThrow("permission denied");
      await expect(store.reserve(buy)).rejects.toThrow("permission denied");
      await fixture.db.exec("RESET ROLE");
    }
  });
  it("requires receipt block evidence before canonical finalization", async () => {
    vi.mocked(io.receipt).mockResolvedValue({ final: true, status: "success", actualOut: 123n });
    await expect(execute(buy)).rejects.toThrow("RECEIPT_EVIDENCE_REQUIRED");
    expect((await fixture.db.query<{ state: string }>("SELECT state FROM autotrade_managed_effects")).rows[0]?.state).toBe("BROADCAST");
  });
});