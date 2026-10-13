import { describe, expect, it } from "vitest";
import { emptyLaunchTracker, launchTrackerSchema, launchEvidenceSchema } from "./launchTracker";

describe("Owner-gated pre-Day-0 launch preparation", () => {
  it("official launch date is not started", () => expect(emptyLaunchTracker().officialLaunchDate).toBeNull());
  it("30-day social window is not started", () => expect(emptyLaunchTracker().socialWindowStartedAt).toBeNull());
  it("8-day interaction window is not started", () => expect(emptyLaunchTracker().interactionWindowStartedAt).toBeNull());
  it("cannot start or backdate the launch through the preparation endpoint", () => expect(launchTrackerSchema.safeParse({ ...emptyLaunchTracker(), officialLaunchDate: "2026-10-13T12:51:00Z" }).success).toBe(false));
  it("cannot start the social window through evidence capture", () => expect(launchTrackerSchema.safeParse({ ...emptyLaunchTracker(), socialWindowStartedAt: "2026-10-13T12:51:00Z" }).success).toBe(false));
  it("cannot start the interaction window through evidence capture", () => expect(launchTrackerSchema.safeParse({ ...emptyLaunchTracker(), interactionWindowStartedAt: "2026-10-13T12:51:00Z" }).success).toBe(false));
  it("does not manufacture genuine evidence", () => expect(emptyLaunchTracker().evidence).toEqual([]));
  it("cannot mark Day 8 qualified", () => expect(launchTrackerSchema.safeParse({ ...emptyLaunchTracker(), day8Status: "PASS" }).success).toBe(false));
  it("cannot mark Day 30 qualified", () => expect(launchTrackerSchema.safeParse({ ...emptyLaunchTracker(), day30Status: "PASS" }).success).toBe(false));
  it("rejects invented eligibility and metric fields", () => expect(launchTrackerSchema.safeParse({ ...emptyLaunchTracker(), qualifyingUsers: 100 }).success).toBe(false));
  it("rejects arbitrary screenshot paths", () => expect(launchEvidenceSchema.safeParse({ id: "cedfecc1-bd65-4873-97e5-989fe5a32060", kind: "screenshot", url: "", timestamp: "", wallet: "", transactionHash: "", coreFunction: "Other", notes: "Owner evidence", screenshot: "master-refresh/private.pdf" }).success).toBe(false));
});