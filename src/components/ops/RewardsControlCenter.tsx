import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getIdToken } from "@/lib/auth";
import { toast } from "sonner";
import { readOpsJson } from "@/lib/admin/opsRead";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { PayoutOperations } from './PayoutOperations';
import { EvidenceReview, RewardsPipeline } from './EvidenceReview';

type Snapshot = { id: string; program_id: string; total_points: number; row_count: number; account_count: number; snapshot_hash: string; status: string; proposed_by_email: string; approved_by_email: string | null; confirmed_by_email: string | null; confirmed_at: string | null; created_at: string; canApprove:boolean };
type State = {
  viewer: { role: string };
  fundingOverview:{verifiedQualifyingPoints:number;walletCount:number;fundingAmount:number;availableBackingFlow:number|null;availableBudget:number;exceptionCount:number;alreadyFundedPoints:number;settledFlow:number|null};
  round3:{heldPoints:number;storedFlow:number|null};
  chain: null | { freeBalanceFlow: number; totalClaimedFlow: number; campaignBudgetFlow: number; epochCount: number; paused: boolean };
  budgets: { program_id: string; total_points: number; reserved_points: number; status: string; funding_verified?: boolean }[];
  fundingQueue: { programId: string; rows: number; points: number; accounts: number; unlabelled: number; accountBreakdown: number[] }[];
  exclusions: Record<string, { rows: number; points: number }>;
  snapshots: Snapshot[];
  exceptions: { id: string; kind: string; severity: string; detail: string; corrective_action: string | null; status: string; created_at: string }[];
  audit: { object_type: string; object_id: string; action: string; actor_email: string | null; actor_role: string; created_at: string; reason: string | null }[];
  automation: { policies: { program_id: string; auto_funding_enabled: boolean; suspended: boolean; per_run_cap: number; daily_cap: number }[]; autonomousFundingAuthorized: boolean; autonomousSigning: boolean; lastRuns: { ran_at: string; source: string }[] };
};

const SECTIONS = ["Rewards Operations", "Approval Queue", "Payout Operations", "Evidence Review", "Overview", "Funding Queue", "Funding Approvals", "Exceptions", "Automation & Budgets", "Audit History"] as const;
type Section = (typeof SECTIONS)[number];
const fmt = (n: number | null | undefined) => (n == null ? "—" : Math.floor(n).toLocaleString());
const TONE: Record<string, string> = {
  READY: "border-success/40 bg-success/10 text-success", CONFIRMED: "border-success/40 bg-success/10 text-success",
  "NEEDS APPROVAL": "border-warning/40 bg-warning/10 text-warning", PROPOSED: "border-warning/40 bg-warning/10 text-warning",
  APPROVED: "border-primary/40 bg-primary/10 text-primary", PENDING: "border-primary/40 bg-primary/10 text-primary",
  BLOCKED: "border-danger/40 bg-danger/10 text-danger", REJECTED: "border-danger/40 bg-danger/10 text-danger", STALE: "border-danger/40 bg-danger/10 text-danger",
};
const Chip = ({ s }: { s: string }) => <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-black ${TONE[s] ?? "border-hairline text-muted"}`}>{s}</span>;

async function call(wallet: string, body?: Record<string, unknown>) {
  if (!body) return readOpsJson<State>("/api/admin/rewards-control", wallet);
  const token = await getIdToken();
  const h: Record<string, string> = { "x-wallet-address": wallet, ...(token ? { authorization: `Bearer ${token}` } : {}) };
  const res = await fetch("/api/admin/rewards-control", body ? { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify(body) } : { headers: h });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as any)?.error ?? `Request failed (${res.status})`);
  return j as any;
}

function download(name: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

type PayoutCandidate = { userId: string; wallet: string; availablePoints: number; fundedPoints: number; alreadySettledPoints: number };
type PayoutApproval = { id: string; user_id: string; wallet: string; points: number; available_points: number; evidence_hash: string; status: string; proposed_by_email: string; decided_by_email: string | null; confirmed_by_email: string | null; created_at: string; canDecide: boolean; canConfirm: boolean; heldReason?: string | null };
type ApprovalQueueState = {
  candidates: PayoutCandidate[];
  excluded: { userId: string; reason: string; points: number }[];
  approvals: PayoutApproval[];
  backing: { freeBalanceFlow: number | null; campaignBudgetFlow: number | null; paused: boolean | null; settlementStatus: string; settlementBlockReason?: string | null; claimStartIso: string | null; claimEndIso: string | null };
};

/** V37 — user-based Rewards Approval Queue. Propose → different super admin approves → confirm. No signing here. */
const HOLD_TEXT: Record<string, string> = { AUTOMATION_OFF: "Automation off", PROGRAM_NOT_ENABLED: "Program not enabled", PUBLISHER_RECIPIENT_REVIEW: "Publisher wallet — independent review", BACKING_UNAVAILABLE: "Backing unreadable", DISTRIBUTOR_PAUSED: "Distributor paused", INSUFFICIENT_BACKING: "Insufficient backing", DAILY_BUDGET_EXHAUSTED: "Daily budget used", WALLET_DAILY_CAP: "Wallet daily cap", BATCH_CAP: "Batch limit" };
function AutoBudget({ wallet, isSuper, busy, act }: { wallet: string; isSuper: boolean; busy: string | null; act: (key: string, body: Record<string, unknown>, ok: string) => Promise<void> }) {
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["auto-approval", wallet],
    queryFn: async () => {
      const token = await getIdToken();
      const res = await fetch("/api/admin/rewards-control", { method: "POST", headers: { "x-wallet-address": wallet, ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: JSON.stringify({ action: "auto-state" }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j as any)?.error ?? `Request failed (${res.status})`);
      return j as any;
    },
    refetchInterval: 30_000, retry: false,
  });
  if (q.isLoading) return <p className="text-[12px] text-muted">Loading automatic approval…</p>;
  if (q.error || !q.data) return <p role="alert" className="text-[12px] text-danger">{q.error?.message ?? "Unavailable."}</p>;
  const d = q.data; const c = d.config;
  const run = async (key: string, body: Record<string, unknown>, ok: string) => { await act(key, { action: "auto-config", ...body }, ok); qc.invalidateQueries({ queryKey: ["auto-approval"] }); };
  const held: Record<string, number> = {}; for (const h of d.held) held[h.reason] = (held[h.reason] ?? 0) + 1;

  return (
    <div className="space-y-2 rounded-xl border border-hairline bg-card p-3 text-[12px]">
      <p className="font-black">Automatic funded rewards</p>
      <p className={d.blocker ? "text-muted" : "font-bold text-success"}>{d.blocker ? `OFF — ${d.blocker}` : "ON — legitimate funded rewards are approved automatically. One publisher signature is required per batch."}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[["Existing daily limit", d.budget.dailyBudgetFlow], ["Committed today", d.budget.committedTodayFlow], ["Available backed capacity", d.budget.remainingFlow], ["Distributor free", d.budget.freeBackingFlow ?? "unreadable"]].map(([k, v]) => <div key={k as string} className="rounded-lg border border-hairline p-2"><p className="text-muted">{k}</p><p className="font-black">{typeof v === "number" ? `${fmt(v)} FLOW` : v}</p></div>)}
      </div>
      <p>Awaiting publisher signature: <b>{d.pendingBatch.wallets} wallet(s), {fmt(d.pendingBatch.flow)} FLOW</b> ({d.pendingBatch.autoApproved} automatic). Next cycle would approve {d.wouldApprove.length} wallet(s).</p>
      {Object.keys(held).length > 0 && <p className="text-muted">Held: {Object.entries(held).map(([k, n]) => `${HOLD_TEXT[k] ?? k} (${n})`).join(" · ")}</p>}
      {isSuper && (
        <div className="space-y-2 border-t border-hairline pt-2">
          <div className="flex flex-wrap gap-2">
            <Button disabled={!!busy} onClick={() => { if (c.enabled || confirm("Enable the revised automatic approval policy using existing verified funding and campaign limits? Publishing remains manually signed.")) run("ae", { enabled: !c.enabled }, c.enabled ? "Automatic approval off" : "Automatic approval on"); }}>{c.enabled ? "Turn off" : "Enable funded rewards"}</Button>
            <button type="button" disabled={!!busy} onClick={() => run("as", { suspended: !c.suspended }, "Updated")} className={`rounded-xl border px-3 py-1.5 font-bold ${c.suspended ? "border-danger/40 text-danger" : "border-hairline"}`}>{c.suspended ? "Suspended — resume" : "Emergency suspend"}</button>
            <button type="button" disabled={!!busy || !!d.blocker} onClick={async () => { await act("ar", { action: "auto-run" }, "Approval cycle complete"); qc.invalidateQueries({ queryKey: ["auto-approval"] }); }} className="rounded-xl border border-hairline px-3 py-1.5 font-bold disabled:opacity-50">Run approval cycle now</button>
          </div>
          {c.updatedByEmail && <p className="text-muted">Last changed by {c.updatedByEmail}{c.updatedAt ? ` · ${new Date(c.updatedAt).toLocaleString()}` : ""}</p>}
        </div>
      )}
    </div>
  );
}

function NextBatchCard({ wallet, onOpen }: { wallet: string; onOpen: () => void }) {
  const q = useQuery({
    queryKey: ["payout-approvals", wallet],
    queryFn: async () => {
      const token = await getIdToken();
      const res = await fetch("/api/admin/rewards-control", { method: "POST", headers: { "x-wallet-address": wallet, ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: JSON.stringify({ action: "payout-queue" }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j as any)?.error ?? `Request failed (${res.status})`);
      return j as ApprovalQueueState;
    },
    refetchInterval: 30_000, retry: false,
  });
  const b = q.data?.backing;
  const ready = b?.settlementStatus === "READY_FOR_PUBLISHER_REVIEW";
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-[12px]">
      <p className="font-black">Next valid payout batch</p>
      <p className="text-muted">The publisher reviews the prepared batch and signs once. The claim window opens after the contract's 24-hour delay.</p>
      <p className={ready ? "mt-1 font-bold text-success" : "mt-1 font-bold text-warning"}>
        {q.isLoading ? "Checking batch…" : q.error ? "Batch state unavailable — retry shortly." : ready ? `Ready for publisher review${b?.claimStartIso ? ` · claim opens ${new Date(b.claimStartIso).toUTCString()}` : ""}` : `Not ready — ${b?.settlementBlockReason ?? b?.settlementStatus ?? "unknown"}`}
      </p>
      <Button disabled={!ready} onClick={onOpen} className="mt-2 w-full sm:w-auto">Review & Publish Batch</Button>
    </div>
  );
}

function ApprovalQueue({ wallet, isSuper, busy, act }: { wallet: string; isSuper: boolean; busy: string | null; act: (key: string, body: Record<string, unknown>, ok: string) => Promise<void> }) {
  const qc = useQueryClient();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const q = useQuery({
    queryKey: ["payout-approvals", wallet],
    queryFn: async () => {
      const token = await getIdToken();
      const res = await fetch("/api/admin/rewards-control", { method: "POST", headers: { "x-wallet-address": wallet, ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" }, body: JSON.stringify({ action: "payout-queue" }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j as any)?.error ?? `Request failed (${res.status})`);
      return j as ApprovalQueueState;
    },
    refetchInterval: 30_000, retry: false,
  });
  if (q.isLoading) return <p className="text-[12px] text-muted">Loading approval queue…</p>;
  if (q.error || !q.data) return <div role="alert" className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-[12px] text-danger"><p>{q.error?.message ?? "Approval queue unavailable."}</p></div>;
  const s = q.data;
  const run = async (key: string, body: Record<string, unknown>, ok: string) => { await act(key, body, ok); qc.invalidateQueries({ queryKey: ["payout-approvals"] }); };
  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-hairline bg-card p-3 text-[11.5px] text-muted">
        <p>Routine verified funded rewards are approved automatically when the master switch is on. Manual requests remain available for independently reviewed exceptions. Any positive verified amount qualifies; publication and claim activation are still required.</p>
        <p className="mt-1">Distributor backing: <b className="tabular-nums">{fmt(s.backing.freeBalanceFlow)}</b> FLOW free · budget {fmt(s.backing.campaignBudgetFlow)} FLOW{s.backing.paused ? " · PAUSED" : ""} · Next batch: {s.backing.settlementStatus === "READY_FOR_PUBLISHER_REVIEW" ? "ready for publisher review" : `not ready — ${s.backing.settlementBlockReason ?? s.backing.settlementStatus}`}</p>
      </div>
      {s.approvals.filter((a) => a.status === "PROPOSED" || a.status === "APPROVED").map((a) => (
        <div key={a.id} className="rounded-xl border border-hairline bg-card p-3">
          <div className="flex items-start justify-between gap-2"><p className="min-w-0 text-[12.5px] font-black">{fmt(a.points)} FLOW → {a.wallet.slice(0, 6)}…{a.wallet.slice(-4)}</p><Chip s={a.heldReason ? "BLOCKED" : a.status === "PROPOSED" ? "NEEDS APPROVAL" : a.status} /></div>
          {a.heldReason && <p className="mt-1 text-[11.5px] font-bold text-warning">{a.heldReason}</p>}
          <p className="text-[11px] text-muted">Available {fmt(a.available_points)} · proposed by {a.proposed_by_email}{a.decided_by_email ? ` · decided by ${a.decided_by_email}` : ""}{a.confirmed_by_email ? ` · confirmed by ${a.confirmed_by_email}` : ""}</p>
          <p className="break-all font-mono text-[10.5px] text-muted">hash {a.evidence_hash.slice(0, 16)}…</p>
          {a.status === "PROPOSED" && isSuper && a.canDecide && !a.heldReason && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button disabled={!!busy || !a.canDecide} onClick={() => run(`pa-${a.id}`, { action: "payout-approve", id: a.id }, "Payout approved")}>Review & Approve Payout</Button>
              <button type="button" disabled={!!busy} onClick={() => run(`pr-${a.id}`, { action: "payout-reject", id: a.id }, "Rejected")} className="rounded-xl border border-danger/40 px-3 py-2 text-[12px] font-black text-danger disabled:opacity-50">Reject</button>
            </div>
          )}
          {a.status === "PROPOSED" && isSuper && !a.canDecide && !a.heldReason && <p className="mt-1 text-[11px] text-warning">Waiting for a different super admin — the proposer cannot approve their own proposal.</p>}
          {a.status === "APPROVED" && isSuper && a.canConfirm && !a.heldReason && (
            <button type="button" disabled={!!busy} onClick={() => { if (confirm(`Confirm payout of ${a.points} FLOW? This records the decision and prepares the unsigned settlement batch; the publisher still signs.`)) run(`pc-${a.id}`, { action: "payout-confirm", id: a.id, hash: a.evidence_hash }, "Payout CONFIRMED — unsigned batch prepared"); }} className="mt-2 w-full rounded-xl bg-primary px-3 py-2 text-[12px] font-black text-primary-foreground disabled:opacity-50 sm:w-auto">{busy === `pc-${a.id}` ? "Confirming…" : "Confirm & Prepare Distribution"}</button>
          )}
          {!isSuper && (a.status === "PROPOSED" || a.status === "APPROVED") && <p className="mt-1 text-[11px] text-warning">Waiting for a super admin.</p>}
        </div>
      ))}
      {s.candidates.length === 0 && s.approvals.filter((a) => a.status === "PROPOSED" || a.status === "APPROVED").length === 0 && <p className="rounded-xl border border-hairline bg-card p-3 text-[12px] text-muted">No verified eligible Points awaiting payout approval.</p>}
      {s.candidates.map((c) => (
        <div key={c.userId} className="rounded-xl border border-hairline bg-card p-3">
          <div className="flex items-start justify-between gap-2"><p className="min-w-0 text-[12.5px] font-black">{fmt(c.availablePoints)} FLOW available → {c.wallet.slice(0, 6)}…{c.wallet.slice(-4)}</p><Chip s="PENDING" /></div>
          <p className="text-[11px] text-muted">Funded {fmt(c.fundedPoints)} · already settled {fmt(c.alreadySettledPoints)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input inputMode="numeric" aria-label="Payout amount" className="w-28 rounded-lg border border-hairline bg-background px-2 py-1.5 text-[12px] tabular-nums" placeholder={String(c.availablePoints)} value={amounts[c.userId] ?? ""} onChange={(e) => setAmounts((m) => ({ ...m, [c.userId]: e.target.value.replace(/[^0-9]/g, "") }))} />
            <Button disabled={!!busy} onClick={() => run(`pp-${c.userId}`, { action: "payout-propose", userId: c.userId, points: Number(amounts[c.userId] || c.availablePoints) }, "Payout proposed; a different super admin must approve.")}>Review & Propose Payout</Button>
          </div>
        </div>
      ))}
      {s.excluded.length > 0 && (
        <div className="rounded-xl border border-hairline bg-card p-3">
          <p className="mb-1 text-[11px] font-bold">Excluded (never proposed)</p>
          {Object.entries(s.excluded.reduce((m: Record<string, { n: number; pts: number }>, e) => { const k = e.reason; (m[k] ??= { n: 0, pts: 0 }); m[k].n++; m[k].pts += e.points; return m; }, {})).map(([k, v]) => <p key={k} className="flex justify-between gap-2 text-[11.5px]"><span className="font-mono">{k}</span><span className="tabular-nums">{v.n} accounts · {fmt(v.pts)} pts</span></p>)}
        </div>
      )}
    </div>
  );
}

export function RewardsControlCenter({ wallet, onOpen }: { wallet: string | undefined; onOpen: (tab: "Rewards" | "Budgets") => void }) {
  const qc = useQueryClient();
  const [section, setSection] = useState<Section>("Rewards Operations");
  const [busy, setBusy] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["rewards-control", wallet], queryFn: () => {
    if (!wallet) throw new Error("Connect the wallet bound to your admin account.");
    return call(wallet) as Promise<State>;
  }, enabled: !!wallet, refetchInterval: 30_000, retry: false });
  const act = async (key: string, body: Record<string, unknown>, ok: string) => {
    if (!wallet || busy) return;
    setBusy(key);
    try { const r = await call(wallet, body); if(r?.ok===false)throw new Error(r.error??'Action rejected.'); toast.success(r?.outcome === "STALE" ? "Snapshot was stale — nothing funded. Create a new one." : ok); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); qc.invalidateQueries({ queryKey: ["rewards-control"] }); }
  };

  if (!wallet) return <p className="rounded-xl border border-hairline bg-card p-3 text-[12px] text-muted">Connect the wallet bound to your admin account.</p>;
  if (q.isLoading) return <p className="text-[12px] text-muted">Loading control center…</p>;
  if (q.error || !q.data) return <div role="alert" className="space-y-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-[12px] text-danger"><p>{q.error?.message ?? "Control center unavailable."}</p><Button variant="outline" size="sm" disabled={q.isFetching} onClick={() => q.refetch()}><RefreshCw />Retry Control Center</Button></div>;
  const s = q.data;
  const isSuper = s.viewer.role === "super_admin";
  const open = s.snapshots.filter((x) => x.status === "PROPOSED" || x.status === "APPROVED");
  const openExc = s.exceptions.filter((e) => e.status === "OPEN");
  const queued = s.fundingQueue.reduce((t, p) => t + p.points, 0);

  // One primary next action.
  let next: { state: string; text: string; run?: () => void; label?: string };
  const approved = open.find((x) => x.status === "APPROVED");
  const proposed = open.find((x) => x.status === "PROPOSED");
  if (approved) next = { state: isSuper ? "READY" : "NEEDS APPROVAL", text: `Approved funding of ${fmt(approved.total_points)} Points is waiting for confirmation.`, label: "Review & Confirm Funding", run: isSuper ? () => setSection("Funding Approvals") : undefined };
  else if (proposed) next = { state: "NEEDS APPROVAL", text: `A ${fmt(proposed.total_points)}-Point funding proposal needs super-admin approval.`, label: "Review & Approve Funding", run: () => setSection("Funding Approvals") };
  else if (queued > 0) next = { state: "PENDING", text: `${fmt(queued)} verified Points are waiting for a funding proposal.`, label: "Review & Approve Funding", run: () => setSection("Funding Queue") };
  else if(s.round3.heldPoints>0 || s.fundingOverview.exceptionCount>0) next={state:'BLOCKED',text:`${fmt(s.round3.heldPoints)} Round #3 Points remain held. Historical valuation exceptions require independent approval.`,label:'Review exceptions',run:()=>setSection('Evidence Review')};
  else next = { state: "READY", text: "No funding work pending. Check Settlement / Review & Publish for eligible wallets.", label: "Open Review & Publish", run: () => onOpen("Rewards") };

  return (
    <section className="space-y-3">
      {section !== 'Payout Operations' && section !== 'Rewards Operations' && <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3">
        <div className="flex items-start justify-between gap-2"><p className="min-w-0 text-[12.5px] font-bold">{next.text}</p><Chip s={next.state} /></div>
        {next.run && <Button onClick={next.run} className="mt-2 w-full sm:w-auto">{next.label}</Button>}
        {openExc.length > 0 && <p className="mt-2 text-[11px] font-bold text-warning">{openExc.length} open exception(s) need attention.</p>}
      </div>}

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {SECTIONS.map((t) => <button key={t} type="button" onClick={() => setSection(t)} className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-bold ${section === t ? "border-primary/50 bg-primary/12 text-primary" : "border-hairline bg-card text-muted"}`}>{t}</button>)}
        <button type="button" onClick={() => onOpen("Rewards")} className="shrink-0 rounded-full border border-hairline bg-card px-3 py-1 text-[11px] font-bold text-muted">Settlement & Publish ↗</button>
        <button type="button" onClick={() => onOpen("Budgets")} className="shrink-0 rounded-full border border-hairline bg-card px-3 py-1 text-[11px] font-bold text-muted">Budgets ↗</button>
      </div>

      <RewardsPipeline />
      {section === "Rewards Operations" && (
        <div className="space-y-2">
          <div className="rounded-xl border border-hairline bg-card p-3 text-[12px]">
            <p className="font-black">Funding exceptions</p>
            {s.fundingQueue.filter((p) => { const b = s.budgets.find((x) => x.program_id === p.programId); return !b || b.status !== "ACTIVE" || !b.funding_verified; }).map((p) => <p key={p.programId} className="text-warning">{p.programId}: {fmt(p.points)} verified Points held — program budget not funding-verified.</p>)}
            {openExc.slice(0, 3).map((e) => <p key={e.id} className="text-muted">{e.detail}</p>)}
            {openExc.length === 0 && s.fundingQueue.every((p) => { const b = s.budgets.find((x) => x.program_id === p.programId); return b && b.status === "ACTIVE" && b.funding_verified; }) && <p className="text-muted">No funding exceptions.</p>}
            {openExc.length > 3 && <button type="button" onClick={() => setSection("Exceptions")} className="mt-1 text-[11.5px] font-bold text-primary">View all {openExc.length} exceptions</button>}
          </div>
          <AutoBudget wallet={wallet} isSuper={isSuper} busy={busy} act={act} />
          <NextBatchCard wallet={wallet} onOpen={() => onOpen("Rewards")} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSection("Approval Queue")} className="rounded-xl border border-hairline px-3 py-1.5 text-[11.5px] font-bold">Approval records</button>
            <button type="button" onClick={() => setSection("Audit History")} className="rounded-xl border border-hairline px-3 py-1.5 text-[11.5px] font-bold">Audit history</button>
          </div>
        </div>
      )}
      {section === 'Payout Operations' && <PayoutOperations wallet={wallet}/>}
      {section === 'Approval Queue' && <ApprovalQueue wallet={wallet} isSuper={isSuper} busy={busy} act={act} />}
      {section === 'Evidence Review' && <EvidenceReview wallet={wallet} role={s.viewer.role}/>}
      {section === "Overview" && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Verified qualifying Points", fmt(s.fundingOverview.verifiedQualifyingPoints)], ["Wallet count", fmt(s.fundingOverview.walletCount)],
            ["Funding amount · FLOW", fmt(s.fundingOverview.fundingAmount)], ["Available backing · FLOW",fmt(s.fundingOverview.availableBackingFlow)],
            ["Available budget · Points",fmt(s.fundingOverview.availableBudget)], ["Valuation exceptions",fmt(s.fundingOverview.exceptionCount)],
            ["Already funded · Points",fmt(s.fundingOverview.alreadyFundedPoints)], ["Settled on-chain · FLOW",fmt(s.fundingOverview.settledFlow)],
          ].map(([k, v]) => <div key={k} className="min-w-0 rounded-xl border border-hairline bg-card p-2.5"><p className="text-[10.5px] text-muted">{k}</p><p className="break-words text-[15px] font-black tabular-nums">{v}</p></div>)}
          <div className="col-span-2 rounded-xl border border-hairline bg-card p-2.5 sm:col-span-4">
            <p className="mb-1 text-[11px] font-bold">Program budgets (ceilings are not claimable FLOW)</p>
            {s.budgets.map((b) => <p key={b.program_id} className="flex justify-between gap-2 text-[11.5px]"><span className="font-mono">{b.program_id}</span><span className="tabular-nums">{fmt(b.reserved_points)} reserved / {fmt(b.total_points)}</span></p>)}
          </div>
        </div>
      )}

      {section === "Funding Queue" && (
        <div className="space-y-2">
          {s.fundingQueue.length === 0 && <p className="rounded-xl border border-hairline bg-card p-3 text-[12px] text-muted">No verified unfunded Points.</p>}
          {s.fundingQueue.map((p) => (
            <div key={p.programId} className="rounded-xl border border-hairline bg-card p-3">
              <div className="flex items-start justify-between gap-2"><p className="font-mono text-[12px] font-black">{p.programId}</p><Chip s="PENDING" /></div>
              <p className="mt-1 text-[12px]"><b className="tabular-nums">{fmt(p.points)}</b> Points · {p.rows} records · {p.accounts} accounts{p.unlabelled ? ` · ${p.unlabelled} unlabelled (labelled ${p.programId} on confirm)` : ""}</p>
              <p className="mt-1 break-words text-[11px] text-muted">Per account (anonymous): {p.accountBreakdown.map(fmt).join(" · ")}</p>
              {(() => { const b = s.budgets.find((x) => x.program_id === p.programId); return b && (b.status !== "ACTIVE" || !b.funding_verified) ? <p className="mt-2 text-[11.5px] font-bold text-warning">Funding exception: the {p.programId} budget is not funding-verified. These Points stay held until a super admin verifies backing for this program.</p> : null; })()}
              <Button disabled={!!busy || open.some((x) => x.program_id === p.programId) || (() => { const b = s.budgets.find((x) => x.program_id === p.programId); return !b || b.status !== "ACTIVE" || !b.funding_verified; })()} onClick={() => act("propose", { action: "propose", programId: p.programId }, "Funding proposed; a different super admin must approve.")} className="mt-2 w-full sm:w-auto">{open.some((x) => x.program_id === p.programId) ? "Proposal already open" : "Propose funding for approval"}</Button>
            </div>
          ))}
          <div className="rounded-xl border border-hairline bg-card p-3">
            <p className="mb-1 text-[11px] font-bold">Excluded (never funded from the queue)</p>
            {Object.entries(s.exclusions).map(([k, v]) => <p key={k} className="flex justify-between gap-2 text-[11.5px]"><span className="font-mono">{k}</span><span className="tabular-nums">{v.rows} rows · {fmt(v.points)} pts</span></p>)}
          </div>
        </div>
      )}

      {section === "Funding Approvals" && (
        <div className="space-y-2">
          {s.snapshots.length === 0 && <p className="text-[12px] text-muted">No funding snapshots yet.</p>}
          {s.snapshots.map((x) => (
            <div key={x.id} className="rounded-xl border border-hairline bg-card p-3">
              <div className="flex items-start justify-between gap-2"><p className="min-w-0 text-[12.5px] font-black">{x.program_id} · {fmt(x.total_points)} Points</p><Chip s={x.status === "PROPOSED" ? "NEEDS APPROVAL" : x.status} /></div>
              <p className="text-[11.5px]">{x.row_count} records · {x.account_count} accounts · {new Date(x.created_at).toLocaleString()}</p>
              <p className="break-all font-mono text-[10.5px] text-muted">hash {x.snapshot_hash}</p>
              <p className="text-[11px] text-muted">Proposed by {x.proposed_by_email}{x.approved_by_email ? ` · decided by ${x.approved_by_email}` : ""}{x.confirmed_at ? ` · confirmed ${new Date(x.confirmed_at).toLocaleString()}` : ""}</p>
              {x.status === "PROPOSED" && isSuper && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button disabled={!!busy || !x.canApprove} onClick={() => act("approve", { action: "approve", id: x.id }, "Approved")}>Review & Approve Funding</Button>
                  <button type="button" disabled={!!busy} onClick={() => act("reject", { action: "reject", id: x.id }, "Rejected")} className="rounded-xl border border-danger/40 px-3 py-2 text-[12px] font-black text-danger disabled:opacity-50">Reject</button>
                </div>
              )}
              {x.status === "APPROVED" && isSuper && (
                <button type="button" disabled={!!busy} onClick={() => { if (confirm(`Confirm off-chain funding of ${x.total_points} Points? This reserves budget atomically and cannot be repeated.`)) act("confirm", { action: "confirm", id: x.id, hash: x.snapshot_hash }, "Funding CONFIRMED"); }} className="mt-2 w-full rounded-xl bg-primary px-3 py-2 text-[12px] font-black text-primary-foreground disabled:opacity-50 sm:w-auto">{busy === "confirm" ? "Confirming…" : "Review & Confirm Funding"}</button>
              )}
              {!isSuper && (x.status === "PROPOSED" || x.status === "APPROVED") && <p className="mt-1 text-[11px] text-warning">Waiting for a super admin.</p>}
            </div>
          ))}
        </div>
      )}

      {section === "Exceptions" && (
        <div className="space-y-2">
          {s.exceptions.length === 0 && <p className="text-[12px] text-muted">No exceptions recorded.</p>}
          {s.exceptions.map((e) => (
            <div key={e.id} className="rounded-xl border border-hairline bg-card p-3">
              <div className="flex items-start justify-between gap-2"><p className="font-mono text-[12px] font-black">{e.kind}</p><Chip s={e.status === "OPEN" ? (e.severity === "BLOCK" ? "BLOCKED" : "PENDING") : "CONFIRMED"} /></div>
              <p className="text-[12px]">{e.detail}</p>
              {e.corrective_action && <p className="text-[11.5px] text-muted">Fix: {e.corrective_action}</p>}
              {e.status === "OPEN" && <button type="button" disabled={!!busy} onClick={() => act("res", { action: "resolve-exception", id: e.id }, "Marked resolved")} className="mt-2 rounded-xl border border-hairline px-3 py-1.5 text-[11.5px] font-bold">Mark resolved</button>}
            </div>
          ))}
        </div>
      )}

      {section === "Automation & Budgets" && (
        <div className="space-y-2">
          <p className="rounded-xl border border-hairline bg-card p-3 text-[12px]">Scheduled sweep verifies events, eligibility, solvency and duplicates and records exceptions. <b>Autonomous funding: OFF (not authorized). On-chain signing: OFF.</b> Last run: {s.automation.lastRuns[0] ? `${new Date(s.automation.lastRuns[0].ran_at).toLocaleString()} (${s.automation.lastRuns[0].source})` : "never"}</p>
          <AutoBudget wallet={wallet} isSuper={isSuper} busy={busy} act={act} />
          <button type="button" disabled={!!busy} onClick={() => act("sweep", { action: "sweep" }, "Sweep complete")} className="rounded-xl border border-hairline px-3 py-2 text-[12px] font-bold">Run checks now</button>
          {s.automation.policies.map((p) => (
            <div key={p.program_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline bg-card p-3 text-[12px]">
              <span className="font-mono font-bold">{p.program_id}</span>
              <span>auto-funding {p.auto_funding_enabled ? "ON" : "OFF"} · caps {fmt(p.per_run_cap)}/{fmt(p.daily_cap)}</span>
              {isSuper && <button type="button" disabled={!!busy} onClick={() => act("auto", { action: "automation", programId: p.program_id, suspended: !p.suspended }, "Updated")} className={`rounded-xl border px-3 py-1.5 font-bold ${p.suspended ? "border-danger/40 text-danger" : "border-hairline"}`}>{p.suspended ? "Suspended — resume" : "Emergency suspend"}</button>}
            </div>
          ))}
        </div>
      )}

      {section === "Audit History" && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <button type="button" onClick={() => download("rewards-audit.json", s.audit)} className="rounded-xl border border-hairline px-3 py-1.5 text-[11.5px] font-bold">Download audit</button>
            <button type="button" onClick={() => download("rewards-control-report.json", { ...s, viewer: undefined })} className="rounded-xl border border-hairline px-3 py-1.5 text-[11.5px] font-bold">Download full report</button>
          </div>
          {s.audit.map((a, i) => (
            <div key={i} className="rounded-xl border border-hairline bg-card p-2.5 text-[11.5px]">
              <p className="flex flex-wrap justify-between gap-1"><b>{a.object_type} · {a.action}</b><span className="text-muted">{new Date(a.created_at).toLocaleString()}</span></p>
              <p className="break-all text-muted">{a.actor_email ?? "system"} ({a.actor_role}) · {a.object_id}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
