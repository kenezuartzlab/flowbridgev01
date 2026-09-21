import { describe, expect, it } from "vitest";
import {
  initialReceipts,
  isRetryable,
  newClientBatchId,
  nextSignableIndex,
  queueLabel,
  sessionStatus,
} from "./session";
import { buildMultiSendPlan } from "./planner";
import type { Address, SourceReceipt } from "./types";

const A = "0x1111111111111111111111111111111111111111" as Address;
const B = "0x2222222222222222222222222222222222222222" as Address;
const C = "0x3333333333333333333333333333333333333333" as Address;
const D = "0x4444444444444444444444444444444444444444" as Address;

const plan = buildMultiSendPlan({
  mode: "many-to-one",
  clientBatchId: `0x${"11".repeat(32)}` as `0x${string}`,
  rows: [
    { id: "1", source: A, recipient: D, amount: 6n },
    { id: "2", source: B, recipient: D, amount: 3n },
    { id: "3", source: C, recipient: D, amount: 1n },
  ],
  feeBps: 1,
  maxRecipientsPerSource: 100,
});

describe("MultiSend session queue", () => {
  it("creates a unique 32-byte batch id", () => {
    const id = newClientBatchId();
    expect(id).toMatch(/^0x[0-9a-f]{64}$/);
    expect(id).not.toBe(newClientBatchId());
  });

  it("starts one queue entry per source wallet", () => {
    const receipts = initialReceipts(plan);
    expect(receipts).toHaveLength(3);
    expect(sessionStatus(receipts)).toBe("ready");
    expect(nextSignableIndex(receipts)).toBe(0);
    expect(queueLabel(receipts, 0)).toContain("1 of 3");
    expect(queueLabel(receipts, 0)).toContain("Ready to sign");
    expect(queueLabel(receipts, 1)).toContain("Waiting");
  });

  it("keeps confirmed sources when a later wallet is cancelled", () => {
    const receipts = initialReceipts(plan);
    receipts[0] = { ...receipts[0], status: "confirmed", txHash: "0xaaa" };
    receipts[1] = { ...receipts[1], status: "cancelled" };
    expect(sessionStatus(receipts)).toBe("partially-completed");
    expect(receipts[0].txHash).toBe("0xaaa");
  });

  it("only retries failed, cancelled or unsubmitted sources", () => {
    const confirmed: SourceReceipt = { ...initialReceipts(plan)[0], status: "confirmed" };
    expect(isRetryable(confirmed)).toBe(false);
    expect(isRetryable({ ...confirmed, status: "failed" })).toBe(true);
    expect(isRetryable({ ...confirmed, status: "cancelled" })).toBe(true);
    expect(isRetryable({ ...confirmed, status: "submitted" })).toBe(false);
  });

  it("reports completed, in-progress and failed sessions", () => {
    const all = initialReceipts(plan);
    expect(sessionStatus(all.map((r) => ({ ...r, status: "confirmed" as const })))).toBe("completed");
    expect(sessionStatus(all.map((r) => ({ ...r, status: "failed" as const })))).toBe("failed");
    expect(sessionStatus(all.map((r) => ({ ...r, status: "cancelled" as const })))).toBe("cancelled");
    const mixed = initialReceipts(plan);
    mixed[0] = { ...mixed[0], status: "submitted" };
    expect(sessionStatus(mixed)).toBe("in-progress");
  });

  it("resumes at the first source that still needs a signature", () => {
    const receipts = initialReceipts(plan);
    receipts[0] = { ...receipts[0], status: "confirmed" };
    receipts[1] = { ...receipts[1], status: "failed" };
    expect(nextSignableIndex(receipts)).toBe(1);
    receipts[1] = { ...receipts[1], status: "confirmed" };
    receipts[2] = { ...receipts[2], status: "confirmed" };
    expect(nextSignableIndex(receipts)).toBeNull();
  });
});
