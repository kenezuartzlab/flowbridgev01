import { describe, expect, it } from "vitest";
import { prepareSettlementBatch, SETTLEMENT_AUTOMATION } from "./settlementPlanner";

const DIST = "0x7b805B036B22E2B71Ef5E8f7EA21D8791819b922" as const;
const W = 10n ** 18n;
const w = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const chain = { epochCount: 2, campaignBudgetWei: 1_005_001n * W, totalClaimedWei: 1n * W, totalReservedWei: 10n * W, balanceWei: 2_499_999n * W, minPublishDelay: 86_400, paused: false, nowSec: 1_800_000_000 };
const r = (i: number, pts: number, prior = 0, cls = "MATCH") => ({ userId: `u${i}`, wallet: w(i), classification: cls, authoritative: pts, pendingReview: 0, alreadyAllocatedPoints: prior });
const run = (rows: ReturnType<typeof r>[], o: Partial<typeof chain> = {}, funded = 3_000) =>
  prepareSettlementBatch({ rows, fundedPointsAvailable: funded, chain: { ...chain, ...o }, chainId: 677, distributor: DIST });

describe("settlement planner", () => {
  it("prepares unsigned round #3 with delta + minimum", () => {
    const s = run([r(1, 1500), r(2, 999), r(3, 2500, 1000), r(4, 5000, 0, "REVIEWED_NONCLAIMABLE_HISTORICAL")]);
    expect(s.status).toBe("READY_FOR_PUBLISHER_REVIEW");
    expect(s.epochId).toBe(3);
    expect(s.batch!.leaves.map((l) => BigInt(l.amount) / W)).toEqual([1500n, 1500n]);
    expect(s.tx!.data.startsWith("0x")).toBe(true);
    expect(s.tx!.signed).toBe(false);
    expect(s.claimStart - chain.nowSec).toBeGreaterThan(86_400);
  });
  it("blocks when over funded bucket, budget, paused or out of sync", () => {
    expect(run([r(1, 3500)]).status).toBe("BLOCKED");
    expect(run([r(1, 1500)], { campaignBudgetWei: 1000n * W }).status).toBe("BLOCKED");
    expect(run([r(1, 1500)], { paused: true }).status).toBe("BLOCKED");
    expect(run([r(1, 1500)], { epochCount: 3 }).status).toBe("BLOCKED");
  });
  it("canary exception never applies to new rounds; empty batch blocks", () => {
    const s = run([{ ...r(9, 10), wallet: "0x628e237b73C5a37EF3968527563FA1a26b32BB97" }]);
    expect(s.status).toBe("BLOCKED");
    expect(s.tx).toBeNull();
  });
  it("duplicate accounts block", () => expect(run([r(1, 1500), r(1, 1500)]).status).toBe("BLOCKED"));
  it("automation is prepare-only", () => expect(SETTLEMENT_AUTOMATION).toMatchObject({ autonomousSigning: false, newPublisherGrants: false, publicClaimsUnlocked: false }));
});

import { SETTLEMENT_SIGNER } from "./settlementPlanner";
describe("single signer", () => {
  it("one designated publisher, app never signs", () => {
    expect(SETTLEMENT_SIGNER.mode).toBe("SINGLE_SIGNER");
    expect(SETTLEMENT_SIGNER.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(SETTLEMENT_AUTOMATION.autonomousSigning).toBe(false);
  });
});
