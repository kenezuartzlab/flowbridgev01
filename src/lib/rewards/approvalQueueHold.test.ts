import { describe, it, expect } from "vitest";
import { buildApprovalQueue } from "./approvalQueue";
import { SETTLEMENT_SIGNER } from "./settlementPlanner";
import { isPublisherRecipient } from "./approvalQueue.server";

const row = (userId: string, openProposal: boolean) => ({ userId, wallet: "0xabc", fundedPoints: 100, authoritative: 100, alreadySettledPoints: 0, pendingReview: 0, classification: "MATCH", openProposal });

describe("approval confirmation eligibility", () => {
  it("an account with its own open approval is excluded unless that approval is ignored", () => {
    expect(buildApprovalQueue([row("u1", true)]).candidates).toHaveLength(0);
    expect(buildApprovalQueue([row("u1", false)]).candidates[0].availablePoints).toBe(100);
  });
  it("holds the publisher wallet as a recipient", () => {
    expect(isPublisherRecipient(SETTLEMENT_SIGNER.address.toUpperCase().replace("0X", "0x"))).toBe(true);
    expect(isPublisherRecipient("0x7668d95e071442ca64e3463458c60a3d5ef1a382")).toBe(false);
  });
});
