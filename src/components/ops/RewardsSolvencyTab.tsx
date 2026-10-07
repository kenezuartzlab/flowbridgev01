import { useQuery } from "@tanstack/react-query";
import { getIdToken } from "@/lib/auth";
import type { RewardSolvencyReport } from "@/lib/rewards/rewardSolvency.server";

async function load(wallet?: string): Promise<RewardSolvencyReport> {
  const token = await getIdToken();
  const h: Record<string, string> = {};
  if (token) h.authorization = `Bearer ${token}`;
  if (wallet) h["x-wallet-address"] = wallet;
  const res = await fetch("/api/admin/rewards-solvency", { headers: h });
  if (!res.ok) throw new Error("unavailable");
  return res.json();
}

const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString());

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border border-hairline bg-card p-3.5 sm:p-4">
      <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.14em] text-muted">{title}</h2>
      <div className="mt-3 min-w-0 space-y-1">{children}</div>
    </section>
  );
}
function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border-b border-hairline py-1.5 text-[12.5px] last:border-0">
      <span className="min-w-0 truncate text-muted">{k}</span>
      <span className="min-w-0 truncate text-right font-mono font-bold text-foreground">{v}</span>
    </div>
  );
}

export function RewardsSolvencyTab({ wallet }: { wallet?: string }) {
  const q = useQuery({ queryKey: ["rewards-solvency", wallet], queryFn: () => load(wallet), retry: 1 });
  if (q.isLoading) return <p className="text-[13px] text-muted">Reading reward ledgers and payout contract…</p>;
  if (q.isError || !q.data) return <p className="text-[13px] text-danger">Reward solvency is UNKNOWN until the report loads.</p>;
  const r = q.data;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Box title="Claims">
        <KV k="Mainnet FLOW claims" v={r.claims.mainnet} />
        <p className="text-[11.5px] leading-snug text-muted-soft">{r.claims.reason}</p>
        <KV k="Payout contract" v={`${r.distributor.address.slice(0, 6)}…${r.distributor.address.slice(-4)}`} />
        <KV k="Free FLOW (on-chain)" v={r.distributor.live ? fmt(r.distributor.live.freeFlow) : "UNKNOWN"} />
        <KV k="Reserved FLOW (on-chain)" v={r.distributor.live ? fmt(r.distributor.live.reservedFlow) : "UNKNOWN"} />
      </Box>
      <Box title="Historical reconciliation">
        <KV k="Status" v={r.reconciliation.pass ? "PASS" : "BLOCKED"} />
        <KV k="Accounts audited" v={r.reconciliation.accounts} />
        {Object.entries(r.reconciliation.counts).map(([k, v]) => <KV key={k} k={k.replaceAll("_", " ")} v={v} />)}
        <KV k="Ledger-backed total" v={fmt(r.reconciliation.authoritativeTotal)} />
        <KV k="Pending review" v={fmt(r.reconciliation.pendingReviewTotal)} />
        <KV k="Historical — not claimable" v={fmt(r.reconciliation.nonclaimableHistoricalTotal)} />
        <KV k="Testnet points excluded" v={fmt(r.reconciliation.testnetExcludedTotal)} />
      </Box>
      {r.programs.map((p) => (
        <Box key={p.programId} title={p.programId.replaceAll("_", " ")}>
          <KV k="Authorized budget" v={fmt(p.authorizedBudget)} />
          <KV k="Backing" v={p.backingLabel} />
          <KV k="Reserved" v={fmt(p.reserved)} />
          <KV k="Earned" v={fmt(p.earned)} />
          <KV k="Claimed" v={fmt(p.claimed)} />
          <KV k="Remaining" v={fmt(p.remaining)} />
          <KV k="Unfunded / pending liability" v={fmt(p.unfunded)} />
          <KV k="Invariant" v={p.invariantOk ? "OK" : "VIOLATED"} />
        </Box>
      ))}
      {(["swap", "milestone"] as const).map((k) => (
        <Box key={k} title={k === "swap" ? "Swap funding proposal" : "Referral milestone funding proposal"}>
          {r.funding[k].map((o) => <KV key={o.name} k={o.name} v={`${fmt(o.flowRequired)} FLOW`} />)}
          <p className="text-[11px] leading-snug text-muted-soft">Proposal only — nothing is funded. {r.funding[k][0]?.assumptions.join(" · ")}</p>
        </Box>
      ))}
      <Box title="Funding preparation (unsigned)">
        <KV k="Total required backing" v={`${fmt(r.fundingPreparation.totalRequired)} FLOW`} />
        <KV k="Live free FLOW" v={r.fundingPreparation.liveFreeFlow == null ? "UNKNOWN" : fmt(r.fundingPreparation.liveFreeFlow)} />
        <KV k="Additional FLOW required" v={r.fundingPreparation.additionalRequiredFlow == null ? "UNKNOWN" : fmt(r.fundingPreparation.additionalRequiredFlow)} />
        <KV k="On-chain budget headroom" v={r.fundingPreparation.liveCampaignBudgetFlow == null ? "UNKNOWN" : `${fmt(r.fundingPreparation.liveCampaignBudgetFlow)} FLOW`} />
        <KV k="Owner action" v={r.fundingPreparation.budgetTx.method} />
        <KV k="Draft first allocation" v={`${r.draftAllocation.leaves} wallet(s) · ${fmt(r.draftAllocation.totalPoints)} FLOW · not published`} />
      </Box>
      <Box title={`Next settlement batch: ${r.settlement.status === "READY_FOR_PUBLISHER_REVIEW" ? "READY FOR SIGNER REVIEW" : "NOT READY"}`}>
        <KV k="Signer (single)" v={`${r.settlement.signer.address.slice(0, 8)}…${r.settlement.signer.address.slice(-4)}`} />
        {r.settlement.epochId != null && <KV k="Round" v={`#${r.settlement.epochId}`} />}
        <KV k="Payout list" v={`${r.settlement.leaves} wallet(s) · ${fmt(r.settlement.totalFlow)} FLOW`} />
        {r.settlement.claimStartIso && <KV k="Claim window" v={`${r.settlement.claimStartIso.slice(0, 16)} → ${r.settlement.claimEndIso?.slice(0, 16)} UTC`} />}
        {r.settlement.reason && <KV k="Waiting on" v={r.settlement.reason.replaceAll("_", " ")} />}
        {r.settlement.checks.map((c) => <KV key={c.id} k={c.id.replaceAll("_", " ")} v={c.pass ? "PASS" : "FAIL"} />)}
        {r.settlement.tx && (
          <div className="space-y-1">
            <KV k="To" v={r.settlement.tx.to} />
            <p className="break-all font-mono text-[10px] text-muted">{r.settlement.tx.data}</p>
            <button type="button" className="rounded-md border border-border px-2 py-1 text-[11px]" onClick={() => navigator.clipboard?.writeText(r.settlement.tx!.data)}>Copy transaction data</button>
          </div>
        )}
        <p className="text-[11px] leading-snug text-muted-soft">Listed automatically from funded points. {r.settlement.signer.note}</p>
      </Box>
      {r.publication.map((p) => (
        <Box key={p.epochId} title={`Allocation round #${p.epochId} (${p.programId.replaceAll("_", " ")})`}>
          <KV k="State" v={p.published ? "PUBLISHED" : "PREPARED — NOT SIGNED"} />
          <KV k="Root" v={`${p.root.slice(0, 10)}…`} />
          <KV k="Allocation" v={`${p.allocationFlow} FLOW · ${p.leaves} wallet(s)`} />
          <KV k="Claim window" v={`${p.claimStartIso.slice(0, 16)} → ${p.claimEndIso.slice(0, 16)} UTC`} />
          <KV k="Must sign before" v={`${p.signBeforeIso.slice(0, 16)} UTC`} />
          <KV k="Signed / broadcast by app" v={`${p.signed ? "yes" : "no"} / ${p.broadcast ? "yes" : "no"}`} />
        </Box>
      ))}
      <Box title="Flagged accounts (opaque ids)">
        {r.reconciliation.flagged.length === 0 ? <p className="text-[12px] text-muted">None.</p> : r.reconciliation.flagged.map((f) => (
          <KV key={f.account} k={`${f.account} · ${f.classification.replaceAll("_", " ")}`} v={`stored ${f.stored} / ledger ${f.authoritative} / review ${f.pendingReview}`} />
        ))}
      </Box>
      <Box title={`Payout contract readiness: ${r.payout.sufficient ? "SUFFICIENT" : "BLOCKED"}`}>
        {r.payout.capabilities.map((c) => <KV key={c.capability} k={c.capability} v={c.supported ? "YES" : "NO"} />)}
      </Box>
    </div>
  );
}
