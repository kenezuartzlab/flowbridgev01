import { describe, expect, it } from "vitest";
import { computeRewardProgression, type ProgressionAllocation, type ProgressionInput } from "./rewardProgression";
import { resolveNextBestAction } from "@/lib/growth/nextBestAction";
import { deriveRetentionNotifications, dedupeNotifications } from "@/lib/growth/retentionNotifications";
import { addRouteWatch, applyRouteChecks, watchKey } from "@/lib/growth/routeWatch";
import { answerProgressQuestion, matchProgressQuestion } from "@/lib/ai/rewardProgressAnswers";

const NOW = 1_800_000_000;
const funded = (points: number, programId = "CORE_SWAP") => ({ points, chainId: 677, fundingState: "FUNDED", programId });
const base = (pts: number, extra: Partial<ProgressionInput> = {}): ProgressionInput => ({
  ledger: pts ? [funded(pts)] : [], reconciledPoints: pts, reviewHeldPoints: 0, historicalNonclaimable: 0,
  reconciliationOk: true, storedFlowPoints: pts, walletBound: true, allocations: [], nowSec: NOW, ...extra,
});
const alloc = (o: Partial<ProgressionAllocation> = {}): ProgressionAllocation => ({
  epochId: 3, amountFlow: 1250, walletMatches: true, proofValid: true, onChain: true, claimed: false,
  claimStart: NOW + 86_400, claimEnd: NOW + 31 * 86_400, ...o,
});

describe("V34 1,000 FLOW progression", () => {
  it.each([
    [0, 1000, 0], [100, 900, 10], [999, 1, 99], [1000, 0, 100], [1500, 0, 100],
  ])("%i FLOW → %i remaining, %i%%", (pts, remaining, pct) => {
    const p = computeRewardProgression(base(pts));
    expect(p.remainingToMinimum).toBe(remaining);
    expect(p.percent).toBe(pct);
  });
  it("999 is not settlement eligible; 1,000 is", () => {
    expect(computeRewardProgression(base(999)).lifecycle).not.toBe("ELIGIBLE_FOR_SETTLEMENT");
    expect(computeRewardProgression(base(1000)).lifecycle).toBe("ELIGIBLE_FOR_SETTLEMENT");
  });
  it("eligible but not allocated has no claim button", () => {
    const p = computeRewardProgression(base(1500));
    expect(p.settlementReady).toBe(true);
    expect(p.claimButton).toBe(false);
  });
  it("allocated but window closed shows allocation, no claim", () => {
    const p = computeRewardProgression(base(1250, { allocations: [alloc()] }));
    expect(p.lifecycle).toBe("ALLOCATED_ON_CHAIN");
    expect(p.claimButton).toBe(false);
  });
  it("claimable when window open, wallet and proof valid", () => {
    const p = computeRewardProgression(base(1250, { allocations: [alloc({ claimStart: NOW - 10 })] }));
    expect(p.lifecycle).toBe("CLAIMABLE_NOW");
    expect(p.claimButton).toBe(true);
  });
  it("already claimed", () => {
    const p = computeRewardProgression(base(1250, { allocations: [alloc({ claimStart: NOW - 10, claimed: true })] }));
    expect(p.lifecycle).toBe("CLAIMED");
    expect(p.claimedFlow).toBe(1250);
  });
  it("wrong wallet allocation is ignored", () => {
    const p = computeRewardProgression(base(500, { allocations: [alloc({ walletMatches: false, claimStart: NOW - 10 })] }));
    expect(p.claimButton).toBe(false);
    expect(p.settledFlow).toBe(0);
  });
  it("unfunded points never count", () => {
    const p = computeRewardProgression(base(0, { ledger: [{ points: 1200, chainId: 677, fundingState: "UNFUNDED", programId: "CORE_SWAP" }], reconciledPoints: 1200 }));
    expect(p.eligibleFundedFlow).toBe(0);
    expect(p.pendingUnfunded).toBe(1200);
  });
  it("review-held points block settlement", () => {
    const p = computeRewardProgression(base(1200, { reviewHeldPoints: 50 }));
    expect(p.settlementReady).toBe(false);
    expect(p.lifecycle).not.toBe("ELIGIBLE_FOR_SETTLEMENT");
  });
  it("Testnet-only points never count", () => {
    const p = computeRewardProgression(base(0, { ledger: [{ points: 2000, chainId: 968, fundingState: "FUNDED", programId: "CORE_SWAP" }], reconciledPoints: 0 }));
    expect(p.eligibleFundedFlow).toBe(0);
    expect(p.testnetExcluded).toBe(2000);
  });
  it("historical nonclaimable stored balance never counts", () => {
    const p = computeRewardProgression(base(10, { storedFlowPoints: 314, historicalNonclaimable: 304 }));
    expect(p.eligibleFundedFlow).toBe(10);
    expect(p.earnedPoints).toBe(314);
  });
});

describe("V34 next-best-action", () => {
  const facts = (o = {}) => ({ signedIn: true, emailVerified: true, walletBound: true, progression: computeRewardProgression(base(100)), activeMissionHref: null, confirmedMainnetTrades: 1, eligibleRoutesAvailable: true, liquidityPositions: 0, activeStakes: 0, activeCampaigns: 0, ...o });
  it("signed out explores", () => expect(resolveNextBestAction(facts({ signedIn: false })).id).toBe("EXPLORE"));
  it("unverified email first", () => expect(resolveNextBestAction(facts({ emailVerified: false })).id).toBe("VERIFY_EMAIL"));
  it("unbound wallet", () => expect(resolveNextBestAction(facts({ walletBound: false })).id).toBe("BIND_WALLET"));
  it("low points earns toward minimum", () => expect(resolveNextBestAction(facts()).id).toBe("EARN_TOWARD_MINIMUM"));
  it("claimable wins", () => expect(resolveNextBestAction(facts({ progression: computeRewardProgression(base(1250, { allocations: [alloc({ claimStart: NOW - 1 })] })) })).id).toBe("CLAIM_FLOW"));
  it("never signs", () => expect(resolveNextBestAction(facts()).signsTransaction).toBe(false));
});

describe("V34 notifications", () => {
  it("allocation notice only with valid allocation and dedupes", () => {
    const p = computeRewardProgression(base(1250, { allocations: [alloc()] }));
    const a = deriveRetentionNotifications({ progression: p, nowSec: NOW });
    expect(a.some((n) => n.id === "ALLOCATION_PUBLISHED:3")).toBe(true);
    const none = deriveRetentionNotifications({ progression: computeRewardProgression(base(1250, { allocations: [alloc({ walletMatches: false })] })), nowSec: NOW });
    expect(none.some((n) => n.kind === "ALLOCATION_PUBLISHED")).toBe(false);
    expect(dedupeNotifications([...a, ...a]).length).toBe(a.length);
  });
  it("closing notice within 3 days only", () => {
    const p = computeRewardProgression(base(1250, { allocations: [alloc({ claimStart: NOW - 10, claimEnd: NOW + 2 * 86_400 })] }));
    expect(deriveRetentionNotifications({ progression: p, nowSec: NOW }).some((n) => n.kind === "CLAIM_WINDOW_CLOSING")).toBe(true);
  });
  it("route watch is opt-in and fires once when it becomes available", () => {
    expect(applyRouteChecks([], { x: true }, 1).became).toHaveLength(0);
    const list = addRouteWatch([], { from: "flow", to: "bot", chainId: 677 });
    const k = watchKey(list[0]);
    const first = applyRouteChecks(list, { [k]: true }, 1);
    expect(first.became).toHaveLength(1);
    expect(applyRouteChecks(first.next, { [k]: true }, 2).became).toHaveLength(0);
  });
});

describe("V34 AI personal context", () => {
  it("matches questions", () => {
    expect(matchProgressQuestion("How much more until I can claim?")).toBe("REMAINING");
    expect(matchProgressQuestion("Am I included in a payout round?")).toBe("ROUND");
  });
  it("never intercepts ordinary trading questions", () => {
    expect(matchProgressQuestion("Is a route available to swap 100 BOT to USDT?")).toBeNull();
    expect(matchProgressQuestion("What's the next step to bridge my USDT?")).toBeNull();
    expect(matchProgressQuestion("What is my remaining balance?")).toBeNull();
    expect(matchProgressQuestion("Which route is available for CA to BOT?")).toBeNull();
    expect(matchProgressQuestion("How much more BOT do I need for the swap?")).toBeNull();
  });
  it("signed-out callers get no account data", () => {
    const a = answerProgressQuestion("REMAINING", { signedIn: false, progression: computeRewardProgression(base(999)), next: null });
    expect(a).not.toMatch(/999/);
  });
  it("answers from the caller's own progression", () => {
    expect(answerProgressQuestion("REMAINING", { signedIn: true, progression: computeRewardProgression(base(425)), next: null })).toMatch(/575 FLOW remaining/);
  });
});
