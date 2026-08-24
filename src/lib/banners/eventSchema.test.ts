import { describe, expect, it } from "vitest";
import { bannerEventsBodySchema } from "./eventSchema";
import { BANNER_SURFACES } from "@/lib/config/appConfig";

describe("banner analytics payload contract (V30 §9)", () => {
  it("accepts every real banner surface", () => {
    for (const surface of BANNER_SURFACES) {
      const parsed = bannerEventsBodySchema.safeParse({
        events: [{ surface, slideId: "slide-1", kind: "impression" }],
      });
      expect(parsed.success, `surface ${surface} must be accepted`).toBe(true);
    }
  });

  it("rejects unknown surfaces and empty batches", () => {
    expect(
      bannerEventsBodySchema.safeParse({
        events: [{ surface: "not-a-surface", slideId: "s", kind: "click" }],
      }).success,
    ).toBe(false);
    expect(bannerEventsBodySchema.safeParse({ events: [] }).success).toBe(false);
  });

  it("carries no identity or economic fields", () => {
    const parsed = bannerEventsBodySchema.parse({
      events: [{ surface: "home", slideId: "home-1", kind: "click" }],
    });
    expect(Object.keys(parsed.events[0]!).sort()).toEqual(["kind", "slideId", "surface"]);
  });
});
