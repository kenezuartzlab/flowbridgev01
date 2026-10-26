/**
 * V37.1 — automatic approval within a super-admin daily budget (server).
 * Approvals are written only through the locked auto_approve_payout RPC, which
 * re-checks config, daily budget, per-wallet cap and duplicates atomically.
 * Never reserves new funding, signs, broadcasts or publishes.
 */
import type { AdminContext } from "@/lib/admin/adminGate.server";
import { automationBlocker, planAutoApprovals, validateAutoConfig, type AutoApprovalConfig } from "./autoApproval";
import { approvalEvidence } from "./approvalQueue";
import { SETTLEMENT_SIGNER } from "./settlementPlanner";

async function db() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin; }
async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const dayStart = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.toISOString(); };

export async function readAutoConfig(): Promise<AutoApprovalConfig & { updatedAt: string | null; updatedByEmail: string | null }> {
  const { data, error } = await (await db()).from("reward_auto_approval_config").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error("automation config unavailable");
  const r = (data ?? {}) as Record<string, any>;
  return {
    enabled: !!r.enabled, suspended: !!r.suspended, acceptanceConfirmed: !!r.acceptance_confirmed,
    dailyBudgetFlow: Number(r.daily_budget_flow ?? 0), perWalletDailyCap: Number(r.per_wallet_daily_cap ?? 0),
    enabledPrograms: r.enabled_programs ?? [], configuredBy: r.updated_by ?? null,
    updatedAt: r.updated_at ?? null, updatedByEmail: r.updated_by_email ?? null,
  };
}

export async function setAutoConfig(a: AdminContext, patch: Partial<AutoApprovalConfig>) {
  if (a.role !== "super_admin") return { ok: false as const, error: "Super admin required." };
  const cur = await readAutoConfig();
  const next: AutoApprovalConfig = { ...cur, ...patch, configuredBy: a.userId };
  const err = validateAutoConfig(next);
  if (err) return { ok: false as const, error: err };
  const admin = await db();
  const row = {
    enabled: next.enabled, suspended: next.suspended, acceptance_confirmed: next.acceptanceConfirmed,
    daily_budget_flow: next.dailyBudgetFlow, per_wallet_daily_cap: next.perWalletDailyCap,
    enabled_programs: next.enabledPrograms, updated_by: a.userId, updated_by_email: a.email, updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("reward_auto_approval_config").update(row as never).eq("id", 1);
  if (error) return { ok: false as const, error: "Configuration could not be saved." };
  await admin.from("admin_audit_events").insert({ actor_user_id: a.userId, actor_email: a.email, actor_role: a.role, object_type: "reward_automation", object_id: "auto-approval", action: "AUTO_APPROVAL_CONFIG", old_value: cur as never, new_value: row as never });
  return { ok: true as const };
}

async function todayUsage() {
  const admin = await db();
  const [{ data: today, error }, { data: pending, error: e2 }] = await Promise.all([
    admin.from("reward_payout_approvals").select("wallet,points").eq("auto_approved", true).eq("status", "CONFIRMED").gte("created_at", dayStart()),
    admin.from("reward_payout_approvals").select("user_id,wallet,points,auto_approved,created_at").eq("status", "CONFIRMED").is("settlement_batch_id", null),
  ]);
  if (error || e2) throw new Error("approval usage unavailable");
  const walletUsedToday: Record<string, number> = {};
  for (const r of today ?? []) walletUsedToday[r.wallet.toLowerCase()] = (walletUsedToday[r.wallet.toLowerCase()] ?? 0) + r.points;
  const used = (today ?? []).reduce((s, r) => s + r.points, 0);
  const pendingFlow = (pending ?? []).reduce((s, r) => s + r.points, 0);
  return { used, walletUsedToday, pending: pending ?? [], pendingFlow };
}

/** Reads state and the plan without writing (Ops view and dry run). */
export async function readAutomation() {
  const cfg = await readAutoConfig();
  const { loadQueueState } = await import("./approvalQueue.server");
  const [{ queue, report }, usage] = await Promise.all([loadQueueState(), todayUsage()]);
  const live = report.distributor.live;
  const plan = planAutoApprovals(queue.candidates, cfg, {
    usedTodayFlow: usage.used, walletUsedToday: usage.walletUsedToday,
    freeBackingFlow: live ? Math.max(0, Math.floor(live.freeFlow) - usage.pendingFlow) : null,
    paused: live ? live.paused : null, publisherWallets: [SETTLEMENT_SIGNER.address],
    pendingBatchWallets: usage.pending.length, pendingBatchFlow: usage.pendingFlow,
  });
  return {
    config: cfg, blocker: automationBlocker(cfg),
    budget: { dailyBudgetFlow: cfg.dailyBudgetFlow, committedTodayFlow: usage.used, remainingFlow: Math.max(0, cfg.dailyBudgetFlow - usage.used), freeBackingFlow: live ? Math.floor(live.freeFlow) : null, awaitingPublicationFlow: usage.pendingFlow },
    pendingBatch: { wallets: usage.pending.length, flow: usage.pendingFlow, autoApproved: usage.pending.filter((p) => p.auto_approved).length },
    wouldApprove: plan.approve.map((x) => ({ wallet: x.wallet, points: x.points, programs: x.programs })),
    held: plan.held.map((h) => ({ reason: h.reason, points: h.points })),
    excluded: queue.excluded.map((e) => ({ reason: e.reason, points: e.points })),
    autonomousSigning: false as const,
    _plan: plan,
  };
}

/** One approval cycle. Idempotent: the RPC rejects any account already committed. */
export async function runAutoApproval(source: string) {
  const state = await readAutomation();
  if (state.blocker) return { ok: true as const, approved: 0, skipped: state.held.length, blocker: state.blocker };
  const admin = await db();
  let approved = 0; const rejected: Record<string, number> = {};
  for (const x of state._plan.approve) {
    const evidence = { ...approvalEvidence(x.candidate, x.points), programs: x.programs, source, automatic: true, at: new Date().toISOString() };
    const hash = await sha256(JSON.stringify({ ...approvalEvidence(x.candidate, x.points), programs: x.programs }));
    const { data, error } = await admin.rpc("auto_approve_payout_v2" as never, {
      p_user: x.userId, p_wallet: x.wallet, p_points: x.points, p_available: x.candidate.availablePoints,
      p_funded: x.candidate.fundedPoints, p_settled: x.candidate.alreadySettledPoints, p_programs: x.programs, p_evidence: { ...evidence, programs: x.programs }, p_hash: hash,
    } as never);
    const res = (data ?? {}) as { ok?: boolean; reason?: string };
    if (error || !res.ok) { const k = error ? "RPC_ERROR" : res.reason ?? "UNKNOWN"; rejected[k] = (rejected[k] ?? 0) + 1; if (res.reason === "AUTOMATION_OFF" || res.reason === "DAILY_BUDGET_EXHAUSTED") break; continue; }
    approved++;
  }
  return { ok: true as const, approved, rejected, blocker: null };
}
