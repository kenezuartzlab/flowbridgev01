import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { keccak256, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { managedDatabaseFixture, FIXTURE_ORDER, FIXTURE_HOLDER } from "../../../scripts/autotrade/managed-store-fixture";
import { buildLegCall, planAmounts } from "./executor";
import { pairById } from "./config";
import { processManagedOrders } from "./managedDispatch.server";
import type { ManagedEffectRequest } from "./liveTransport";
const counters = vi.hoisted(() => ({ nonce: 0, signs: 0, broadcasts: 0, crash: true }));
// TEST-MODULE OVERRIDE ONLY. No environment or production source activation.
vi.mock("./config", async original => ({ ...await original<typeof import("./config")>(), AUTOTRADE_LIVE_ENABLED: true }));
vi.mock("./infrastructure.server", () => ({ loadManagedInfrastructure: () => ({
  rpc: { primaryUrl: "https://primary.example.org", secondaryUrl: "https://secondary.example.org", primaryOperator: "fixture-A", secondaryOperator: "fixture-B", independenceReviewed: true, comparisonDays: 7, mismatches: 0, receiptParity: true },
  signer: { origin: "https://broker.example.org", credential: "offline-fixture", keyId: "fixture", account: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", custodyReviewed: true },
}) }));
vi.mock("./managedRpc.server", () => ({ createManagedRpcConnector: () => ({
  consensus: async () => 100n, pendingNonce: async () => counters.nonce,
  broadcast: async (raw: Hex) => { counters.broadcasts++; counters.nonce++; if (counters.crash) { counters.crash = false; throw new Error("CRASH_AFTER_SUBMISSION"); } return keccak256(raw); },
  receipt: async () => ({ final: true, status: "success", actualOut: 123n, blockNumber: 100n, blockHash: `0x${"ab".repeat(32)}` }),
}) }));
let fixture: Awaited<ReturnType<typeof managedDatabaseFixture>>;
const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
beforeAll(async () => {
  fixture = await managedDatabaseFixture(); await fixture.reset();
  vi.stubGlobal("fetch", async (_url: unknown, init: RequestInit) => {
    const p = JSON.parse(String(init.body)); counters.signs++;
    return Response.json({ serializedTransaction: await account.signTransaction({ chainId: p.chainId, nonce: p.nonce, to: p.to, data: p.data, value: BigInt(p.value), gas: BigInt(p.gas), gasPrice: BigInt(p.maxFeePerGas) }) });
  });
}, 60000);
afterAll(async () => { vi.unstubAllGlobals(); await fixture?.db.close(); });
it("actual worker dispatch → exact SQL intent/store → broker → crash → fenced restart → receipt", async () => {
  const pair = pairById("CA/BOT"); if (!pair) throw new Error("PAIR");
  const leg = buildLegCall(pair, "buy", planAmounts(10n ** 18n, 1), 1n, account.address, 9999999999n);
  const r: ManagedEffectRequest = { key: "worker:buy", orderId: FIXTURE_ORDER, account: account.address, side: "buy", leg, call: leg, gas: 400000n, maxFeePerGas: 1000000000n, maxGasWei: 10n ** 16n, routeGuard: { verified: true, registered: true, quoteOnly: false, feeMutable: false, externalFeeBps: 0 } };
  await fixture.seed([r]);
  const client = { ...fixture.client, from: (table: string) => {
    expect(table).toBe("autotrade_managed_pending");
    return { select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: (await fixture.db.query("SELECT request_json,fingerprint FROM autotrade_managed_pending WHERE approved ORDER BY execution_index LIMIT 4")).rows, error: null }) }) }) }) };
  } };
  await expect(processManagedOrders(client, FIXTURE_HOLDER, 1)).rejects.toThrow("CRASH_AFTER_SUBMISSION");
  const nextHolder = "10000000-0000-4000-8000-000000000005";
  await fixture.db.query("UPDATE autotrade_worker_lease SET holder=$1,fencing=2", [nextHolder]);
  expect(await processManagedOrders(client, nextHolder, 2)).toEqual({ processed: 1, status: "MANAGED" });
  expect(await processManagedOrders(client, nextHolder, 2)).toEqual({ processed: 0, status: "MANAGED" });
  expect(counters.signs).toBe(1); expect(counters.broadcasts).toBe(1);
  expect((await fixture.db.query<{ state: string; version: number }>("SELECT state,version FROM autotrade_orders")).rows[0]).toMatchObject({ state: "HOLDING", version: 1 });
});