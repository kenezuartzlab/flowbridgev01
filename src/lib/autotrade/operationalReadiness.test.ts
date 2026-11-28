import { describe, expect, it, vi } from "vitest";
import { processManagedOrders, dispatchManagedRequest } from "./managedDispatch.server";
import { operationalReadiness } from "./operationalReadiness";
import { validateConfiguredInfrastructure } from "./infrastructureValidation.server";
import type { ManagedEffectRequest } from "./liveTransport";
describe("operational source locks", () => {
  it("worker dispatch cannot read intents or contact connectors while source-disabled", async () => {
    const client = { from: vi.fn(), rpc: vi.fn() };
    expect(await processManagedOrders(client, "fixture", 1)).toEqual({ processed: 0, status: "LIVE_DISABLED" });
    expect(client.from).not.toHaveBeenCalled(); expect(client.rpc).not.toHaveBeenCalled();
  });
  it("direct managed dispatch rejects before configuration, storage or signing", async () => {
    const client = { rpc: vi.fn() };
    await expect(dispatchManagedRequest({} as ManagedEffectRequest, client, { holder: "fixture", fencing: 1, attempt: "fixture" })).rejects.toThrow("LIVE_DISABLED");
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("configured checklist is not approval and exact prices/gas remain pending", () => {
    const result = operationalReadiness({ rpcConfigured: true, signerConfigured: true, intents: 1, heartbeatAt: null, now: 0 });
    expect(result).toMatchObject({ live: false, public: false, registryWrites: false, capUsdt: 5, capStatus: "APPROVED_CAP_ONLY" });
    expect(result.items.find(x => x.key === "parameters")?.status).toBe("NOT_APPROVED");
  });
  it("absent configuration makes zero external read or sign requests", async () => {
    vi.stubEnv("AUTOTRADE_RPC_CONFIG", ""); const send = vi.fn();
    expect(await validateConfiguredInfrastructure(send)).toMatchObject({ verified: false, status: "NOT_CONFIGURED", signingRequested: false });
    expect(send).not.toHaveBeenCalled(); vi.unstubAllEnvs();
  });
});