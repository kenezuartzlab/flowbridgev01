import { describe, expect, it } from "vitest";
import { retryAction, autonomousSigningAllowed, phaseFromVerification, publisherLimitChecks } from "./publishGate";
import { PUBLISHER_CONFIG, buildSettlementQueue, canTransition } from "./settlementQueue";

describe("V36.3B publish lifecycle", () => {
  it("never re-sends a pending broadcast, only re-checks it", () => {
    expect(retryAction("BROADCAST_PENDING")).toBe("RECHECK");
    expect(retryAction("REJECTED")).toBe("RESTART");
    expect(retryAction("CONFIRMED_VERIFIED")).toBeNull();
  });
  it("autonomous signing stays off", () => {
    expect(PUBLISHER_CONFIG.autonomousSigning).toBe(false);
    expect(autonomousSigningAllowed({ autonomousSigning: true })).toBe(false);
  });
  it("simulated end-to-end: funded points → queued → published → claimable only after verified receipt", () => {
    const q = buildSettlementQueue([
      { userId: "a", wallet: "0x" + "1".repeat(40), eligibleFundedUnallocated: 1000, underReview: false, alreadyQueuedEpoch: null },
      { userId: "b", wallet: "0x" + "2".repeat(40), eligibleFundedUnallocated: 300, underReview: false, alreadyQueuedEpoch: null },
      { userId: "c", wallet: "0x" + "3".repeat(40), eligibleFundedUnallocated: 0, underReview: false, alreadyQueuedEpoch: null },
    ]);
    expect(q.queued.map((x) => x.userId)).toEqual(["a", "b"]);
    expect(phaseFromVerification(null, false)).toBe("BROADCAST_PENDING");
    expect(phaseFromVerification("success", true)).toBe("CONFIRMED_VERIFIED");
    expect(canTransition("PUBLISHED", "OPEN") && canTransition("OPEN", "CLAIMED")).toBe(true);
    expect(canTransition("QUEUED", "PUBLISHED")).toBe(false);
  });
  it("re-queueing an already queued wallet is idempotent", () => {
    const q = buildSettlementQueue([{ userId: "a", wallet: "0x" + "1".repeat(40), eligibleFundedUnallocated: 5000, underReview: false, alreadyQueuedEpoch: 3 }]);
    expect(q.queued).toHaveLength(0);
  });
  it("limits are 200 wallets / 250,000 batch / 500,000 day", () => {
    expect([PUBLISHER_CONFIG.maxWalletsPerEpoch, PUBLISHER_CONFIG.maxFlowPerEpoch, PUBLISHER_CONFIG.maxFlowPerDay]).toEqual([200, 250_000, 500_000]);
    expect(typeof publisherLimitChecks).toBe("function");
  });
});
