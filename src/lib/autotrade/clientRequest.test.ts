import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ token: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getIdToken: auth.token }));
import { callAutoTrade } from "./clientRequest";
beforeEach(() => { vi.useFakeTimers(); auth.token.mockReset(); auth.token.mockResolvedValue("test-session"); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("bounded paper submission", () => {
  it("does not silently wait forever or send a late request after stalled auth", async () => {
    let resolve: (value: string) => void = () => {};
    auth.token.mockReturnValue(new Promise<string>(r => { resolve = r; }));
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const check = expect(callAutoTrade("bound", { action: "create" }, 100)).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(100); await check;
    resolve("test-session"); await vi.advanceTimersByTimeAsync(1); expect(fetcher).not.toHaveBeenCalled();
  });
  it("never retries an ambiguous write automatically", async () => {
    const fetcher = vi.fn(() => new Promise(() => {})); vi.stubGlobal("fetch", fetcher);
    const check = expect(callAutoTrade("bound", { action: "create" }, 100)).rejects.toThrow("may have been saved");
    await vi.advanceTimersByTimeAsync(100); await check; expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("shows expired-session failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 401 })));
    await expect(callAutoTrade("bound", {})).rejects.toThrow("session expired");
  });
  it("retains bound-wallet RBAC errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Connect the wallet bound to this admin account" }), { status: 403 })));
    await expect(callAutoTrade("bound", {})).rejects.toThrow("bound");
  });
  it("reports server storage errors instead of silently refreshing an empty list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "Could not save order" }), { status: 503 })));
    await expect(callAutoTrade("bound", {})).rejects.toThrow("Could not save order");
  });
  it("reads the confirmed id on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, id: "paper-id" }))));
    expect(await callAutoTrade("bound", {})).toEqual({ ok: true, id: "paper-id" });
  });
});