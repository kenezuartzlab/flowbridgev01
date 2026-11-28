import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), cron: vi.fn(), worker: vi.fn(), preparation: vi.fn(), infrastructure: vi.fn() }));
vi.mock("@/lib/admin/adminGate.server", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/integrations/supabase/cron-auth", () => ({ authenticateCronRequest: mocks.cron }));
vi.mock("@/lib/autotrade/worker.server", () => ({ runWorker: mocks.worker }));
vi.mock("@/lib/autotrade/preparation.server", () => ({ readCanaryPreparation: mocks.preparation }));
vi.mock("@/lib/autotrade/infrastructureValidation.server", () => ({ validateConfiguredInfrastructure: mocks.infrastructure }));

import { Route as AdminRoute } from "@/routes/api/admin.autotrade";
import { Route as HookRoute } from "@/routes/api/public/hooks/autotrade-worker";

type Handlers = { GET?: (args: { request: Request }) => Promise<Response>; POST: (args: { request: Request }) => Promise<Response> };
const admin = (AdminRoute.options as unknown as { server: { handlers: Handlers } }).server.handlers;
const hook = (HookRoute.options as unknown as { server: { handlers: Handlers } }).server.handlers;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.worker.mockResolvedValue({ decided: 0, lastBlock: null, latencyMs: 1 });
});

describe("AutoTrade HTTP authorization", () => {
  it("rejects signed-out admin reads and writes before storage or chain work", async () => {
    mocks.admin.mockResolvedValue({ ok: false, response: new Response("Unauthorized", { status: 401 }) });
    if (!admin.GET) throw new Error("GET_HANDLER_MISSING");
    expect((await admin.GET({ request: new Request("http://localhost/api/admin/autotrade") })).status).toBe(401);
    expect((await admin.POST({ request: new Request("http://localhost/api/admin/autotrade", { method: "POST", body: "{}" }) })).status).toBe(401);
    expect(mocks.worker).not.toHaveBeenCalled();
  });

  it("forbids operators every policy, canary, infrastructure and registry action", async () => {
    mocks.admin.mockResolvedValue({ ok: true, admin: { role: "internal_operator", email: "operator@example.invalid" } });
    for (const action of ["emergency", "registry_preview", "prepare_canary", "validate_infrastructure", "set_live", "registry_write", undefined]) {
      const response = await admin.POST({ request: new Request("http://localhost/api/admin/autotrade", { method: "POST", body: JSON.stringify({ action }) }) });
      expect(response.status).toBe(403);
    }
    expect(mocks.preparation).not.toHaveBeenCalled(); expect(mocks.infrastructure).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated scheduler request before the worker", async () => {
    mocks.cron.mockResolvedValue(new Response("Unauthorized", { status: 401 }));
    const response = await hook.POST({ request: new Request("http://localhost/api/public/hooks/autotrade-worker", { method: "POST", body: "{}" }) });
    expect(response.status).toBe(401);
    expect(mocks.worker).not.toHaveBeenCalled();
  });

  it("runs paper work only after managed scheduler authentication", async () => {
    mocks.cron.mockResolvedValue(null);
    const response = await hook.POST({ request: new Request("http://localhost/api/public/hooks/autotrade-worker", { method: "POST", body: "{}" }) });
    expect(response.status).toBe(200);
    expect(mocks.worker).toHaveBeenCalledWith("cron");
    expect(await response.json()).toMatchObject({ decided: 0, lastBlock: null, latencyMs: 1 });
  });
  it("authorized estimate reads back cap-only facts without creating an order", async () => {
    mocks.admin.mockResolvedValue({ ok: true, admin: { role: "super_admin" } });
    mocks.preparation.mockResolvedValue({ status: "APPROVED_CAP_ONLY", capUsdt: "5", orderCreated: false, executable: false });
    const response = await admin.POST({ request: new Request("http://localhost/api/admin/autotrade", { method: "POST", body: JSON.stringify({ action: "prepare_canary" }) }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ preparation: { status: "APPROVED_CAP_ONLY", capUsdt: "5", orderCreated: false, executable: false } });
    expect(mocks.worker).not.toHaveBeenCalled();
  });
  it("failed price read returns unavailable rather than a cached executable estimate", async () => {
    mocks.admin.mockResolvedValue({ ok: true, admin: { role: "super_admin" } });
    mocks.preparation.mockRejectedValue(new Error("RPC_SECRET_DETAIL"));
    const response = await admin.POST({ request: new Request("http://localhost/api/admin/autotrade", { method: "POST", body: JSON.stringify({ action: "prepare_canary" }) }) });
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("RPC_SECRET_DETAIL");
  });
  it("validates ticket parameters before any market read", async () => {
    mocks.admin.mockResolvedValue({ ok: true, admin: { role: "super_admin" } });
    for (const patch of [{ slippageBps: 301 }, { expiresInMinutes: 0 }, { maxBuyPrice: "1".repeat(65) }]) {
      const response = await admin.POST({ request: new Request("http://localhost/api/admin/autotrade", { method: "POST", body: JSON.stringify({ action: "prepare_canary", ...patch }) }) });
      expect(response.status).toBe(400);
    }
    expect(mocks.preparation).not.toHaveBeenCalled();
  });
  it("passes exact owner-entered parameters only to the read-only preparation", async () => {
    mocks.admin.mockResolvedValue({ ok: true, admin: { role: "super_admin" } });
    mocks.preparation.mockResolvedValue({ executable: false, orderCreated: false });
    const parameters = { maxBuyPrice: "0.4", minSellPrice: "0.5", slippageBps: 25, expiresInMinutes: 15 };
    const response = await admin.POST({ request: new Request("http://localhost/api/admin/autotrade", { method: "POST", body: JSON.stringify({ action: "prepare_canary", ...parameters }) }) });
    expect(response.status).toBe(200);
    expect(mocks.preparation).toHaveBeenCalledWith(parameters);
    expect(mocks.worker).not.toHaveBeenCalled();
  });
  it("super-admin infrastructure checks return only read-only status", async () => {
    mocks.admin.mockResolvedValue({ ok: true, admin: { role: "super_admin" } });
    mocks.infrastructure.mockResolvedValue({ status: "NOT_CONFIGURED", signingRequested: false });
    const response = await admin.POST({ request: new Request("http://localhost/api/admin/autotrade", { method: "POST", body: JSON.stringify({ action: "validate_infrastructure" }) }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ infrastructure: { status: "NOT_CONFIGURED", signingRequested: false } });
    expect(mocks.worker).not.toHaveBeenCalled();
  });
});
