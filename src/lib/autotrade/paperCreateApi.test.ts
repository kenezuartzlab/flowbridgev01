import { beforeEach, describe, expect, it, vi } from "vitest";
import { deserialize, serialize } from "./store.server";
const mocks = vi.hoisted(() => ({ gate: vi.fn(), from: vi.fn(), reference: vi.fn() }));
vi.mock("@/lib/admin/adminGate.server", () => ({ requireAdmin: mocks.gate }));
vi.mock("@/lib/autotrade/store.server", async importOriginal => ({ ...await importOriginal<typeof import("./store.server")>(), db: async () => ({ from: mocks.from }) }));
vi.mock("@/lib/autotrade/reference.server", () => ({ readPaperReference: mocks.reference }));
import { Route } from "@/routes/api/admin.autotrade";
type Row = { id: string; created_by_email: string; mode: string; order_json: ReturnType<typeof serialize> };
const rows = new Map<string, Row>();
let storageFails = false;
let inserts = 0;
let raceConflict = false;
const handler = (Route.options as unknown as { server: { handlers: { POST: (args: { request: Request }) => Promise<Response> } } }).server.handlers.POST;
const screenshot = { action: "create", requestId: "f3869616-161f-401d-87f6-1b9a53c24e8e", pair: "CA/BOT", budget: "5", maxBuyPrice: "2", minSellPrice: "2.5", slippageBps: 50, maxGasNative: "0.05", maxLoss: "5", expiresInMinutes: 60, repeat: false };
const send = (body: unknown = screenshot) => handler({ request: new Request("http://localhost/api/admin/autotrade", { method: "POST", body: JSON.stringify(body) }) });
beforeEach(() => {
  rows.clear(); storageFails = false; inserts = 0; raceConflict = false; vi.clearAllMocks();
  mocks.gate.mockResolvedValue({ ok: true, admin: { role: "super_admin", email: "owner@example.invalid", userId: "actor" } });
  mocks.from.mockImplementation((table: string) => {
    let id = "";
    const query = { select: () => query, eq: (_key: string, value: string) => { id = value; return query; },
      maybeSingle: async () => ({ data: rows.get(id) ?? null, error: null }),
      insert: async (row: Row) => {
        if (table !== "autotrade_orders") return { error: null };
        if (storageFails) return { error: { code: "unavailable" } };
        if (rows.has(row.id)) return { error: { code: "23505" } };
        if (raceConflict) { rows.set(row.id, row); inserts++; return { error: { code: "23505" } }; }
        rows.set(row.id, row); inserts++; return { error: null };
      },
    }; return query;
  });
});
describe("paper creation handler with isolated mock persistence (not owner acceptance)", () => {
  it("persists all exact screenshot values and returns the saved id", async () => {
    const response = await send(); expect(response.status).toBe(200); expect(await response.json()).toEqual({ ok: true, id: screenshot.requestId });
    const row = rows.get(screenshot.requestId); if (!row) throw new Error("No saved row");
    const order = deserialize(row.order_json);
    expect(row.mode).toBe("paper"); expect(order.spec.budgetQuote).toBe(5n * 10n ** 18n);
    expect(order.spec.minSellPrice).toEqual({ num: 25n, den: 10n }); expect(order.spec.maxGasWeiPerLeg).toBe(5n * 10n ** 16n);
    expect(mocks.reference).not.toHaveBeenCalled();
  });
  it("replays the same request without a duplicate", async () => {
    const responses = [await send(), await send()];
    expect(responses.map(r => r.status)).toEqual([200, 200]); expect(inserts).toBe(1);
    const response = await send(); expect(await response.json()).toMatchObject({ replayed: true }); expect(rows.size).toBe(1);
  });
  it("recovers a database unique-key race by reading the same saved request", async () => {
    raceConflict = true;
    const response = await send(); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ replayed: true }); expect(rows.size).toBe(1);
  });
  it("rejects ID reuse with different parameters", async () => { await send(); expect((await send({ ...screenshot, budget: "6" })).status).toBe(409); expect(inserts).toBe(1); });
  it("does not replay another actor's request", async () => {
    await send(); mocks.gate.mockResolvedValue({ ok: true, admin: { role: "super_admin", email: "other@example.invalid" } });
    expect((await send()).status).toBe(409); expect(inserts).toBe(1);
  });
  it("reports failed storage and saves no row", async () => { storageFails = true; const response = await send(); expect(response.status).toBe(503); expect(await response.json()).toHaveProperty("error"); expect(rows.size).toBe(0); });
  it("rejects excessive gas decimals before insertion", async () => { expect((await send({ ...screenshot, maxGasNative: "0.0000000000000000001" })).status).toBe(400); expect(inserts).toBe(0); });
  it("rejects failed authentication before touching persistence", async () => {
    mocks.gate.mockResolvedValue({ ok: false, response: new Response("Unauthorized", { status: 401 }) }); expect((await send()).status).toBe(401); expect(mocks.from).not.toHaveBeenCalled();
  });
  it("rejects operators without bypassing the super-admin writer", async () => {
    mocks.gate.mockResolvedValue({ ok: true, admin: { role: "internal_operator" } }); expect((await send()).status).toBe(403); expect(mocks.from).not.toHaveBeenCalled();
  });
  it("rechecks USDT equivalent against server evidence and refuses a changed conversion", async () => {
    mocks.reference.mockResolvedValue({ usdtPerBot: "10", expiresAt: Date.now() + 15000 });
    expect((await send({ ...screenshot, budgetUnit: "USDT_EQUIVALENT", reviewedBudget: "0.4", maxLoss: "0.4" })).status).toBe(409); expect(inserts).toBe(0);
  });
  it("saves a matching reviewed USDT conversion as BOT, always paper", async () => {
    mocks.reference.mockResolvedValue({ usdtPerBot: "10", expiresAt: Date.now() + 15000 });
    expect((await send({ ...screenshot, budgetUnit: "USDT_EQUIVALENT", reviewedBudget: "0.5", maxLoss: "0.5" })).status).toBe(200);
    const row = rows.get(screenshot.requestId); if (!row) throw new Error("Missing row");
    expect(deserialize(row.order_json).spec.budgetQuote).toBe(5n * 10n ** 17n); expect(row.mode).toBe("paper");
  });
});