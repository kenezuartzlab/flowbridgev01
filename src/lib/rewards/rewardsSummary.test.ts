import { describe, it, expect } from "vitest";
import { computeRewardProgression, type ProgressionAllocation } from "./rewardProgression";
import { buildRewardsSummary } from "./rewardsSummary";

const now = 2_000_000_000;
const MAIN = 677;
function prog(o: { funded?: number; unfunded?: number; stored?: number; allocs?: ProgressionAllocation[]; bound?: boolean; review?: number }) {
  const ledger = [] as any[];
  if (o.funded) ledger.push({ points: o.funded, chainId: MAIN, fundingState: "FUNDED", programId: "CORE_SWAP" });
  if (o.unfunded) ledger.push({ points: o.unfunded, chainId: MAIN, fundingState: "PENDING", programId: "CORE_SWAP" });
  return computeRewardProgression({ ledger, reconciledPoints: o.funded ?? 0, reviewHeldPoints: o.review ?? 0, historicalNonclaimable: 0,
    reconciliationOk: true, storedFlowPoints: o.stored ?? 0, walletBound: o.bound ?? true, allocations: o.allocs ?? [], nowSec: now });
}
const alloc = (x: Partial<ProgressionAllocation>): ProgressionAllocation => ({ epochId: 3, amountFlow: 1200, walletMatches: true, proofValid: true, onChain: true, claimed: false, claimStart: now - 10, claimEnd: now + 1000, ...x });

describe("V36 rewards summary", () => {
  it("1,000 recorded but 0 funded → 0 claimable, not funded", () => {
    const s = buildRewardsSummary({ progression: prog({ unfunded: 1000, stored: 1000 }), nowSec: now });
    expect(s.totalPts).toBe(1000); expect(s.claimableNow).toBe(0); expect(s.blocker).toBe("NOT_FUNDED");
  });
  it("625 pending funding is never claimable or eligible", () => {
    const s = buildRewardsSummary({ progression: prog({ funded: 200, unfunded: 625, stored: 825 }), nowSec: now });
    expect(s.pendingFunding).toBe(625); expect(s.eligibleFundedUnallocated).toBe(200); expect(s.claimableNow).toBe(0);
    expect(s.blocker).toBe("BELOW_MINIMUM"); expect(s.remainingToMinimum).toBe(800);
  });
  it("800 stored points never become a ready banner", () => {
    const s = buildRewardsSummary({ progression: prog({ stored: 800 }), nowSec: now });
    expect(s.claimableNow).toBe(0);
  });
  it("claimed 1 FLOW canary does not re-enter eligible balance", () => {
    const s = buildRewardsSummary({ progression: prog({ funded: 1, stored: 1, allocs: [alloc({ epochId: 2, amountFlow: 1, claimed: true })] }), nowSec: now });
    expect(s.eligibleFundedUnallocated).toBe(0); expect(s.claimedLifetime).toBe(1); expect(s.claimableNow).toBe(0);
  });
  it("open unclaimed published allocation is claimable", () => {
    const s = buildRewardsSummary({ progression: prog({ funded: 1200, allocs: [alloc({})] }), nowSec: now });
    expect(s.claimableNow).toBe(1200); expect(s.blocker).toBe("CLAIM_OPEN");
  });
  it("wrong wallet allocation is not claimable", () => {
    const s = buildRewardsSummary({ progression: prog({ funded: 1200, allocs: [alloc({ walletMatches: false })] }), nowSec: now });
    expect(s.claimableNow).toBe(0);
  });
  it("expired round is not claimable", () => {
    const s = buildRewardsSummary({ progression: prog({ funded: 1200, allocs: [alloc({ claimStart: now - 100, claimEnd: now - 1 })] }), nowSec: now });
    expect(s.claimableNow).toBe(0); expect(s.blocker).toBe("ROUND_EXPIRED");
  });
  it("published but not yet open → awaiting settlement", () => {
    const s = buildRewardsSummary({ progression: prog({ funded: 1200, allocs: [alloc({ claimStart: now + 50 })] }), nowSec: now });
    expect(s.awaitingSettlement).toBe(1200); expect(s.claimableNow).toBe(0); expect(s.blocker).toBe("AWAITING_OPEN");
  });
  it("qualified unpublished → awaiting publication", () => {
    const s = buildRewardsSummary({ progression: prog({ funded: 1000 }), nowSec: now });
    expect(s.blocker).toBe("AWAITING_PUBLICATION"); expect(s.claimableNow).toBe(0);
  });
  it("RPC down → unavailable, never a false 0 balance claim", () => {
    const s = buildRewardsSummary({ progression: prog({ funded: 1200, allocs: [alloc({})] }), chainReadable: false, nowSec: now });
    expect(s.blocker).toBe("CLAIM_OPEN"); // verified allocation still wins
    const s2 = buildRewardsSummary({ progression: null, nowSec: now });
    expect(s2.blocker).toBe("STATE_UNAVAILABLE"); expect(s2.stale).toBe(true);
  });
});
