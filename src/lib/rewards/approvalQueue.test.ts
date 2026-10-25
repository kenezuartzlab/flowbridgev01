import { describe, expect, it } from "vitest";
import {
  approvalEvidence, buildApprovalQueue, payoutApprovalDecision, proposedAmountValid,
  type ApprovalAccountRow, type ApprovalLike,
} from "./approvalQueue";

const row = (o: Partial<ApprovalAccountRow>): ApprovalAccountRow => ({
  userId: "u1", wallet: "0x" + "1".repeat(40), fundedPoints: 0, authoritative: 0,
  alreadySettledPoints: 0, pendingReview: 0, classification: "MATCH", openProposal: false, ...o,
});
const SUPER = { userId: "admin-2", role: "super_admin" as const };
const OP = { userId: "admin-1", role: "internal_operator" as const };
const approval = (o: Partial<ApprovalLike> = {}): ApprovalLike => ({
  status: "PROPOSED", proposed_by: OP.userId, user_id: "u1", points: 25,
  wallet: "0x" + "1".repeat(40), evidence_hash: "h", ...o,
});

describe("V37 approval queue", () => {
  it("small amounts (25 / 100 / 250) are all eligible", () => {
    const { candidates } = buildApprovalQueue([25, 100, 250].map((n, i) => row({ userId: `u${i}`, fundedPoints: n, authoritative: n })));
    expect(candidates.map((c) => c.availablePoints)).toEqual([25, 100, 250]);
  });
  it("zero available is never proposed", () => {
    const { candidates, excluded } = buildApprovalQueue([row({ fundedPoints: 0 })]);
    expect(candidates).toHaveLength(0);
    expect(excluded[0].reason).toBe("NOTHING_AVAILABLE");
  });
  it("repeated payout cycle: settled points never re-enter the delta", () => {
    const { candidates } = buildApprovalQueue([row({ fundedPoints: 1500, authoritative: 1500, alreadySettledPoints: 1500 })]);
    expect(candidates).toHaveLength(0);
    const again = buildApprovalQueue([row({ fundedPoints: 1500, authoritative: 1500, alreadySettledPoints: 1122 })]);
    expect(again.candidates[0].availablePoints).toBe(378);
  });
  it("partial payout: proposal may cover less than available, never more", () => {
    expect(proposedAmountValid(250, 100)).toBe(true);
    expect(proposedAmountValid(250, 250)).toBe(true);
    expect(proposedAmountValid(250, 251)).toBe(false);
    expect(proposedAmountValid(250, 0)).toBe(false);
  });
  it("held, unreconciled, unbound and already-proposed accounts are excluded", () => {
    const { candidates, excluded } = buildApprovalQueue([
      row({ userId: "held", pendingReview: 5, fundedPoints: 100, authoritative: 100 }),
      row({ userId: "bad", classification: "REVIEWED_NONCLAIMABLE_HISTORICAL", fundedPoints: 100, authoritative: 100 }),
      row({ userId: "nowallet", wallet: null, fundedPoints: 100, authoritative: 100 }),
      row({ userId: "open", openProposal: true, fundedPoints: 100, authoritative: 100 }),
    ]);
    expect(candidates).toHaveLength(0);
    expect(excluded.map((e) => e.reason).sort()).toEqual(["ALREADY_PROPOSED", "NOT_RECONCILED", "NO_WALLET", "UNDER_REVIEW"]);
  });
  it("funded exceeding authoritative is capped at the reconciled amount", () => {
    const { candidates } = buildApprovalQueue([row({ fundedPoints: 500, authoritative: 300 })]);
    expect(candidates[0].availablePoints).toBe(300);
  });
  it("duplicate account rows never produce two candidates", () => {
    const { candidates } = buildApprovalQueue([row({ fundedPoints: 100, authoritative: 100 }), row({ fundedPoints: 100, authoritative: 100 })]);
    expect(candidates).toHaveLength(1);
  });
});

describe("V37 approval decisions", () => {
  it("proposer cannot approve their own proposal; a different super admin can", () => {
    expect(payoutApprovalDecision(approval(), OP, "approve")).toMatchObject({ ok: false });
    expect(payoutApprovalDecision(approval({ proposed_by: "someone-else" }), OP, "approve")).toMatchObject({ ok: false, reason: expect.stringMatching(/super admin/) });
    expect(payoutApprovalDecision(approval(), SUPER, "approve")).toEqual({ ok: true });
  });
  it("confirm requires APPROVED and a super admin", () => {
    expect(payoutApprovalDecision(approval(), SUPER, "confirm")).toMatchObject({ ok: false });
    expect(payoutApprovalDecision(approval({ status: "APPROVED" }), SUPER, "confirm")).toEqual({ ok: true });
    expect(payoutApprovalDecision(approval({ status: "APPROVED" }), OP, "confirm")).toMatchObject({ ok: false });
  });
  it("decided proposals cannot be re-decided", () => {
    expect(payoutApprovalDecision(approval({ status: "REJECTED" }), SUPER, "approve")).toMatchObject({ ok: false });
    expect(payoutApprovalDecision(approval({ status: "CONFIRMED" }), SUPER, "confirm")).toMatchObject({ ok: false });
  });
  it("evidence records the exact delta facts", () => {
    const c = buildApprovalQueue([row({ fundedPoints: 250, authoritative: 250, alreadySettledPoints: 100 })]).candidates[0];
    expect(approvalEvidence(c, 150)).toMatchObject({ proposedPoints: 150, availablePoints: 150, fundedPoints: 250, alreadySettledPoints: 100 });
  });
});
