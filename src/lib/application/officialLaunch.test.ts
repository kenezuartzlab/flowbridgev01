import { describe, expect, it } from "vitest";
import { OFFICIAL_LAUNCH_AT, INTERACTION_WINDOW_ENDS_AT, SOCIAL_WINDOW_ENDS_AT, windowStatus } from "./officialLaunch";

describe("Official launch Day 0", () => {
  it("is not backdated before the owner's start instruction (2026-10-13 14:13 UTC)", () =>
    expect(Date.parse(OFFICIAL_LAUNCH_AT)).toBeGreaterThanOrEqual(Date.parse("2026-10-13T14:13:00Z")));
  it("interaction window is 8 days", () => expect(Date.parse(INTERACTION_WINDOW_ENDS_AT) - Date.parse(OFFICIAL_LAUNCH_AT)).toBe(8 * 86_400_000));
  it("social window is 30 days", () => expect(Date.parse(SOCIAL_WINDOW_ENDS_AT) - Date.parse(OFFICIAL_LAUNCH_AT)).toBe(30 * 86_400_000));
  it("never reports qualification, only review after close", () =>
    expect(windowStatus(INTERACTION_WINDOW_ENDS_AT, Date.parse(INTERACTION_WINDOW_ENDS_AT) + 1)).toBe("WINDOW CLOSED — AWAITING REVIEW"));
});
