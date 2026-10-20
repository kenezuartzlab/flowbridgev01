import { describe, expect, it } from "vitest";
import { routerHealthWarning, type RouterV4Health } from "./routerV4Health";

describe("Router V4 health warnings", () => {
  it("stays quiet when every read matches", () => expect(routerHealthWarning({ ok: true, checkedAt: 1, checks: [] }, false)).toBeNull());
  it("names drift without proposing a mutation", () => {
    const health: RouterV4Health = { ok: false, checkedAt: 1, checks: [{ key: "owner", ok: false, detail: "Router owner" }] };
    expect(routerHealthWarning(health, false)).toContain("Router owner");
    expect(routerHealthWarning(health, false)).toContain("no contract change was attempted");
  });
  it("fails closed when reads fail", () => expect(routerHealthWarning(null, true)).toContain("Atomic V4 routes are paused"));
  it("names expected and on-chain treasury and fee", () => {
    const health: RouterV4Health = { ok: false, checkedAt: 1, checks: [
      { key: "global_fee", ok: false, detail: "Global fee (verified 0 bp, on-chain 10 bp)" },
      { key: "treasury", ok: false, detail: "Fee treasury (verified 0xefc1…9ea4, on-chain 0xabe9…75e1)" },
    ] };
    const w = routerHealthWarning(health, false)!;
    expect(w).toContain("on-chain 10 bp");
    expect(w).toContain("on-chain 0xabe9…75e1");
    expect(w).toContain("Nothing was submitted");
  });
});
