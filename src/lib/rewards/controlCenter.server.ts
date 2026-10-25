/**
 * V36.10 — Rewards Control Center server logic. Off-chain only: builds the
 * funding queue, records snapshots/approvals, and confirms funding through the
 * atomic confirm_reward_funding_snapshot RPC. Never signs or broadcasts.
 */
import type { AdminContext } from "@/lib/admin/adminGate.server";
import { approvalDecision, buildFundingQueue, capacityCheck, type QueueLedgerRow } from "./fundingQueue";
import { readChainState } from "./settlement.server";

const WEI = 10n ** 18n;
async function db() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin; }

async function loadQueue() {
  const admin = await db();
  const [ledger, profiles] = await Promise.all([
    admin.from("flow_points_ledger").select("id,user_id,points,reason,chain_id,funding_state,reservation_id,program_id,policy_version,wallet_address,tx_hash,verified_activity_id,created_at,provenance_state").gt("points", 0).limit(5000),
    admin.from("profiles").select("id,wallet_address").not("wallet_address", "is", null).limit(10000),
  ]);
  if (ledger.error || profiles.error) throw new Error("ledger unavailable");
  if ((ledger.data?.length ?? 0)>=5000 || (profiles.data?.length ?? 0)>=10000) throw new Error('Queue inventory exceeds safe bounds');
  const wallets = new Map((profiles.data ?? []).map((p: any) => [p.id as string, p.wallet_address as string | null]));
  return buildFundingQueue((ledger.data ?? []) as QueueLedgerRow[], wallets);
}

async function capacity(programId: string, need: number) {
  const admin = await db();
  const [{ data: budgets }, chain] = await Promise.all([
    admin.from("reward_budgets").select("program_id,total_points,reserved_points,status,funding_verified"),
    readChainState(),
  ]);
  const b = (budgets ?? []).find((x: any) => x.program_id === programId);
  const reservedAll = (budgets ?? []).reduce((s: number, x: any) => s + Number(x.reserved_points), 0);
  const claimed = chain ? Number(chain.totalClaimedWei / WEI) : 0;
  const free = chain ? Number((chain.balanceWei - chain.totalReservedWei) / WEI) : null;
  return capacityCheck({
    need,
    programRemaining: b && b.status === "ACTIVE" && b.funding_verified ? Number(b.total_points) - Number(b.reserved_points) : 0,
    freeBackingFlow: free,
    outstandingReservedPoints: Math.max(0, reservedAll - claimed),
  });
}

export async function readControlCenter(actor?: AdminContext) {
  const admin = await db();
  const [queue, snaps, exc, audit, policy, runs, budgets, chain, evidence] = await Promise.all([
    loadQueue(),
    admin.from("reward_funding_snapshots").select("id,program_id,total_points,row_count,account_count,snapshot_hash,status,proposed_by,proposed_by_email,approved_by_email,approved_at,confirmed_by_email,confirmed_at,note,created_at,result").order("created_at", { ascending: false }).limit(30),
    admin.from("reward_ops_exceptions").select("*").order("created_at", { ascending: false }).limit(100),
    admin.from("admin_audit_events").select("object_type,object_id,action,actor_email,actor_role,reason,created_at,new_value").in("object_type", ["reward_funding", "reward_round", "reward_budget", "reward_automation"]).order("created_at", { ascending: false }).limit(100),
    admin.from("reward_automation_policy").select("*"),
    admin.from("reward_ops_runs").select("ran_at,source,summary").order("ran_at", { ascending: false }).limit(5),
    admin.from("reward_budgets").select("program_id,total_points,reserved_points,status,funding_verified"),
    readChainState(),
    (await import('./rewardEvidenceAssessment.server')).readRewardEvidenceAssessment(),
  ]);
  const exclusions: Record<string, { rows: number; points: number }> = {};
  for (const e of queue.excluded) { const k = e.reason; exclusions[k] ??= { rows: 0, points: 0 }; exclusions[k].rows++; exclusions[k].points += e.points; }
  const programs = Object.entries(queue.eligible).map(([programId, items]) => ({
    programId, rows: items.length, points: items.reduce((s, i) => s + i.points, 0),
    accounts: new Set(items.map((i) => i.userId)).size, unlabelled: items.filter((i) => i.labelFromNull).length,
    // Accounts are anonymised: index + per-account points only.
    accountBreakdown: Object.values(items.reduce((m: Record<string, number>, i) => ((m[i.userId] = (m[i.userId] ?? 0) + i.points), m), {})).sort((a, b) => b - a),
  }));
  if ([snaps,exc,audit,policy,runs,budgets].some(r=>r.error)) throw new Error('Control center records unavailable');
  const reserved = (budgets.data ?? []).reduce((s,b)=>s+Number(b.reserved_points),0);
  const free = chain ? Number((chain.balanceWei-chain.totalReservedWei)/WEI)-Math.max(0,reserved-Number(chain.totalClaimedWei/WEI)) : null;
  return {
    fundingOverview: { verifiedQualifyingPoints: programs.reduce((s,p)=>s+p.points,0), walletCount:new Set(Object.values(queue.eligible).flat().map(i=>i.userId)).size, fundingAmount:programs.reduce((s,p)=>s+p.points,0), availableBackingFlow:free, availableBudget:(budgets.data ?? []).filter(b=>b.status==='ACTIVE' && b.funding_verified).reduce((s,b)=>s+Number(b.total_points)-Number(b.reserved_points),0), exceptionCount:evidence.assessed.filter(x=>x.assessment.status==='NEEDS_EXCEPTION_REVIEW').length, alreadyFundedPoints:reserved, settledFlow:chain ? Number(chain.totalClaimedWei/WEI):null },
    evidenceAssessment:evidence.summary, round3:evidence.round3,
    chain: chain ? {
      freeBalanceFlow: Number((chain.balanceWei - chain.totalReservedWei) / WEI), totalClaimedFlow: Number(chain.totalClaimedWei / WEI),
      campaignBudgetFlow: Number(chain.campaignBudgetWei / WEI), epochCount: chain.epochCount, paused: chain.paused,
    } : null,
    budgets: budgets.data ?? [],
    fundingQueue: programs,
    exclusions,
    snapshots: (snaps.data ?? []).map((s: any) => ({ ...s, canApprove:!!actor && approvalDecision(s,actor).ok, proposed_by: undefined })),
    exceptions: exc.data ?? [],
    audit: audit.data ?? [],
    automation: { policies: policy.data ?? [], autonomousFundingAuthorized: false, autonomousSigning: false, lastRuns: runs.data ?? [] },
  };
}

export async function proposeFunding(a: AdminContext, programId: string, note?: string) {
  const queue = await loadQueue();
  const items = queue.eligible[programId] ?? [];
  if (!items.length) return { ok: false as const, error: "Nothing fundable in this program." };
  const need = items.reduce((s, i) => s + i.points, 0);
  const cap = await capacity(programId, need);
  if (!cap.ok) return { ok: false as const, error: "Capacity check failed.", checks: cap.checks };
  const admin = await db();
  const { data, error } = await admin.rpc("create_reward_funding_snapshot" as never, {
    p_program: programId, p_ids: items.map((i) => i.id), p_actor: a.userId, p_email: a.email,
    p_evidence: { checks: cap.checks, labelledFromNull: items.filter((i) => i.labelFromNull).map((i) => i.id), builtAt: new Date().toISOString() },
    p_note: note ?? null,
  } as never);
  if (error) return { ok: false as const, error: /duplicate|unique/i.test(error.message) ? "An open snapshot for these exact records already exists." : "Snapshot could not be created." };
  return { ok: true as const, id: data as unknown as string, points: need, rows: items.length };
}

export async function decideFunding(a: AdminContext, id: string, decision: "approve" | "reject") {
  const admin = await db();
  const { data: s } = await admin.from("reward_funding_snapshots").select("*").eq("id", id).maybeSingle();
  if (!s) return { ok: false as const, error: "Snapshot not found." };
  const d = approvalDecision(s as any, { userId: a.userId, role: a.role });
  if (!d.ok) return { ok: false as const, error: d.reason };
  const status = decision === "approve" ? "APPROVED" : "REJECTED";
  const { data: upd } = await admin.from("reward_funding_snapshots").update({ status, approved_by: a.userId, approved_by_email: a.email, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).eq("status", "PROPOSED").select("id");
  if (!upd?.length) return { ok: false as const, error: "Snapshot changed concurrently; reload." };
  await admin.from("admin_audit_events").insert({ actor_user_id: a.userId, actor_email: a.email, actor_role: a.role, object_type: "reward_funding", object_id: id, action: status });
  return { ok: true as const, status };
}

export async function confirmFunding(a: AdminContext, id: string, expectedHash: string) {
  if (a.role !== "super_admin") return { ok: false as const, error: "Only a super admin can confirm funding." };
  const admin = await db();
  const { data: s } = await admin.from("reward_funding_snapshots").select("program_id,total_points,status").eq("id", id).maybeSingle();
  if (!s) return { ok: false as const, error: "Snapshot not found." };
  if (s.status === "APPROVED") {
    const cap = await capacity(s.program_id, Number(s.total_points));
    if (!cap.ok) return { ok: false as const, error: "Capacity changed; funding blocked.", checks: cap.checks };
  }
  const { data, error } = await admin.rpc("confirm_reward_funding_snapshot" as never, { p_snapshot: id, p_actor: a.userId, p_email: a.email, p_role: a.role, p_expected_hash: expectedHash } as never);
  if (error) return { ok: false as const, error: error.message.replace(/^.*?:\s*/, "") };
  const outcome = (data as {outcome?:string})?.outcome;
  let distribution: {status:string; prepared:boolean} | undefined;
  if (outcome==='CONFIRMED' || outcome==='ALREADY_CONFIRMED') {
    try {
      const {buildRewardSolvencyReport}=await import('./rewardSolvency.server');
      const report=await buildRewardSolvencyReport();
      distribution={status:report.settlement.status,prepared:report.settlement.status==='READY_FOR_PUBLISHER_REVIEW'};
    } catch { distribution={status:'CHECKS_UNAVAILABLE',prepared:false}; }
  }
  return { ok: true as const, ...(data as object), distribution };
}

export async function resolveException(a: AdminContext, id: string) {
  const admin = await db();
  await admin.from("reward_ops_exceptions").update({ status: "RESOLVED", resolved_by_email: a.email, resolved_at: new Date().toISOString() }).eq("id", id);
  return { ok: true as const };
}

/** Super admin only. Auto-funding may be configured but stays inert while autonomous funding is unauthorized. */
export async function setAutomationPolicy(a: AdminContext, p: { programId: string; suspended?: boolean; perRunCap?: number; dailyCap?: number }) {
  if (a.role !== "super_admin") return { ok: false as const, error: "Super admin required." };
  const admin = await db();
  const patch: Record<string, unknown> = { updated_by_email: a.email, updated_at: new Date().toISOString(), auto_funding_enabled: false };
  if (typeof p.suspended === "boolean") patch.suspended = p.suspended;
  if (typeof p.perRunCap === 'number' && Number.isInteger(p.perRunCap) && p.perRunCap >= 0) patch.per_run_cap = p.perRunCap;
  if (typeof p.dailyCap === 'number' && Number.isInteger(p.dailyCap) && p.dailyCap >= 0) patch.daily_cap = p.dailyCap;
  await admin.from("reward_automation_policy").update(patch as never).eq("program_id", p.programId);
  await admin.from("admin_audit_events").insert({ actor_user_id: a.userId, actor_email: a.email, actor_role: a.role, object_type: "reward_automation", object_id: p.programId, action: "POLICY_UPDATED", new_value: patch as never });
  return { ok: true as const };
}

/** Scheduled sweep: read-only checks + exception records. Never funds, signs or publishes. */
export async function runOpsSweep(source: string) {
  const admin = await db();
  const queue = await loadQueue();
  const { reconcileDurablePublications } = await import('./payoutRecovery.server');
  const recovery = await reconcileDurablePublications(admin);
  const { buildRewardSolvencyReport } = await import("./rewardSolvency.server");
  const report: any = await buildRewardSolvencyReport().catch(() => null);
  const exceptions: { kind: string; key: string; detail: string; action: string; severity: string }[] = [];
  const mismatch = queue.excluded.filter((e) => e.reason === "WALLET_MISMATCH");
  if (mismatch.length) exceptions.push({ kind: "WALLET_MISMATCH", key: `wallet-mismatch:${mismatch.length}`, detail: `${mismatch.length} reward records were earned by a wallet that is not the account's bound wallet.`, action: "Leave excluded; the account owner must re-earn with the bound wallet.", severity: "WARN" });
  if (!report) exceptions.push({ kind: "SOLVENCY_UNAVAILABLE", key: `solvency:${new Date().toISOString().slice(0, 13)}`, detail: "Solvency report could not be built.", action: "Re-run later; check the BOT RPC.", severity: "BLOCK" });
  if (report) {
    if (report.settlement.renewal?.needed) exceptions.push({kind:'SCHEDULE_NEEDS_RENEWAL',key:`schedule:${report.settlement.batchId}`,detail:`Round #${report.settlement.epochId} needs an authorized schedule renewal. Original allocation is preserved.`,action:'Open Payout Operations and review the renewal proposal.',severity:'WARN'});
    for (const check of report.settlement.checks.filter((c: {pass:boolean;id:string})=>!c.pass && c.id!=='STORED_CLAIM_WINDOW')) exceptions.push({kind:'PAYOUT_BLOCKED',key:`payout:${check.id}`,detail:`Payout check failed: ${check.id.replaceAll('_',' ')}.`,action:'Re-check Payout Operations. Signing remains disabled until validation succeeds.',severity:'BLOCK'});
    for (const round of report.rounds.filter((r:{status:string})=>r.status.includes('EXPIRED'))) exceptions.push({kind:'CLAIM_WINDOW_EXPIRED',key:`claim-expired:${round.epochId}`,detail:`Round #${round.epochId} claim window is closed.`,action:'Review the confirmed round history. Do not announce claimability.',severity:'WARN'});
  }
  if(recovery.unresolved) exceptions.push({kind:'PUBLICATION_RECOVERY',key:'publication-recovery',detail:`${recovery.unresolved} publication operation(s) need reconciliation.`,action:'Open Payout Operations and Re-check or Recover. Never send another transaction.',severity:'BLOCK'});
  for (const e of exceptions) {
    const saved = await admin.from("reward_ops_exceptions").upsert({ kind: e.kind, dedupe_key: e.key, detail: e.detail, corrective_action: e.action, severity: e.severity }, { onConflict: "dedupe_key", ignoreDuplicates: true });
    if (saved.error) throw new Error('Operator alert could not be recorded. Re-check required.');
  }
  const summary = {
    fundablePoints: Object.fromEntries(Object.entries(queue.eligible).map(([k, v]) => [k, v.reduce((s, i) => s + i.points, 0)])),
    excludedRows: queue.excluded.length,
    settlementStatus: report?.settlement?.status ?? null,
    autoFunding: "OFF", autoSigning: "OFF",
  };
  const savedRun = await admin.from("reward_ops_runs").insert({ source, summary });
  if (savedRun.error) throw new Error('Scheduled verification could not be recorded. Re-check required.');
  return summary;
}

/** Historical evidence review queue: Core Swap rewards with verified trades awaiting pricing evidence. Anonymised. */
export async function readEvidenceReviews(actor?: AdminContext) {
  const admin = await db();
  const [rows, reviews] = await Promise.all([
    admin.from("flow_points_ledger").select("id,points,funding_state,policy_version,verified_usd,tx_hash,created_at").in("reason", ["CORE_SWAP", "CORE_SWAP_V2"]).eq("chain_id", 677).eq("provenance_state", "PENDING").gt("points", 0).order("created_at").limit(500),
    admin.from("reward_evidence_reviews").select("id,ledger_id,status,points,uncertainty,rationale,price_evidence,proposed_by,proposed_by_email,decided_by_email,decision_note,created_at,decided_at").order("created_at", { ascending: false }).limit(500),
  ]);
  if (rows.error || reviews.error) throw new Error("evidence unavailable");
  const evidence=await (await import('./rewardEvidenceAssessment.server')).readRewardEvidenceAssessment();
  const assessed=new Map(evidence.assessed.map(x=>[x.row.id,x]));
  const open = new Map((reviews.data ?? []).filter((r: any) => r.status === "PROPOSED").map((r: any) => [r.ledger_id, r]));
  return {
    pending: (rows.data ?? []).map((r: any) => ({ id: r.id, points: r.points, funded: r.funding_state === "FUNDED", policyVersion: r.policy_version, recordedUsd: r.verified_usd, txHash: r.tx_hash, earnedAt: r.created_at, assessment:assessed.get(r.id)?.assessment, evidence:{activity:assessed.get(r.id)?.activity,basePoints:assessed.get(r.id)?.row.base_points,originalMetadata:assessed.get(r.id)?.row.metadata,reservationPreserved:!!assessed.get(r.id)?.row.reservation_id}, review: open.get(r.id) ? { ...open.get(r.id), canDecide:actor?.role==='super_admin' && actor.userId!==(open.get(r.id) as any).proposed_by, proposed_by: undefined, proposedBy: undefined } : null })),
    round3:evidence.round3,
    decided: (reviews.data ?? []).filter((r: any) => r.status !== "PROPOSED").slice(0, 50).map((r: any) => ({ ...r, proposed_by: undefined })),
  };
}

export async function proposeEvidenceException(a: AdminContext, ledgerId: string, input: { rationale: string; uncertainty: string; priceSource?: string; priceUsd?: number | null }) {
  const { validateExceptionProposal, EXCEPTION_POLICY_ID } = await import("./evidenceReview");
  const v = validateExceptionProposal(input);
  if (!v.ok) return { ok: false as const, error: v.error };
  const admin = await db();
  const assessment=await (await import('./rewardEvidenceAssessment.server')).readRewardEvidenceAssessment();
  const candidate=assessment.assessed.find(x=>x.row.id===ledgerId);
  if (!candidate?.assessment.exceptionAllowed) return {ok:false as const,error:'This record has a non-valuation blocker and cannot use a pricing exception.'};
  const { data, error } = await admin.rpc("propose_reward_evidence_exception" as never, { p_ledger: ledgerId, p_actor: a.userId, p_email: a.email, p_price_evidence: { policy: EXCEPTION_POLICY_ID, source: input.priceSource ?? null, priceUsd: input.priceUsd ?? null }, p_uncertainty: input.uncertainty, p_rationale: input.rationale } as never);
  if (error) return { ok: false as const, error: /duplicate|unique/i.test(error.message) ? "This reward already has an open review." : error.message.replace(/^.*?:\s*/, "") };
  return { ok: true as const, id: data as unknown as string };
}

/** Grouped operator review; every row retains its own decision and original reservation. */
export async function batchEvidenceReview(a:AdminContext, ids:string[], action:'propose'|'APPROVED'|'REJECTED', input:{rationale:string;uncertainty:string;priceSource?:string;priceUsd?:number|null}) {
  if (!ids.length || ids.length>50 || new Set(ids).size!==ids.length) return {ok:false,error:'Select 1–50 distinct records.'};
  const admin=await db();
  const assessment=await (await import('./rewardEvidenceAssessment.server')).readRewardEvidenceAssessment();
  const selected=action==='propose' ? assessment.assessed.filter(x=>ids.includes(x.row.id)) : [];
  if (action==='propose' && (selected.length!==ids.length || selected.some(x=>!x.assessment.exceptionAllowed) || new Set(selected.map(x=>x.assessment.condition)).size!==1)) return {ok:false,error:'Batch review requires one shared documented valuation condition.'};
  if (action!=='propose') {
    const {data:reviews,error}=await admin.from('reward_evidence_reviews').select('ledger_id,proposed_by,status').in('id',ids);
    if (error || reviews?.length!==ids.length || a.role!=='super_admin' || reviews.some(r=>r.proposed_by===a.userId || r.status!=='PROPOSED')) return {ok:false,error:'A different authorized approver must decide every selected review.'};
    const conditions=assessment.assessed.filter(x=>reviews.some(r=>r.ledger_id===x.row.id)).map(x=>x.assessment.condition);
    if (new Set(conditions).size!==1) return {ok:false,error:'Selected reviews no longer share one evidence condition.'};
  }
  const results=[];
  for (const id of ids) { const result=action==='propose' ? await proposeEvidenceException(a,id,input) : await decideEvidenceException(a,id,action,input.rationale); results.push({id,...result}); if (!result.ok) break; }
  return {ok:results.every(r=>r.ok),results,error:results.some(r=>!r.ok)?'Batch stopped at a failed record. Earlier decisions are saved; refresh before retrying.':undefined};
}

export async function decideEvidenceException(a: AdminContext, reviewId: string, decision: "APPROVED" | "REJECTED", note?: string) {
  const { canDecideException } = await import("./evidenceReview");
  const admin = await db();
  const { data: r } = await admin.from("reward_evidence_reviews").select("status,proposed_by").eq("id", reviewId).maybeSingle();
  if (!r) return { ok: false as const, error: "Review not found." };
  const d = canDecideException({ status: (r as any).status, proposedBy: (r as any).proposed_by }, a);
  if (!d.ok) return { ok: false as const, error: d.reason };
  const { data, error } = await admin.rpc("decide_reward_evidence_exception" as never, { p_review: reviewId, p_actor: a.userId, p_email: a.email, p_decision: decision, p_note: note ?? null } as never);
  if (error) return { ok: false as const, error: error.message.replace(/^.*?:\s*/, "") };
  return { ok: data !== "STALE", outcome: data as unknown as string, ...(data === "STALE" ? { error: "The reward changed after the proposal; review it again." } : {}) };
}
