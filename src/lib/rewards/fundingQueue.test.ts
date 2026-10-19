import { describe, expect, it } from "vitest";
import { approvalDecision, buildFundingQueue, capacityCheck, type QueueLedgerRow } from "./fundingQueue";

const W = "0x" + "a".repeat(40);
const row = (o: Partial<QueueLedgerRow>): QueueLedgerRow => ({
  id: "r1", user_id: "u1", points: 10, reason: "CORE_SWAP_V2", chain_id: 677, funding_state: "UNFUNDED",
  reservation_id: null, program_id: null, policy_version: "FLOW_POINTS_V2", wallet_address: W,
  tx_hash: "0x1", verified_activity_id: "a1", created_at: "2026-10-10", ...o,
});
const wallets = new Map([["u1", W], ["u2", W]]);

describe("funding queue", () => {
  it("queues verified Mainnet swap rows and labels null programs", () => {
    const q = buildFundingQueue([row({})], wallets, new Map());
    expect(q.eligible.CORE_SWAP).toHaveLength(1);
    expect(q.eligible.CORE_SWAP[0].labelFromNull).toBe(true);
  });
  it("keeps reviewed historical accounts excluded", () => {
    const q = buildFundingQueue([row({})], wallets, new Map([["u1", {}]]));
    expect(q.eligible.CORE_SWAP).toBeUndefined();
    expect(q.excluded[0].reason).toBe("REVIEWED_HISTORICAL_ACCOUNT");
  });
  it("excludes wallet mismatch, testnet, already funded and duplicates", () => {
    const q = buildFundingQueue([
      row({ id: "a", wallet_address: "0x" + "b".repeat(40) }),
      row({ id: "b", chain_id: 968, tx_hash: "0x2" }),
      row({ id: "c", funding_state: "FUNDED", tx_hash: "0x3" }),
      row({ id: "d", tx_hash: "0x9", user_id: "u2" }), row({ id: "e", tx_hash: "0x9", user_id: "u2" }),
    ], wallets, new Map());
    expect(q.eligible.CORE_SWAP).toBeUndefined();
    expect(q.excluded.map((e) => e.reason).sort()).toEqual(["DUPLICATE_EVIDENCE", "DUPLICATE_EVIDENCE", "NOT_MAINNET", "WALLET_MISMATCH"]);
  });
});

describe("funding approval", () => {
  const s = { status: "PROPOSED", proposed_by: "op", total_points: 1047, program_id: "CORE_SWAP" };
  it("operators cannot approve", () => expect(approvalDecision(s, { userId: "x", role: "internal_operator" }).ok).toBe(false));
  it("proposer cannot self-approve", () => expect(approvalDecision(s, { userId: "op", role: "super_admin" }).ok).toBe(false));
  it("super admin may approve someone else's proposal once", () => {
    expect(approvalDecision(s, { userId: "boss", role: "super_admin" }).ok).toBe(true);
    expect(approvalDecision({ ...s, status: "CONFIRMED" }, { userId: "boss", role: "super_admin" }).ok).toBe(false);
  });
  it("funding cannot exceed program ceiling or backing", () => {
    expect(capacityCheck({ need: 1047, programRemaining: 999_990, freeBackingFlow: 2_499_989, outstandingReservedPoints: 2300 }).ok).toBe(true);
    expect(capacityCheck({ need: 1047, programRemaining: 1000, freeBackingFlow: 2_499_989, outstandingReservedPoints: 0 }).ok).toBe(false);
    expect(capacityCheck({ need: 1047, programRemaining: 999_990, freeBackingFlow: 3000, outstandingReservedPoints: 2300 }).ok).toBe(false);
    expect(capacityCheck({ need: 1, programRemaining: 10, freeBackingFlow: null, outstandingReservedPoints: 0 }).ok).toBe(false);
  });
});
