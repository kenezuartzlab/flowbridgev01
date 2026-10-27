/**
 * V37 — Rewards Approval Queue (server). Off-chain only.
 *
 * Lists per-account payout candidates from the same settlement facts Ops
 * already computes, and records propose → approve/reject → confirm decisions
 * in reward_payout_approvals under proposer/approver separation. Confirmation
 * reserves NOTHING new (funded ledger rows already hold their reservations)
 * and never signs or broadcasts: it re-runs the existing prepare-only
 * settlement builder and reports the resulting status and claim window.
 */
import type { AdminContext } from "@/lib/admin/adminGate.server";
import { SETTLEMENT_SIGNER } from "./settlementPlanner";
import { allocateByProgram, approvalEvidence, buildApprovalQueue, payoutApprovalDecision, proposedAmountValid, type ApprovalAccountRow } from "./approvalQueue";

async function db() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin; }
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface SettlementAccountRow { userId: string; wallet: string | null; classification: string; authoritative: number; pendingReview: number; alreadyAllocatedPoints: number; fundedByProgram?: Record<string, number>; routineFundedByProgram?: Record<string, number> }

export async function loadQueueState(ignoreApprovalId?: string) {
  const { buildRewardSolvencyReport } = await import("./rewardSolvency.server");
  const report = await buildRewardSolvencyReport();
  const rows = ((report.settlement as { accountRows?: SettlementAccountRow[] }).accountRows ?? []) as SettlementAccountRow[];
  const admin = await db();
  const { data: open, error } = await admin.from("reward_payout_approvals").select("id,user_id").or("status.in.(PROPOSED,APPROVED),and(status.eq.CONFIRMED,settlement_batch_id.is.null)");
  if (error) throw new Error("approval queue unavailable");
  const openUsers = new Set((open ?? []).filter((r: { id: string }) => r.id !== ignoreApprovalId).map((r: { user_id: string }) => r.user_id));
  const { data: linked, error: linkedError } = await admin.from("reward_payout_approvals").select("user_id,program_breakdown").eq("status", "CONFIRMED").not("settlement_batch_id", "is", null);
  if (linkedError) throw new Error("approval history unavailable");
  const settledBy = new Map<string, Record<string, number>>();
  for (const l of linked ?? []) {
    const m = settledBy.get(l.user_id) ?? {};
    for (const [k, v] of Object.entries((l.program_breakdown ?? {}) as Record<string, number>)) m[k] = (m[k] ?? 0) + Number(v);
    settledBy.set(l.user_id, m);
  }
  const inputs: ApprovalAccountRow[] = rows.map((r) => ({
    userId: r.userId, wallet: r.wallet, fundedPoints: r.authoritative, authoritative: r.authoritative,
    alreadySettledPoints: r.alreadyAllocatedPoints, pendingReview: r.pendingReview,
    classification: r.classification, openProposal: openUsers.has(r.userId),
    fundedByProgram: r.fundedByProgram, settledByProgram: settledBy.get(r.userId),
  }));
  const routineInputs = inputs.map(r => {
    const by = rows.find(x => x.userId === r.userId)?.routineFundedByProgram ?? {};
    const total = Object.values(by).reduce((s, n) => s + n, 0);
    return { ...r, fundedPoints: total, authoritative: total, fundedByProgram: by };
  });
  return { report, queue: buildApprovalQueue(inputs), routineQueue: buildApprovalQueue(routineInputs) };
}

/** Publisher-wallet recipients always require independent review; never confirmed through routine flow. */
export const isPublisherRecipient = (wallet: string | null | undefined) => !!wallet && wallet.toLowerCase() === SETTLEMENT_SIGNER.address.toLowerCase();

function settlementBlockReason(st: { status: string; reason?: string | null; checks?: { id: string; pass: boolean }[] }): string | null {
  if (st.status === "READY_FOR_PUBLISHER_REVIEW") return null;
  const failed = (st.checks ?? []).filter((c) => !c.pass).map((c) => c.id.replaceAll("_", " ").toLowerCase());
  if (st.reason) return String(st.reason).replaceAll("_", " ").toLowerCase() + (failed.length ? ` (${failed.join(", ")})` : "");
  return failed.length ? failed.join(", ") : "no confirmed approvals are waiting for a batch";
}

export async function readApprovalQueue(actor?: AdminContext) {
  const admin = await db();
  const [{ queue, report }, { data: approvals, error }] = await Promise.all([
    loadQueueState(),
    admin.from("reward_payout_approvals").select("id,user_id,wallet,points,auto_approved,program_breakdown,linked_epoch_id,publication_tx_hash,linked_at,available_points,funded_points,already_settled_points,evidence_hash,status,proposed_by_email,decided_by_email,decided_at,confirmed_by_email,confirmed_at,decision_note,created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  if (error) throw new Error("approval records unavailable");
  const chain = report.distributor.live;
  return {
    candidates: queue.candidates,
    excluded: queue.excluded,
    approvals: (approvals ?? []).map((a: Record<string, unknown>) => ({
      ...a,
      canDecide: !!actor && payoutApprovalDecision(a as never, { userId: actor.userId, role: actor.role }, "approve").ok,
      canConfirm: !!actor && !isPublisherRecipient(a.wallet as string) && payoutApprovalDecision(a as never, { userId: actor.userId, role: actor.role }, "confirm").ok,
      heldReason: isPublisherRecipient(a.wallet as string) && ["PROPOSED", "APPROVED"].includes(String(a.status)) ? "Publisher wallet recipient — held for independent review. Not settled or published automatically." : null,
    })),
    backing: {
      freeBalanceFlow: chain?.freeFlow ?? null,
      campaignBudgetFlow: chain?.campaignBudgetFlow ?? null,
      paused: chain?.paused ?? null,
      settlementStatus: report.settlement.status,
      settlementBlockReason: settlementBlockReason(report.settlement as never),
      claimStartIso: report.settlement.claimStartIso,
      claimEndIso: report.settlement.claimEndIso,
    },
  };
}

export async function proposePayout(a: AdminContext, userId: string, points: number, note?: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { ok: false as const, error: "Account is required." };
  const { queue, report } = await loadQueueState();
  const c = queue.candidates.find((x) => x.userId === userId);
  if (!c) return { ok: false as const, error: "This account has no verified eligible Points available for payout." };
  if (!proposedAmountValid(c.availablePoints, points)) return { ok: false as const, error: `Amount must be between 1 and ${c.availablePoints} verified Points.` };
  const chain = report.distributor.live;
  if (!chain) return { ok: false as const, error: "Distributor state unreadable; re-check before proposing." };
  if (chain.paused) return { ok: false as const, error: "Distributor is paused; payout proposals are blocked." };
  if (points > chain.freeFlow) return { ok: false as const, error: `Insufficient backing: ${Math.floor(chain.freeFlow)} FLOW free in the distributor.` };
  const evidence = approvalEvidence(c, points);
  const evidenceHash = await sha256(JSON.stringify(evidence));
  const admin = await db();
  const { data, error } = await admin.from("reward_payout_approvals").insert({
    user_id: c.userId, wallet: c.wallet, points: Math.floor(points),
    available_points: c.availablePoints, funded_points: c.fundedPoints, already_settled_points: c.alreadySettledPoints,
    evidence: { ...evidence, note: note ?? null, backingFreeFlow: Math.floor(chain.freeFlow), proposedAt: new Date().toISOString() } as never,
    evidence_hash: evidenceHash, proposed_by: a.userId, proposed_by_email: a.email,
    program_breakdown: c.availableByProgram ? allocateByProgram(c.availableByProgram, points) : {},
  } as never).select("id");
  if (error) return { ok: false as const, error: /duplicate|unique/i.test(error.message) ? "An open payout approval already exists for this account." : "Proposal could not be recorded." };
  await admin.from("admin_audit_events").insert({ actor_user_id: a.userId, actor_email: a.email, actor_role: a.role, object_type: "reward_payout_approval", object_id: (data as { id: string }[])[0]?.id ?? userId, action: "PROPOSED", new_value: { points, wallet: c.wallet } as never });
  return { ok: true as const, id: (data as { id: string }[])[0]?.id, points: Math.floor(points) };
}

export async function decidePayout(a: AdminContext, id: string, decision: "approve" | "reject", note?: string) {
  const admin = await db();
  const { data: s } = await admin.from("reward_payout_approvals").select("*").eq("id", id).maybeSingle();
  if (!s) return { ok: false as const, error: "Approval not found." };
  const d = payoutApprovalDecision(s as never, { userId: a.userId, role: a.role }, decision);
  if (!d.ok) return { ok: false as const, error: d.reason };
  const status = decision === "approve" ? "APPROVED" : "REJECTED";
  const { data: upd, error } = await admin.from("reward_payout_approvals").update({
    status, decided_by: a.userId, decided_by_email: a.email, decided_at: new Date().toISOString(), decision_note: note ?? null,
  } as never).eq("id", id).eq("status", "PROPOSED").select("id");
  if (error || !upd?.length) return { ok: false as const, error: "Approval changed concurrently; reload." };
  await admin.from("admin_audit_events").insert({ actor_user_id: a.userId, actor_email: a.email, actor_role: a.role, object_type: "reward_payout_approval", object_id: id, action: status, reason: note ?? null });
  return { ok: true as const, status };
}

/** Confirm an approved payout: re-verify backing, then run the existing prepare-only settlement build. */
export async function confirmPayout(a: AdminContext, id: string, expectedHash: string) {
  const admin = await db();
  const { data: s } = await admin.from("reward_payout_approvals").select("*").eq("id", id).maybeSingle();
  if (!s) return { ok: false as const, error: "Approval not found." };
  const rec = s as unknown as { status: string; evidence_hash: string; points: number; proposed_by: string | null; user_id: string; wallet: string };
  const d = payoutApprovalDecision(rec as never, { userId: a.userId, role: a.role }, "confirm");
  if (!d.ok) return { ok: false as const, error: d.reason };
  if (rec.evidence_hash !== expectedHash) return { ok: false as const, error: "Evidence hash mismatch; reload and re-review." };
  if (isPublisherRecipient(rec.wallet)) return { ok: false as const, error: "Publisher wallet recipient is held for independent review and cannot be confirmed here." };
  // Re-verify the account is still eligible and backed before confirming. This approval's own open record is ignored.
  const { queue, report } = await loadQueueState(id).catch(() => ({ queue: null, report: null }));
  if (!queue || !report) return { ok: false as const, error: "Eligibility checks are temporarily unavailable; nothing changed. Retry shortly." };
  const chain = report.distributor.live ?? null;
  if (!chain) return { ok: false as const, error: "Distributor state unreadable; nothing changed. Retry shortly." };
  if (chain.paused) return { ok: false as const, error: "Distributor is paused; confirmation blocked." };
  if (rec.points > chain.freeFlow) return { ok: false as const, error: `Insufficient distributor backing: ${Math.floor(chain.freeFlow)} FLOW free, ${rec.points} required.` };
  const still = queue.candidates.find((x) => x.userId === rec.user_id);
  if (!still) {
    const ex = queue.excluded.find((x) => x.userId === rec.user_id);
    return { ok: false as const, error: `Account is no longer eligible (${ex ? ex.reason.replaceAll("_", " ").toLowerCase() : "no verified funded Points"}); reject this approval.` };
  }
  if (!proposedAmountValid(still.availablePoints, rec.points)) return { ok: false as const, error: `Only ${still.availablePoints} verified Points remain available; reject and re-propose.` };
  const { data: upd, error } = await admin.from("reward_payout_approvals").update({
    status: "CONFIRMED", confirmed_by: a.userId, confirmed_by_email: a.email, confirmed_at: new Date().toISOString(),
  } as never).eq("id", id).eq("status", "APPROVED").select("id");
  if (error || !upd?.length) return { ok: false as const, error: "Approval changed concurrently; reload." };
  await admin.from("admin_audit_events").insert({ actor_user_id: a.userId, actor_email: a.email, actor_role: a.role, object_type: "reward_payout_approval", object_id: id, action: "CONFIRMED", new_value: { points: rec.points, hash: expectedHash } as never });
  // Prepare-only: unsigned settlement candidate via the existing builder. No signing, no broadcast.
  let distribution: { status: string; prepared: boolean; claimStartIso: string | null; claimEndIso: string | null; automaticSigning: false };
  try {
    const st = report!.settlement;
    distribution = { status: st.status, prepared: st.status === "READY_FOR_PUBLISHER_REVIEW", claimStartIso: st.claimStartIso, claimEndIso: st.claimEndIso, automaticSigning: false };
  } catch { distribution = { status: "CHECKS_UNAVAILABLE", prepared: false, claimStartIso: null, claimEndIso: null, automaticSigning: false }; }
  return { ok: true as const, status: "CONFIRMED", distribution };
}
