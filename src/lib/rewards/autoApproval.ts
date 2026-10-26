/**
 * V37.1 — automatic payout approval within a super-admin daily budget (pure).
 *
 * Plans which verified, funded, unsettled account balances may be approved
 * automatically. Never signs, publishes or reserves: funded ledger rows already
 * hold their reservations; the atomic DB function re-checks budget and
 * duplicates under a lock. Default config is OFF with a zero budget.
 */
import type { ApprovalCandidate } from "./approvalQueue";
import { BUDGET_PROGRAMS } from "./budgetControls";
import { PUBLISHER_CONFIG } from "./settlementQueue";

export interface AutoApprovalConfig {
  enabled: boolean;
  suspended: boolean;
  acceptanceConfirmed: boolean;
  dailyBudgetFlow: number;
  perWalletDailyCap: number;
  enabledPrograms: string[];
  configuredBy: string | null;
}

export const DEFAULT_AUTO_APPROVAL_CONFIG: AutoApprovalConfig = Object.freeze({
  enabled: false, suspended: false, acceptanceConfirmed: false,
  dailyBudgetFlow: 0, perWalletDailyCap: 0, enabledPrograms: [], configuredBy: null,
}) as AutoApprovalConfig;

export type AutoHoldReason =
  | "AUTOMATION_OFF" | "PROGRAM_NOT_ENABLED" | "PUBLISHER_RECIPIENT_REVIEW" | "BACKING_UNAVAILABLE"
  | "DISTRIBUTOR_PAUSED" | "INSUFFICIENT_BACKING" | "DAILY_BUDGET_EXHAUSTED" | "WALLET_DAILY_CAP" | "BATCH_CAP";

export interface AutoPlanContext {
  usedTodayFlow: number;
  walletUsedToday: Record<string, number>;
  /** Free distributor FLOW minus FLOW already committed to unpublished approvals. Null = RPC failed. */
  freeBackingFlow: number | null;
  paused: boolean | null;
  publisherWallets: string[];
  pendingBatchWallets: number;
  pendingBatchFlow: number;
}

/** Why automation is inactive, or null when it may run. */
export function automationBlocker(c: AutoApprovalConfig): string | null {
  if (c.suspended) return "Emergency suspension is on.";
  if (!c.enabled) return "Automatic approval is off.";
  if (!c.acceptanceConfirmed) return "Acceptance has not been confirmed by a super admin.";
  if (!(c.dailyBudgetFlow > 0)) return "No daily budget is configured.";
  if (!c.configuredBy) return "No authorizing super admin is recorded.";
  return null;
}

/** Validates a config change. Enabling requires a positive budget and confirmed acceptance. */
export function validateAutoConfig(c: AutoApprovalConfig): string | null {
  const int = (n: number) => Number.isInteger(n) && n >= 0;
  if (!int(c.dailyBudgetFlow) || !int(c.perWalletDailyCap)) return "Budgets must be whole, non-negative FLOW amounts.";
  if (c.dailyBudgetFlow > PUBLISHER_CONFIG.maxFlowPerDay) return `Daily budget cannot exceed the ${PUBLISHER_CONFIG.maxFlowPerDay.toLocaleString()} FLOW daily publication cap.`;
  if (c.enabledPrograms.some((p) => !BUDGET_PROGRAMS.includes(p as never))) return "Unknown reward program.";
  if (c.enabled && !(c.dailyBudgetFlow > 0)) return "Set a daily budget before enabling automatic approval.";
  if (c.enabled && !c.acceptanceConfirmed) return "Confirm acceptance before enabling automatic approval.";
  return null;
}

/**
 * Deterministic plan. Account balances combine programs, so every program
 * must be enabled for an account to be auto-approved (conservative).
 */
export function planAutoApprovals(candidates: ApprovalCandidate[], cfg: AutoApprovalConfig, ctx: AutoPlanContext) {
  const approve: { userId: string; wallet: string; points: number; candidate: ApprovalCandidate }[] = [];
  const held: { userId: string; reason: AutoHoldReason; points: number }[] = [];
  const blocker = automationBlocker(cfg);
  const allPrograms = BUDGET_PROGRAMS.every((p) => cfg.enabledPrograms.includes(p));
  const publishers = new Set(ctx.publisherWallets.map((w) => w.toLowerCase()));
  let used = Math.max(0, ctx.usedTodayFlow);
  let backing = ctx.freeBackingFlow;
  let wallets = ctx.pendingBatchWallets;
  let batchFlow = ctx.pendingBatchFlow;
  const walletUsed = new Map(Object.entries(ctx.walletUsedToday).map(([k, v]) => [k.toLowerCase(), v]));
  const sorted = [...candidates].sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
  for (const c of sorted) {
    const pts = Math.floor(c.availablePoints);
    const hold = (reason: AutoHoldReason) => held.push({ userId: c.userId, reason, points: pts });
    if (pts <= 0) continue;
    if (blocker) { hold("AUTOMATION_OFF"); continue; }
    if (!allPrograms) { hold("PROGRAM_NOT_ENABLED"); continue; }
    if (publishers.has(c.wallet.toLowerCase())) { hold("PUBLISHER_RECIPIENT_REVIEW"); continue; }
    if (backing === null || ctx.paused === null) { hold("BACKING_UNAVAILABLE"); continue; }
    if (ctx.paused) { hold("DISTRIBUTOR_PAUSED"); continue; }
    if (pts > backing) { hold("INSUFFICIENT_BACKING"); continue; }
    if (used + pts > cfg.dailyBudgetFlow || used + pts > PUBLISHER_CONFIG.maxFlowPerDay) { hold("DAILY_BUDGET_EXHAUSTED"); continue; }
    const wu = walletUsed.get(c.wallet.toLowerCase()) ?? 0;
    if (cfg.perWalletDailyCap > 0 && wu + pts > cfg.perWalletDailyCap) { hold("WALLET_DAILY_CAP"); continue; }
    if (wallets + 1 > PUBLISHER_CONFIG.maxWalletsPerEpoch || batchFlow + pts > PUBLISHER_CONFIG.maxFlowPerEpoch) { hold("BATCH_CAP"); continue; }
    approve.push({ userId: c.userId, wallet: c.wallet, points: pts, candidate: c });
    used += pts; backing -= pts; wallets += 1; batchFlow += pts;
    walletUsed.set(c.wallet.toLowerCase(), wu + pts);
  }
  return { approve, held, blocker };
}
