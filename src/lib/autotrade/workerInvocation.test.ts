import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), fetch: vi.fn() }));
vi.mock("./store.server", () => ({ db: async () => ({ rpc: mocks.rpc, from: mocks.from }) }));
import { runWorker } from "./worker.server";
afterEach(() => vi.unstubAllGlobals());
it("authenticated cron dispatch runs one bounded observation cycle, records heartbeat, and releases lease", async () => {
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "autotrade_acquire_lease" ? 1 : true, error: null }));
  mocks.from.mockImplementation((table: string) => ({
    select: () => table === "autotrade_control" ? { eq: () => ({ maybeSingle: async () => ({ data: { emergency_paused: false }, error: null }) }) } : { in: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) },
    insert: async () => ({ error: null }),
  }));
  mocks.fetch.mockImplementation(async (_url: unknown, init: RequestInit) => {
    const p = JSON.parse(String(init.body));
    return Response.json({ result: p.method === "eth_chainId" ? "0x2a5" : p.method === "eth_blockNumber" ? "0x64" : { hash: `0x${"ab".repeat(32)}`, timestamp: `0x${Math.floor(Date.now()/1000).toString(16)}` } });
  });
  vi.stubGlobal("fetch", mocks.fetch);
  const result = await runWorker("cron");
  expect(result).toMatchObject({ ok: true, blocks: 1, mode: "paper", singleCycle: true });
  expect(mocks.rpc.mock.calls.filter(c => c[0] === "autotrade_heartbeat")).toHaveLength(1);
  expect(mocks.rpc.mock.calls.filter(c => c[0] === "autotrade_release_lease")).toHaveLength(1);
  expect(mocks.from.mock.calls.filter(c => c[0] === "autotrade_managed_pending")).toHaveLength(0);
});