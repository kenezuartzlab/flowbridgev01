import { describe, expect, it } from "vitest";

import { buildClaimHandoffSearch, parseClaimHandoffCorrelation } from "./claimHandoff";

describe("V17.1C claim handoff correlation", () => {
  it("round-trips the opaque correlation without economics", () => {
    const search = buildClaimHandoffSearch({
      missionId: "m1",
      stepId: "prepare-claim",
      intentId: "i1",
    });
    expect(Object.values(search).join(" ")).not.toMatch(/\d+\.\d+|0x[0-9a-f]{40}/);
    const parsed = parseClaimHandoffCorrelation(
      `?${new URLSearchParams(search as Record<string, string>).toString()}`,
    );
    expect(parsed).toEqual({ missionId: "m1", stepId: "prepare-claim", intentId: "i1" });
  });

  it("returns null when the link carries no correlation", () => {
    expect(parseClaimHandoffCorrelation("?foo=bar")).toBeNull();
  });
});
