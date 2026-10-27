/**
 * Automatic approval against existing verified funding and campaign limits.
 * The service-only RPC serializes commitments and checks evidence freshness,
 * available backing, bound wallets, existing caps and duplicates atomically.
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
const dayStart = () => { const d = new Date(); d.setTime(d.getTime() - 86_400_000); return d.toISOString(); };

export async function readAutoConfig(): Promise<AutoApprovalConfig & { updatedAt: string | null; updatedByEmail: string | null }> {
  const { data, error } = await (await db()).from("reward_auto_approval_config").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error("automation config unavailable");
  const r = (data ?? {}) as Record<string, any>;
  return {
    policyRevision: Number(r.policy_revision ?? 0), enabled: !!r.enabled, suspended: !!r.suspended, acceptanceConfirmed: !!r.acceptance_confirmed,
    dailyBudgetFlow: Number(r.daily_budget_flow ?? 0), perWalletDailyCap: Number(r.per_wallet_daily_cap ?? 0),
    enabledPrograms: r.enabled_programs ?? [], configuredBy: r.updated_by ?? null,
    updatedAt: r.updated_at ?? null, updatedByEmail: r.updated_by_email ?? null,
  };
}

export async function setAutoConfig(a: AdminContext, patch: Partial<AutoApprovalConfig>) {
  if (a.role !== "super_admin") return { ok: false as const, error: "Super admin required." };
  const cur = await readAutoConfig();
  const next: AutoApprovalConfig = { ...cur, enabled: patch.enabled ?? cur.enabled, suspended: patch.suspended ?? cur.suspended, policyRevision: 2, acceptanceConfirmed: patch.enabled ?? cur.enabled, configuredBy: a.userId };
  const err = validateAutoConfig(next);
  if (err) return { ok: false as const, error: err };
  const admin = await db();
  const { error } = await admin.rpc("set_funded_reward_automation", { p_actor: a.userId, p_wallet: a.wallet, p_enabled: next.enabled, p_suspended: next.suspended });
  if (error) return { ok: false as const, error: "Configuration could not be saved." };
  return { ok: true as const };
}

async function todayUsage() {
  const admin = await db();
  const [{ data: today, error }, { data: pending, error: e2 }] = await Promise.all([
    admin.from("reward_payout_approvals").select("wallet,points").eq("status", "CONFIRMED").gte("confirmed_at", dayStart()),
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
  const [{ routineQueue: queue, report }, usage] = await Promise.all([loadQueueState(), todayUsage()]);
  const live = report.distributor.live;
  const plan = planAutoApprovals(queue.candidates, cfg, {
    usedTodayFlow: usage.used, walletUsedToday: usage.walletUsedToday,
    freeBackingFlow: live ? Math.max(0, Math.floor(live.freeFlow) - usage.pendingFlow) : null,
    paused: live ? live.paused : null, publisherWallets: [SETTLEMENT_SIGNER.address],
    pendingBatchWallets: usage.pending.length, pendingBatchFlow: usage.pendingFlow,
  });
  return {
    config: cfg, blocker: automationBlocker(cfg),
    budget: { dailyBudgetFlow: 500_000, committedTodayFlow: usage.used, remainingFlow: Math.max(0, Math.min(500_000 - usage.used, (live?.freeFlow ?? 0) - usage.pendingFlow)), freeBackingFlow: live ? Math.floor(live.freeFlow) : null, awaitingPublicationFlow: usage.pendingFlow },
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
  let state = await readAutomation();
  if (state.blocker) return { ok: true as const, approved: 0, skipped: state.held.length, blocker: state.blocker };
  const admin = await db();
  // Progress records that already passed two-person approval through the same
  // fresh-check confirmation. Never creates approvals; publisher recipients stay held.
  const { data: cfgRow } = await admin.from("reward_auto_approval_config").select("updated_by").eq("id", 1).maybeSingle();
  const { data: approvedRows } = await admin.from("reward_payout_approvals").select("id,evidence_hash").eq("status", "APPROVED");
  let confirmed = 0; const confirmFailures: Record<string, number> = {};
  if (cfgRow?.updated_by) {
    const { confirmApproved } = await import("./approvalQueue.server");
    for (const r of approvedRows ?? []) {
      const res = await confirmApproved({ userId: cfgRow.updated_by, email: "funded-policy", role: "automation" }, r.id, r.evidence_hash);
      if (res.ok) confirmed++; else confirmFailures[res.error] = (confirmFailures[res.error] ?? 0) + 1;
    }
    if (confirmed) state = await readAutomation();
  }
  let approved = 0; const rejected: Record<string, number> = {};
  for (const x of state._plan.approve) {
    const evidence = { ...approvalEvidence(x.candidate, x.points), programs: x.programs, source, automatic: true, at: new Date().toISOString() };
    const hash = await sha256(JSON.stringify({ ...approvalEvidence(x.candidate, x.points), programs: x.programs }));
    // Bracket fresh eligibility with a database evidence fence, then read chain capacity
    // immediately before the atomic commitment. Concurrent jobs share the DB lock.
    const before = await admin.rpc("reward_payout_evidence_hash");
    const { loadQueueState } = await import("./approvalQueue.server");
    const fresh = await loadQueueState();
    const eligible = fresh.routineQueue.candidates.find(c => c.userId === x.userId && c.wallet === x.wallet);
    const after = await admin.rpc("reward_payout_evidence_hash");
    const { readChainState } = await import("./settlement.server");
    const chain = await readChainState();
    const { publicationPreflight } = await import("./publisherReconciliation.server");
    const publisher = chain ? await publicationPreflight(chain.epochCount + 1).catch(() => null) : null;
    const programsStillAvailable = !!eligible?.availableByProgram && Object.entries(x.programs).every(([program, amount]) => amount <= (eligible.availableByProgram?.[program] ?? 0));
    if (before.error || after.error || !before.data || before.data !== after.data || !eligible || !programsStillAvailable || x.points > eligible.availablePoints || !chain || chain.paused || !publisher?.epochAvailable || publisher.latest !== publisher.pending) {
      rejected.CHECKS_CHANGED = (rejected.CHECKS_CHANGED ?? 0) + 1; continue;
    }
    const backing = (chain.balanceWei - chain.totalReservedWei < chain.campaignBudgetWei - chain.totalClaimedWei - chain.totalReservedWei
      ? chain.balanceWei - chain.totalReservedWei : chain.campaignBudgetWei - chain.totalClaimedWei - chain.totalReservedWei) / (10n ** 18n);
    const { data, error } = await admin.rpc("auto_approve_funded_payout", {
      p_user: x.userId, p_wallet: x.wallet, p_points: x.points, p_available: eligible.availablePoints,
      p_funded: eligible.fundedPoints, p_settled: eligible.alreadySettledPoints, p_programs: x.programs, p_evidence: evidence as never, p_hash: hash,
      p_backing: Math.max(0, Number(backing)), p_observed: new Date().toISOString(), p_state_hash: before.data,
    });
    const res = (data ?? {}) as { ok?: boolean; reason?: string };
    if (error || !res.ok) { const k = error ? "RPC_ERROR" : res.reason ?? "UNKNOWN"; rejected[k] = (rejected[k] ?? 0) + 1; if (res.reason === "AUTOMATION_OFF" || res.reason === "DAILY_BUDGET_EXHAUSTED") break; continue; }
    approved++;
  }
  const { buildRewardSolvencyReport } = await import("./rewardSolvency.server");
  const distribution = (await buildRewardSolvencyReport()).settlement;
  return { ok: true as const, approved, rejected, blocker: null, distribution: { status: distribution.status, prepared: distribution.status === "READY_FOR_PUBLISHER_REVIEW", claimStartIso: distribution.claimStartIso, automaticSigning: false } };
}
