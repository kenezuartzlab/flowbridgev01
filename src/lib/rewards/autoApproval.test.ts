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
  it("enforces the per-wallet daily cap and requires all programs enabled", () => {
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
