import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ token: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getIdToken: auth.token }));
import { readOpsJson } from "./opsRead";
beforeEach(() => { vi.useFakeTimers(); auth.token.mockReset(); auth.token.mockResolvedValue("test-session"); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("bounded authorized Ops reads", () => {
  it("bounds the read-only payout queue POST, including stalled session checks", async () => {
    const fetcher = vi.fn().mockImplementation(() => new Promise(() => {})); vi.stubGlobal("fetch", fetcher);
    const assertion = expect(readOpsJson("/api/admin/rewards-control", "bound", 20_000, "payout-queue")).rejects.toThrow("too long");
    await vi.advanceTimersByTimeAsync(20_000); await assertion;
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ action: "payout-queue" }));
    expect(fetcher.mock.calls[0]?.[1]?.signal.aborted).toBe(true);
  });
  it("does not send a signed-out read", async () => {
    auth.token.mockResolvedValue(null); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(readOpsJson("/api/admin/ops", "bound")).rejects.toThrow("Sign in");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not send without the connected wallet", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(readOpsJson("/api/admin/ops")).rejects.toThrow("Connect the wallet");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("bounds stalled session initialization and never sends after expiry", async () => {
    let resolve: (token: string) => void = () => {};
    auth.token.mockReturnValue(new Promise<string>(r => { resolve = r; }));
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const assertion = expect(readOpsJson("/api/admin/ops", "bound")).rejects.toThrow("too long");
    await vi.advanceTimersByTimeAsync(20_000); await assertion;
    resolve("test-session"); await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("bounds stalled API reads and aborts without automatically retrying", async () => {
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn((_path: string, init: RequestInit) => { signal = init.signal ?? undefined; return new Promise(() => {}); }); vi.stubGlobal("fetch", fetcher);
    const assertion = expect(readOpsJson("/api/admin/rewards-control", "bound")).rejects.toThrow("too long");
    await vi.advanceTimersByTimeAsync(20_000); await assertion;
    expect(fetcher).toHaveBeenCalledTimes(1); expect(signal?.aborted).toBe(true);
  });
  it("retains server denial and permits a fresh explicit retry", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ viewer: { role: "internal_operator" } })));
    vi.stubGlobal("fetch", fetcher);
    await expect(readOpsJson("/api/admin/rewards-control", "bound")).rejects.toThrow("Forbidden");
    await expect(readOpsJson("/api/admin/rewards-control", "bound")).resolves.toEqual({ viewer: { role: "internal_operator" } });
    expect(fetcher.mock.calls[1]?.[1]?.headers).toEqual({ authorization: "Bearer test-session", "x-wallet-address": "bound" });
  });
});