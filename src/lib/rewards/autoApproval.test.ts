import { describe, expect, it } from "vitest";
import { DEFAULT_AUTO_APPROVAL_CONFIG, planAutoApprovals, validateAutoConfig, type AutoApprovalConfig, type AutoPlanContext } from "./autoApproval";

const cand = (id: string, pts: number, wallet = `0x${id.padStart(40, "0")}`) =>
  ({ userId: id, wallet, availablePoints: pts, fundedPoints: pts, alreadySettledPoints: 0 });
const ON: AutoApprovalConfig = { enabled: true, suspended: false, acceptanceConfirmed: true, dailyBudgetFlow: 1000, perWalletDailyCap: 0, enabledPrograms: ["SIGNUP_BONUS", "CORE_SWAP", "REFERRAL_MILESTONE"], configuredBy: "u" };
const CTX: AutoPlanContext = { usedTodayFlow: 0, walletUsedToday: {}, freeBackingFlow: 100_000, paused: false, publisherWallets: [], pendingBatchWallets: 0, pendingBatchFlow: 0 };

describe("automatic approval plan", () => {
  it("defaults OFF with a zero budget and approves nothing", () => {
    expect(DEFAULT_AUTO_APPROVAL_CONFIG.enabled).toBe(false);
    expect(DEFAULT_AUTO_APPROVAL_CONFIG.dailyBudgetFlow).toBe(0);
    const p = planAutoApprovals([cand("a", 25)], DEFAULT_AUTO_APPROVAL_CONFIG, CTX);
    expect(p.approve).toHaveLength(0);
    expect(p.held[0].reason).toBe("AUTOMATION_OFF");
  });
  it("approves small amounts with no 1,000-Point minimum", () => {
    expect(planAutoApprovals([cand("a", 25)], ON, CTX).approve.map((x) => x.points)).toEqual([25]);
  });
  it("stops at daily-budget exhaustion, counting what was already used today", () => {
    const p = planAutoApprovals([cand("a", 600), cand("b", 300), cand("c", 200)], ON, { ...CTX, usedTodayFlow: 100 });
    expect(p.approve.map((x) => x.userId)).toEqual(["a", "b"]);
    expect(p.held).toContainEqual({ userId: "c", reason: "DAILY_BUDGET_EXHAUSTED", points: 200 });
  });
  it("holds when backing is insufficient or unreadable", () => {
    expect(planAutoApprovals([cand("a", 50)], ON, { ...CTX, freeBackingFlow: 10 }).held[0].reason).toBe("INSUFFICIENT_BACKING");
    expect(planAutoApprovals([cand("a", 50)], ON, { ...CTX, freeBackingFlow: null }).held[0].reason).toBe("BACKING_UNAVAILABLE");
    expect(planAutoApprovals([cand("a", 50)], ON, { ...CTX, paused: true }).held[0].reason).toBe("DISTRIBUTOR_PAUSED");
  });
  it("sends publisher-wallet recipients to independent review", () => {
    expect(planAutoApprovals([cand("a", 50, "0xABC")], ON, { ...CTX, publisherWallets: ["0xabc"] }).held[0].reason).toBe("PUBLISHER_RECIPIENT_REVIEW");
  });
  it("enforces the per-wallet daily cap and program gating", () => {
    expect(planAutoApprovals([cand("a", 50)], { ...ON, perWalletDailyCap: 40 }, CTX).held[0].reason).toBe("WALLET_DAILY_CAP");
    expect(planAutoApprovals([cand("a", 50)], { ...ON, enabledPrograms: ["CORE_SWAP"] }, CTX).held[0].reason).toBe("PROGRAM_NOT_ENABLED");
  });
  it("respects the 200-wallet / 250,000-FLOW batch limits", () => {
    expect(planAutoApprovals([cand("a", 5)], ON, { ...CTX, pendingBatchWallets: 200 }).held[0].reason).toBe("BATCH_CAP");
  });
  it("is deterministic for repeated runs", () => {
    const rows = [cand("b", 10), cand("a", 20)];
    expect(planAutoApprovals(rows, ON, CTX).approve).toEqual(planAutoApprovals([...rows].reverse(), ON, CTX).approve);
  });
  it("rejects enabling without budget or acceptance, and budgets above the daily cap", () => {
    expect(validateAutoConfig({ ...ON, dailyBudgetFlow: 0 })).toMatch(/budget/);
    expect(validateAutoConfig({ ...ON, acceptanceConfirmed: false })).toMatch(/acceptance/);
    expect(validateAutoConfig({ ...ON, dailyBudgetFlow: 500_001 })).toMatch(/cap/);
    expect(validateAutoConfig(ON)).toBeNull();
  });
});

describe("V37.1 program separation and round linkage", () => {
  const withProg = (id: string, by: Record<string, number>) => ({ ...cand(id, Object.values(by).reduce((a, b) => a + b, 0)), availableByProgram: by });
  it("approves only enabled programs without blocking others", async () => {
    const p = planAutoApprovals([withProg("a", { CORE_SWAP: 40, SIGNUP_BONUS: 100 })], { ...ON, enabledPrograms: ["SIGNUP_BONUS"] }, CTX);
    expect(p.approve[0].points).toBe(100);
    expect(p.approve[0].programs).toEqual({ SIGNUP_BONUS: 100 });
    expect(p.held).toContainEqual({ userId: "a", reason: "PROGRAM_NOT_ENABLED", points: 40 });
  });
  it("holds ambiguous or unattributed points instead of guessing", () => {
    const p = planAutoApprovals([withProg("a", { OTHER: 30 })], ON, CTX);
    expect(p.approve).toHaveLength(0);
    expect(p.held[0]).toEqual({ userId: "a", reason: "PROGRAM_ATTRIBUTION_UNKNOWN", points: 30 });
    const { availableByProgram, ...bare } = withProg("b", { CORE_SWAP: 5 }); void availableByProgram;
    expect(planAutoApprovals([bare], ON, CTX).held[0].reason).toBe("PROGRAM_ATTRIBUTION_UNKNOWN");
  });
  it("removes settled points from their own program first, so paid rewards never re-enter", async () => {
    const { programAvailability } = await import("./approvalQueue");
    // 100 signup points paid via a linked approval; 40 core swap remain.
    expect(programAvailability({ CORE_SWAP: 40, SIGNUP_BONUS: 100 }, 100, { SIGNUP_BONUS: 100 })).toEqual({ CORE_SWAP: 40 });
    // Historical rounds 1-3 (no breakdown) consume in fixed order.
    expect(programAvailability({ CORE_SWAP: 40, SIGNUP_BONUS: 100 }, 50)).toEqual({ SIGNUP_BONUS: 90 });
    // Fully settled ⇒ nothing.
    expect(programAvailability({ SIGNUP_BONUS: 100 }, 100)).toEqual({});
  });
  it("links a confirmed approval only to a later, verified-published round containing its wallet", async () => {
    const { planApprovalLinks } = await import("./approvalLinkage");
    const W = "0x" + "a".repeat(40), TX = "0x" + "1".repeat(64), wei = (n: number) => (BigInt(n) * 10n ** 18n).toString();
    const ap = [{ id: "ap1", wallet: W, points: 25, confirmedAt: "2026-10-27T00:00:00Z" }];
    const b = (o: Partial<import("./approvalLinkage").LinkBatch>) => ({ id: "b4", epochId: 4, createdAt: "2026-10-27T01:00:00Z", publishedAt: "2026-10-27T02:00:00Z", txHash: TX, leaves: [{ account: W, amount: wei(25) }], ...o });
    expect(planApprovalLinks(ap, [b({})])).toEqual([{ approvalId: "ap1", batchId: "b4", epochId: 4, txHash: TX }]);
    expect(planApprovalLinks(ap, [b({ publishedAt: null })])).toEqual([]); // unpublished / uncertain
    expect(planApprovalLinks(ap, [b({ txHash: null })])).toEqual([]);
    expect(planApprovalLinks(ap, [b({ createdAt: "2026-10-26T00:00:00Z" })])).toEqual([]); // old Round #4 predates approval
    expect(planApprovalLinks(ap, [b({ leaves: [{ account: W, amount: wei(24) }] })])).toEqual([]);
    // Two approvals for the same wallet cannot share one round leaf.
    const two = [...ap, { id: "ap2", wallet: W, points: 25, confirmedAt: "2026-10-27T00:30:00Z" }];
    expect(planApprovalLinks(two, [b({})])).toHaveLength(1);
  });
  it("never reports claimable before the on-chain claim window opens", async () => {
    const { approvalStage } = await import("./approvalLinkage");
    expect(approvalStage({ status: "CONFIRMED", linked: false, claimStartSec: null, claimEndSec: null }, 100)).toBe("AWAITING_PUBLICATION");
    expect(approvalStage({ status: "CONFIRMED", linked: true, claimStartSec: 200, claimEndSec: 900 }, 100)).toBe("PUBLISHED_WAITING_FOR_CLAIM_WINDOW");
    expect(approvalStage({ status: "CONFIRMED", linked: true, claimStartSec: 200, claimEndSec: 900 }, 200)).toBe("CLAIM_WINDOW_OPEN");
  });
});
