import { describe, expect, it } from "vitest";
import { CONTRACT_ENFORCES_MIN_CLAIM, MAINNET_MIN_CLAIM_FLOW, claimMinimumProgress, leafMeetsClaimMinimum } from "./claimMinimumPolicy";
import { buildDraftAllocation } from "./rewardFundingPlan";

const CANARY = "0x628e237b73C5a37EF3968527563FA1a26b32BB97";
const row = (wallet: string, authoritative: number) => ({ userId: wallet, wallet, classification: "MATCH" as const, authoritative, pendingReview: 0 });

describe("Mainnet claim minimum", () => {
  it("is 1,000 FLOW and not enforced by the contract", () => {
    expect(MAINNET_MIN_CLAIM_FLOW).toBe(1000);
    expect(CONTRACT_ENFORCES_MIN_CLAIM).toBe(false);
  });
  it("progress label", () => {
    expect(claimMinimumProgress(350).label).toBe("350 / 1,000 FLOW toward minimum claim");
    expect(claimMinimumProgress(1000).meetsMinimum).toBe(true);
    expect(claimMinimumProgress(999).meetsMinimum).toBe(false);
  });
  it("canary exception only for kentrosh2002, round 2, exactly 10", () => {
    expect(leafMeetsClaimMinimum(2, CANARY, 10)).toBe(true);
    expect(leafMeetsClaimMinimum(3, CANARY, 10)).toBe(false);
    expect(leafMeetsClaimMinimum(2, CANARY, 11)).toBe(false);
    expect(leafMeetsClaimMinimum(2, "0x0000000000000000000000000000000000000001", 10)).toBe(false);
    expect(leafMeetsClaimMinimum(null, CANARY, 10)).toBe(false);
  });
  it("settlement excludes sub-minimum ordinary leaves", () => {
    const d = buildDraftAllocation([row("0xaa", 999), row("0xbb", 1000), row("0xcc", 100)], { epochId: 3 });
    expect(d.leaves.map((l) => l.account)).toEqual(["0xbb"]);
    expect(buildDraftAllocation([row(CANARY, 10)], { epochId: 3 }).leaves).toEqual([]);
  });
});
