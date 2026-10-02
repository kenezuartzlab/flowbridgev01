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
});
