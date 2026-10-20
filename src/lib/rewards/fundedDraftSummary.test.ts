import { describe, expect, it } from "vitest";
import { summarizeFundedDraft } from "./rewardFundingPlan";

describe("summarizeFundedDraft", () => {
  it("keeps the funded-only total and reports the unfunded difference", () => {
    // Owner rule: the stored Round #3 batch is 1,122 FLOW; the reconciliation
    // figure of 1,196 includes 74 earned-but-unfunded points.
    const d = summarizeFundedDraft({ reconTotalPoints: 1196, fundedWallets: 1, fundedTotalPoints: 1122 });
    expect(d.totalPoints).toBe(1122);
    expect(d.leaves).toBe(1);
    expect(d.excludedUnfundedPoints).toBe(74);
    expect(d.status).toBe("DRAFT_NOT_PUBLISHED");
  });

  it("reports zero excluded when funded matches reconciliation", () => {
    const d = summarizeFundedDraft({ reconTotalPoints: 1122, fundedWallets: 1, fundedTotalPoints: 1122 });
    expect(d.excludedUnfundedPoints).toBe(0);
  });

  it("never reports a negative exclusion or negative totals", () => {
    const d = summarizeFundedDraft({ reconTotalPoints: 1000, fundedWallets: 1, fundedTotalPoints: 1122 });
    expect(d.excludedUnfundedPoints).toBe(0);
    const empty = summarizeFundedDraft({ reconTotalPoints: 0, fundedWallets: 0, fundedTotalPoints: 0 });
    expect(empty.totalPoints).toBe(0);
    expect(empty.leaves).toBe(0);
  });
});
