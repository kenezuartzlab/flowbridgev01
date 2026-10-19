import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePublicClient, useSendTransaction } from "wagmi";
import { getIdToken } from "@/lib/auth";
import { toast } from "sonner";

type Check = { id: string; pass: boolean; detail: string };
type Adjustment = {
  id: string; program_id: string; previous_budget: number; new_budget: number;
  committed_points: number; onchain_budget_required: number; status: string;
  proposed_by_email: string; approved_by_email: string | null; tx_hash: string | null;
  block_number: number | null; note: string | null; created_at: string;
};
type State = {
  distributor: string;
  budgetManagerRoleHolder: string;
  programs: { programId: string; totalPoints: number; reservedPoints: number; status: string; fundingVerified: boolean; committedPoints: number; earnedPoints: number }[];
  chain: null | { campaignBudgetFlow: number; budgetRemainingFlow: number; freeBalanceFlow: number; totalClaimedFlow: number; totalReservedFlow: number; epochCount: number; paused: boolean };
  requiredOnChainBudgetFlow: number | null;
  adjustments: Adjustment[];
};

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? "—" : Math.floor(n).toLocaleString());
const STATUS_TONE: Record<string, string> = {
  PROPOSED: "border-warning/40 bg-warning/10 text-warning",
  APPROVED_OFFCHAIN: "border-primary/40 bg-primary/10 text-primary",
  EXECUTED: "border-success/40 bg-success/10 text-success",
  REJECTED: "border-danger/40 bg-danger/10 text-danger",
};

async function api(wallet: string, action?: string, body: Record<string, unknown> = {}) {
  const token = await getIdToken();
  const h: Record<string, string> = { "x-wallet-address": wallet };
  if (token) h.authorization = `Bearer ${token}`;
  if (action) {
    const res = await fetch("/api/admin/rewards-budget", {
      method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ action, ...body }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((j as any)?.error ?? `Request failed (${res.status})`);
    return j as any;
  }
  const res = await fetch("/api/admin/rewards-budget", { headers: h });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((j as any)?.error ?? `Request failed (${res.status})`);
  return j as State;
}

function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className="space-y-1">
      {checks.map((c) => (
        <li key={c.id} className={`flex items-start gap-1.5 text-[11px] ${c.pass ? "text-success" : "text-danger"}`}>
          <span className="shrink-0 font-black">{c.pass ? "✓" : "✕"}</span>
          <span className="min-w-0 break-words"><span className="font-mono font-bold">{c.id}</span> — {c.detail}</span>
        </li>
      ))}
    </ul>
  );
}

export function BudgetControlsTab({ wallet }: { wallet: string }) {
  const qc = useQueryClient();
  const publicClient = usePublicClient({ chainId: 677 });
  const { sendTransactionAsync } = useSendTransaction();
  const [programId, setProgramId] = useState("CORE_SWAP");
  const [newBudget, setNewBudget] = useState("1000000");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [lastChecks, setLastChecks] = useState<Check[] | null>(null);

  const q = useQuery({
    queryKey: ["budget-controls", wallet],
    queryFn: () => api(wallet),
    refetchInterval: 30_000,
  });
  const s = q.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ["budget-controls", wallet] });

  const run = async (key: string, fn: () => Promise<any>) => {
    setBusy(key);
    setLastChecks(null);
    try {
      const r = await fn();
      if (r?.checks) setLastChecks(r.checks);
      if (r?.ok === false && r?.error) toast.error(r.error);
      else toast.success("Done");
      await refresh();
      return r;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const executeOnChain = async (a: Adjustment) => {
    setBusy(`exec-${a.id}`);
    try {
      const prep = await api(wallet, "prepare-tx", { id: a.id });
      if (!prep.ok) throw new Error(prep.error ?? "Cannot prepare transaction");
      const tx = prep.tx;
      // Simulate first (eth_call) — fails before the wallet prompt if the role is missing.
      await publicClient!.call({ account: wallet as `0x${string}`, to: tx.to, data: tx.data, value: 0n });
      const hash = await sendTransactionAsync({ to: tx.to, data: tx.data, value: 0n, chainId: 677 });
      toast.success(`Transaction sent: ${hash.slice(0, 12)}… — verifying receipt`);
      const conf = await api(wallet, "confirm", { id: a.id, txHash: hash });
      if (conf?.checks) setLastChecks(conf.checks);
      if (!conf?.ok) toast.error(conf?.error ?? "Verification failed — do NOT resend; use Re-check.");
      else toast.success("Budget updated and verified on-chain");
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (q.isLoading) return <p className="text-sm text-muted">Loading budget state…</p>;
  if (q.isError || !s) return <p className="text-sm text-danger">{(q.error as Error)?.message ?? "Unavailable"}</p>;

  const current = s.programs.find((p) => p.programId === programId);
  const proposed = Number(newBudget) || 0;
  const combinedAfter = s.programs.reduce((sum, p) => sum + (p.programId === programId ? proposed : p.totalPoints), 0) + (s.chain?.totalClaimedFlow ?? 0);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-hairline bg-card p-3.5 sm:p-4">
        <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.14em] text-muted">Program budgets (off-chain ceilings)</h2>
        <p className="mt-1 text-[11px] text-muted-soft">A ceiling is a spending limit, not claimable tokens. Funding is confirmed separately per program.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {s.programs.map((p) => (
            <div key={p.programId} className="min-w-0 rounded-xl border border-hairline p-3">
              <p className="font-mono text-[10px] font-black uppercase tracking-wider text-muted">{p.programId}</p>
              <p className="mt-1 text-lg font-black tabular-nums">{fmt(p.totalPoints)} <span className="text-[10px] font-bold text-muted">FLOW</span></p>
              <dl className="mt-1 space-y-0.5 text-[11px] text-muted-soft">
                <div className="flex justify-between"><dt>Reserved</dt><dd className="tabular-nums">{fmt(p.reservedPoints)}</dd></div>
                <div className="flex justify-between"><dt>Earned (all)</dt><dd className="tabular-nums">{fmt(p.earnedPoints)}</dd></div>
                <div className="flex justify-between"><dt>Remaining</dt><dd className="tabular-nums">{fmt(Math.max(0, p.totalPoints - p.reservedPoints))}</dd></div>
                <div className="flex justify-between"><dt>Funding verified</dt><dd>{p.fundingVerified ? "Yes" : "No"}</dd></div>
              </dl>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-hairline bg-card p-3.5 sm:p-4">
        <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.14em] text-muted">Live distributor capacity (BOT Mainnet 677)</h2>
        {s.chain ? (
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12px] sm:grid-cols-3">
            <div><dt className="text-muted">On-chain budget</dt><dd className="font-bold tabular-nums">{fmt(s.chain.campaignBudgetFlow)} FLOW</dd></div>
            <div><dt className="text-muted">Budget remaining</dt><dd className="font-bold tabular-nums">{fmt(s.chain.budgetRemainingFlow)} FLOW</dd></div>
            <div><dt className="text-muted">Free balance</dt><dd className="font-bold tabular-nums">{fmt(s.chain.freeBalanceFlow)} FLOW</dd></div>
            <div><dt className="text-muted">Reserved (on-chain)</dt><dd className="font-bold tabular-nums">{fmt(s.chain.totalReservedFlow)} FLOW</dd></div>
            <div><dt className="text-muted">Claimed (all-time)</dt><dd className="font-bold tabular-nums">{fmt(s.chain.totalClaimedFlow)} FLOW</dd></div>
            <div><dt className="text-muted">Paused</dt><dd className="font-bold">{s.chain.paused ? "YES" : "No"}</dd></div>
          </dl>
        ) : (
          <p className="mt-2 text-[12px] text-danger">Live chain state unavailable — proposals are blocked until it loads.</p>
        )}
        <p className="mt-2 break-all font-mono text-[10px] text-muted-soft">Distributor {s.distributor} · BUDGET_MANAGER_ROLE holder {s.budgetManagerRoleHolder}</p>
      </section>

      <section className="rounded-2xl border border-hairline bg-card p-3.5 sm:p-4">
        <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.14em] text-muted">Propose a budget change</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr]">
          <label className="text-[11px] font-bold text-muted">Program
            <select value={programId} onChange={(e) => setProgramId(e.target.value)} className="mt-1 w-full rounded-lg border border-hairline bg-background px-2 py-2 text-sm">
              {s.programs.map((p) => <option key={p.programId} value={p.programId}>{p.programId}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-bold text-muted">New ceiling (FLOW)
            <input value={newBudget} onChange={(e) => setNewBudget(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" className="mt-1 w-full rounded-lg border border-hairline bg-background px-2 py-2 text-sm tabular-nums" />
          </label>
        </div>
        <label className="mt-2 block text-[11px] font-bold text-muted">Reason (audit)
          <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-lg border border-hairline bg-background px-2 py-2 text-sm" placeholder="Owner approval reference" />
        </label>
        {current && (
          <div className="mt-3 rounded-xl border border-hairline bg-foreground/5 p-3 text-[12px]">
            <p className="font-bold">Before / after</p>
            <p className="mt-1 text-muted-soft">{current.programId}: {fmt(current.totalPoints)} → {fmt(proposed)} FLOW ({proposed - current.totalPoints >= 0 ? "+" : ""}{fmt(proposed - current.totalPoints)})</p>
            <p className="text-muted-soft">Combined ceilings after change: {fmt(combinedAfter)} FLOW · on-chain budget required: {fmt(combinedAfter)} FLOW</p>
            {s.chain && (
              <p className={combinedAfter > s.chain.campaignBudgetFlow ? "text-warning" : "text-success"}>
                {combinedAfter > s.chain.campaignBudgetFlow
                  ? `Requires on-chain setCampaignBudget(${fmt(combinedAfter)}) by the BUDGET_MANAGER_ROLE wallet.`
                  : "Current on-chain budget already covers this — no transaction needed."}
              </p>
            )}
          </div>
        )}
        <button
          disabled={busy !== null || !s.chain}
          onClick={() => run("propose", () => api(wallet, "propose", { programId, newBudget: proposed, note }))}
          className="mt-3 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground disabled:opacity-50 sm:w-auto"
        >
          {busy === "propose" ? "Validating…" : "Propose change"}
        </button>
        {lastChecks && <div className="mt-3"><CheckList checks={lastChecks} /></div>}
      </section>

      <section className="rounded-2xl border border-hairline bg-card p-3.5 sm:p-4">
        <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.14em] text-muted">Approval & execution history</h2>
        {s.adjustments.length === 0 && <p className="mt-2 text-[12px] text-muted-soft">No budget adjustments recorded yet.</p>}
        <ul className="mt-3 space-y-2">
          {s.adjustments.map((a) => (
            <li key={a.id} className="min-w-0 rounded-xl border border-hairline p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] font-black uppercase tracking-wider">{a.program_id}</span>
                <span className={`inline-flex rounded-full border px-2 py-0.5 font-mono text-[10px] font-black uppercase ${STATUS_TONE[a.status] ?? ""}`}>{a.status}</span>
                <span className="text-[11px] text-muted-soft">{new Date(a.created_at).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-[12px] tabular-nums">{fmt(a.previous_budget)} → <b>{fmt(a.new_budget)}</b> FLOW · on-chain required {fmt(a.onchain_budget_required)}</p>
              <p className="mt-0.5 break-all text-[10px] text-muted-soft">by {a.proposed_by_email}{a.approved_by_email ? ` · decided by ${a.approved_by_email}` : ""}{a.tx_hash ? ` · tx ${a.tx_hash} (block ${a.block_number ?? "?"})` : ""}</p>
              {a.note && <p className="mt-0.5 text-[11px] text-muted-soft">“{a.note}”</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {a.status === "PROPOSED" && (
                  <>
                    <button disabled={busy !== null} onClick={() => run(`ap-${a.id}`, () => api(wallet, "approve", { id: a.id }))} className="rounded-lg bg-success/15 px-3 py-1.5 text-[11px] font-black text-success disabled:opacity-50">Approve (super admin)</button>
                    <button disabled={busy !== null} onClick={() => run(`rj-${a.id}`, () => api(wallet, "reject", { id: a.id }))} className="rounded-lg bg-danger/15 px-3 py-1.5 text-[11px] font-black text-danger disabled:opacity-50">Reject</button>
                  </>
                )}
                {a.status === "APPROVED_OFFCHAIN" && (
                  <>
                    <button disabled={busy !== null} onClick={() => executeOnChain(a)} className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-black text-primary-foreground disabled:opacity-50">
                      {busy === `exec-${a.id}` ? "Executing…" : "Simulate & execute with wallet"}
                    </button>
                    <button disabled={busy !== null} onClick={() => run(`rc-${a.id}`, () => api(wallet, "recheck", { id: a.id }))} className="rounded-lg border border-hairline px-3 py-1.5 text-[11px] font-black disabled:opacity-50">Re-check on-chain</button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[10px] text-muted-soft">Automatic signing is OFF. Execution happens only when the BUDGET_MANAGER_ROLE wallet explicitly signs in its own wallet after simulation. Re-check never sends a transaction.</p>
      </section>
    </div>
  );
}
