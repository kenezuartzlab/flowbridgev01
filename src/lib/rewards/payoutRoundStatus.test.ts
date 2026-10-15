import { describe, it, expect } from "vitest";
import { payoutRoundStatus } from "./payoutRoundStatus";
const b = { epochId: 3, publishedOnChain: true, claimStart: 100, claimEnd: 200, leaves: 2, claimedLeaves: 0, nowSec: 150 };
describe("payout round status", () => {
  it("draft is prepared", () => expect(payoutRoundStatus({ ...b, draftOnly: true })).toBe("PREPARED"));
  it("not on chain awaits signature", () => expect(payoutRoundStatus({ ...b, publishedOnChain: false })).toBe("AWAITING_SIGNATURE"));
  it("before window is published", () => expect(payoutRoundStatus({ ...b, nowSec: 50 })).toBe("PUBLISHED"));
  it("inside window is open", () => expect(payoutRoundStatus(b)).toBe("CLAIM_OPEN"));
  it("after window is expired", () => expect(payoutRoundStatus({ ...b, nowSec: 201 })).toBe("EXPIRED"));
  it("all leaves claimed", () => expect(payoutRoundStatus({ ...b, claimedLeaves: 2 })).toBe("CLAIMED"));
});
