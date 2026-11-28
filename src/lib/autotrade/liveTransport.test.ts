import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeFunctionData, keccak256, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildLegCall, planAmounts } from "./executor";
import { pairById, ROUTER_V4 } from "./config";
import { executeManagedEffect, type ManagedEffectIO, type ManagedEffectRequest, type ManagedEffectRow } from "./liveTransport";
import { brokerSign, processManagedLiveEffect } from "./managedSigner.server";

// Published Anvil disposable key. Never connected to any RPC or used for an external signature.
const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const pair = pairById("CA/BOT");
if (!pair) throw new Error("TEST_PAIR_MISSING");
const leg = buildLegCall(pair, "buy", planAmounts(10n ** 18n, 1), 1n, account.address, 9999999999n);
const request: ManagedEffectRequest = { key: "order:buy", orderId: "offline-order", account: account.address, side: "buy", call: leg, leg, gas: 400_000n, maxFeePerGas: 1_000_000_000n, maxGasWei: 10n ** 16n, routeGuard: { verified: true, registered: true, quoteOnly: false, externalFeeBps: 0, feeMutable: false } };
const signer = { origin: "https://kms-broker.example.org", credential: "offline-fixture-only", keyId: "fixture", account: account.address, custodyReviewed: true };
const rpc = { primaryUrl: "https://rpc.botchain.ai", secondaryUrl: "https://independent.example.org", primaryOperator: "BOT", secondaryOperator: "Independent", independenceReviewed: true, comparisonDays: 7, mismatches: 0, receiptParity: true };
let rows: Map<string, ManagedEffectRow>, nextNonce: number, io: ManagedEffectIO;
beforeEach(() => {
  rows = new Map(); nextNonce = 0;
  io = {
    authorize: vi.fn(async () => {}),
    reserve: vi.fn(async r => {
      const existing = rows.get(r.key); if (existing) return existing;
      if ([...rows.values()].some(e => !["FINAL", "REVERTED"].includes(e.state))) throw new Error("OPEN_EFFECT");
      const row: ManagedEffectRow = { key: r.key, nonce: nextNonce++, state: "RESERVED", raw: null, hash: null };
      rows.set(r.key, row); return row;
    }),
    advance: vi.fn(async (_row, next) => { rows.set(next.key, next); }),
    sign: vi.fn(async (r, nonce) => account.signTransaction({ chainId: 677, nonce, to: r.call.to, data: r.call.data, value: r.call.value, gas: r.gas, gasPrice: r.maxFeePerGas })),
    broadcast: vi.fn(async raw => keccak256(raw)),
    receipt: vi.fn(async () => ({ final: true, status: "success" as const, actualOut: 123n })),
  };
});
describe("managed transport rehearsal (mock IO only)", () => {
  it.each([{ externalFeeBps: 7300 }, { registered: false }, { quoteOnly: true }, { feeMutable: true }, { verified: false }])("rejects unsafe route before reserve/sign %j", async patch => {
    await expect(executeManagedEffect({ ...request, routeGuard: { ...request.routeGuard, ...patch } }, io)).rejects.toThrow("ROUTE_GUARD_REJECTED");
    expect(io.reserve).not.toHaveBeenCalled(); expect(io.sign).not.toHaveBeenCalled();
  });
  it("runs buy, exact approval, sell, revoke with sequential durable nonces", async () => {
    const sell = buildLegCall(pair, "sell", planAmounts(123n, 1), 1n, account.address, 9999999999n);
    if (!sell.approval) throw new Error("TEST_APPROVAL_MISSING");
    const abi = parseAbi(["function approve(address,uint256) returns (bool)"]);
    const approval = (amount: bigint) => ({ to: sell.approval?.token as Hex, value: 0n, data: encodeFunctionData({ abi, functionName: "approve", args: [ROUTER_V4, amount] }) });
    for (const r of [request, { ...request, key: "order:approval", side: "approve" as const, leg: sell, call: approval(sell.approval.amount) }, { ...request, key: "order:sell", side: "sell" as const, leg: sell, call: sell }, { ...request, key: "order:revoke", side: "revoke" as const, leg: sell, call: approval(0n) }]) {
      expect(await executeManagedEffect(r, io)).toEqual({ state: "FINAL", actualOut: 123n });
    }
    expect([...rows.values()].map(r => r.nonce)).toEqual([0, 1, 2, 3]);
    expect(io.sign).toHaveBeenCalledTimes(4);
  });
  it("crash after broadcast resumes receipt without another sign or send", async () => {
    vi.mocked(io.broadcast).mockRejectedValueOnce(new Error("CRASH"));
    await expect(executeManagedEffect(request, io)).rejects.toThrow("CRASH");
    expect(rows.get(request.key)?.state).toBe("BROADCAST");
    expect((await executeManagedEffect(request, io)).state).toBe("FINAL");
    expect(io.sign).toHaveBeenCalledTimes(1); expect(io.broadcast).toHaveBeenCalledTimes(1);
  });
  it("unknown receipt remains pending and never resends on restart", async () => {
    vi.mocked(io.receipt).mockResolvedValue(null);
    await executeManagedEffect(request, io); await executeManagedEffect(request, io);
    expect(rows.get(request.key)?.state).toBe("BROADCAST");
    expect(io.sign).toHaveBeenCalledTimes(1); expect(io.broadcast).toHaveBeenCalledTimes(1);
  });
  it("recovered outbox hash must match exact stored signed bytes", async () => {
    vi.mocked(io.receipt).mockResolvedValue(null);
    await executeManagedEffect(request, io);
    const row = rows.get(request.key); if (!row) throw new Error("FIXTURE_ROW");
    rows.set(request.key, { ...row, hash: `0x${"00".repeat(32)}` });
    await expect(executeManagedEffect(request, io)).rejects.toThrow("OUTBOX_HASH_MISMATCH");
    expect(io.broadcast).toHaveBeenCalledTimes(1);
  });
  it("pause/fence loss immediately before signing prevents connector call", async () => {
    vi.mocked(io.authorize).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("FENCE_LOST"));
    await expect(executeManagedEffect(request, io)).rejects.toThrow("FENCE_LOST");
    expect(io.sign).not.toHaveBeenCalled();
  });
  it("pause before broadcast persists signature but makes no submission", async () => {
    vi.mocked(io.authorize).mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("PAUSED"));
    await expect(executeManagedEffect(request, io)).rejects.toThrow("PAUSED");
    expect(rows.get(request.key)?.state).toBe("SIGNED"); expect(io.broadcast).not.toHaveBeenCalled();
  });
  it("immutable calldata tampering is rejected before reserve", async () => {
    await expect(executeManagedEffect({ ...request, call: { ...request.call, data: `${request.call.data}00` } }, io)).rejects.toThrow("IMMUTABLE_CALL_MISMATCH");
    expect(io.reserve).not.toHaveBeenCalled();
  });
  it("gas cap prevents all external effects", async () => {
    await expect(executeManagedEffect({ ...request, maxGasWei: 1n }, io)).rejects.toThrow("GAS_CAP");
    expect(io.sign).not.toHaveBeenCalled();
  });
  it("production source lock blocks even fully claimed infrastructure and approvals", async () => {
    const approved = vi.fn(async () => {});
    await expect(processManagedLiveEffect(request, { io, signer, rpc, assertApprovedOrderAndLease: approved })).rejects.toThrow("LIVE_DISABLED");
    expect(io.reserve).not.toHaveBeenCalled(); expect(io.sign).not.toHaveBeenCalled(); expect(approved).not.toHaveBeenCalled();
  });
  it("broker authorization denial makes zero HTTP calls", async () => {
    const send = vi.fn();
    await expect(brokerSign(signer, request, 0, async () => { throw new Error("LIVE_DISABLED"); }, send)).rejects.toThrow("LIVE_DISABLED");
    expect(send).not.toHaveBeenCalled();
  });
  it("concrete broker HTTP contract carries exact nonce/chain and rejects redirects", async () => {
    const send = vi.fn<typeof fetch>(async () => new Response(null, { status: 302 }));
    await expect(brokerSign(signer, request, 7, async () => {}, send)).rejects.toThrow("MANAGED_SIGNER_REQUEST_FAILED");
    const init = send.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.redirect).toBe("manual");
    expect(JSON.parse(String(init?.body))).toMatchObject({ chainId: 677, nonce: 7, orderId: "offline-order" });
  });
  it("mock HTTP broker response passes through signature validation and durable execution", async () => {
    const send = vi.fn<typeof fetch>(async (_url, init) => {
      const payload = JSON.parse(String(init?.body));
      const raw = await account.signTransaction({ chainId: payload.chainId, nonce: payload.nonce, to: payload.to, data: payload.data, value: BigInt(payload.value), gas: BigInt(payload.gas), gasPrice: BigInt(payload.maxFeePerGas) });
      return Response.json({ serializedTransaction: raw });
    });
    io.sign = vi.fn((r, nonce) => brokerSign(signer, r, nonce, async () => {}, send));
    expect((await executeManagedEffect(request, io)).state).toBe("FINAL");
    expect(send).toHaveBeenCalledTimes(1); expect(io.broadcast).toHaveBeenCalledTimes(1);
  });
});