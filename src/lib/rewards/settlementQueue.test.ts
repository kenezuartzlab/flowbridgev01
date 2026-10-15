import { describe, expect, it } from "vitest";
import { buildSettlementQueue, canTransition, PUBLISHER_CONFIG } from "./settlementQueue";

const c = (id: string, pts: number, wallet: string | null = `0x${id.padStart(40, "0")}`, o = {}) =>
  ({ userId: id, wallet, eligibleFundedUnallocated: pts, underReview: false, alreadyQueuedEpoch: null, ...o });

describe("settlement queue", () => {
  it("queues only wallets at >= 1,000 funded eligible points", () => {
    const q = buildSettlementQueue([c("a", 1000), c("b", 999)]);
    expect(q.queued.map((x) => x.userId)).toEqual(["a"]);
    expect(q.skipped).toContainEqual({ userId: "b", reason: "BELOW_MINIMUM" });
  });
  it("is idempotent and never double-queues", () => {
    const q = buildSettlementQueue([c("a", 1500, undefined, { alreadyQueuedEpoch: 3 })]);
    expect(q.queued).toHaveLength(0);
  });
  it("quarantines duplicate wallets and reviews without blocking others", () => {
    const q = buildSettlementQueue([c("a", 1200, "0x1"), c("b", 1200, "0x1"), c("d", 1200, undefined, { underReview: true }), c("e", 1300)]);
    expect(q.queued.map((x) => x.userId)).toEqual(["e"]);
    expect(q.quarantined).toHaveLength(3);
  });
  it("trips circuit breaker on epoch cap", () => {
    expect(buildSettlementQueue([c("a", PUBLISHER_CONFIG.maxFlowPerEpoch + 1)]).circuitBreaker).toBe("EPOCH_CAP_EXCEEDED");
  });
  it("state machine forbids skipping publication", () => {
    expect(canTransition("QUEUED", "OPEN")).toBe(false);
    expect(canTransition("CLAIMED", "QUEUED")).toBe(false);
    expect(canTransition("PUBLISHING", "PUBLISHED")).toBe(true);
  });
  it("autonomous signing stays off", () => expect(PUBLISHER_CONFIG.autonomousSigning).toBe(false));
});
