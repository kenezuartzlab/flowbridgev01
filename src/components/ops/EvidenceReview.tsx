import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getIdToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { PIPELINE } from "@/lib/rewards/evidenceReview";

type Review = { id: string; status: string; points: number; uncertainty: string; rationale: string; proposedBy: string; proposed_by_email: string; created_at: string; decided_by_email?: string | null; decision_note?: string | null };
type Item = { id: string; points: number; funded: boolean; policyVersion: string | null; recordedUsd: number | null; txHash: string | null; earnedAt: string; review: Review | null };
type Data = { pending: Item[]; decided: Review[] };

async function post(wallet: string, body: Record<string, unknown>) {
  const token = await getIdToken();
  if (!token) throw new Error("Sign in again and reconnect your bound wallet.");
  const res = await fetch("/api/admin/rewards-control", { method: "POST", headers: { authorization: `Bearer ${token}`, "x-wallet-address": wallet, "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j?.ok === false) throw new Error(j?.error ?? "Action failed; nothing was changed.");
  return j;
}

export function RewardsPipeline() {
  return <ol className="flex flex-wrap items-center gap-1 text-[11px] font-bold text-muted" aria-label="Reward stages">
    {PIPELINE.map((s, i) => <li key={s} className="flex items-center gap-1"><span className="rounded-full border border-hairline bg-card px-2 py-0.5">{s}</span>{i < PIPELINE.length - 1 && <span aria-hidden>→</span>}</li>)}
  </ol>;
}

export function EvidenceReview({ wallet, role }: { wallet: string; role: string }) {
  const q = useQuery({ queryKey: ["evidence-review", wallet], queryFn: () => post(wallet, { action: "evidence-list" }) as Promise<Data>, retry: false });
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ rationale: "", uncertainty: "", priceSource: "", priceUsd: "" });
  const [busy, setBusy] = useState(false);
  const run = async (body: Record<string, unknown>, ok: string) => {
    if (busy) return; setBusy(true);
    try { await post(wallet, body); toast.success(ok); setOpen(null); setForm({ rationale: "", uncertainty: "", priceSource: "", priceUsd: "" }); await q.refetch(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  if (q.isLoading) return <p className="text-[12px] text-muted">Loading rewards awaiting evidence review…</p>;
  if (q.error || !q.data) return <div role="alert" className="space-y-2 text-[12px] text-danger"><p>{(q.error as Error)?.message ?? "Unavailable."}</p><Button size="sm" variant="outline" onClick={() => q.refetch()}>Retry</Button></div>;
  const total = q.data.pending.reduce((t, i) => t + i.points, 0);
  const isSuper = role === "super_admin";
  return <div className="space-y-3 text-[12px]">
    <div className="rounded-xl border border-warning/40 bg-warning/5 p-3">
      <p className="font-bold">{total.toLocaleString()} Points across {q.data.pending.length} reward(s) are held for historical evidence review.</p>
      <p className="mt-1 text-muted">These trades are confirmed on BOT Mainnet, but the original price record is incomplete. Missing records are not evidence of fraud. A reward stays excluded until one admin proposes an exception with evidence and a different super admin approves it. Amounts never change here, and approval does not fund or publish anything.</p>
    </div>
    {q.data.pending.map((i) => <div key={i.id} className="rounded-xl border border-hairline bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold">{i.points.toLocaleString()} Points · {i.funded ? "already funded, held from payout" : "not yet funded"}</p>
        <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] font-black">{i.review ? "EXCEPTION PROPOSED" : "NEEDS EVIDENCE REVIEW"}</span>
      </div>
      <p className="mt-1 text-muted">Earned {i.earnedAt.slice(0, 10)} · policy {i.policyVersion ?? "—"} · recorded value ${i.recordedUsd ?? "—"} · trade verified on chain</p>
      <details className="mt-1"><summary className="cursor-pointer text-muted">Advanced details</summary><p className="break-all font-mono text-[10.5px] text-muted">{i.txHash}</p></details>
      {i.review ? <div className="mt-2 space-y-1 border-l-2 border-primary pl-3">
        <p><b>Proposed by</b> {i.review.proposed_by_email} · {i.review.created_at.slice(0, 16).replace("T", " ")}</p>
        <p><b>Rationale:</b> {i.review.rationale}</p><p><b>Uncertainty:</b> {i.review.uncertainty}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" disabled={busy || !isSuper} onClick={() => run({ action: "evidence-approve", id: i.review!.id }, "Exception approved. The reward can now enter the funding queue.")}>Approve exception</Button>
          <Button size="sm" variant="outline" disabled={busy || !isSuper} onClick={() => run({ action: "evidence-reject", id: i.review!.id }, "Exception rejected. The reward stays excluded.")}>Reject</Button>
        </div>
        {!isSuper && <p className="text-warning">Waiting for a different super admin.</p>}
      </div> : open === i.id ? <div className="mt-2 space-y-2">
        <Input placeholder="Historical price source (e.g. pool reserves at block, explorer)" value={form.priceSource} onChange={(e) => setForm({ ...form, priceSource: e.target.value })} maxLength={500} />
        <Input placeholder="Historical price in USD, if found" inputMode="decimal" value={form.priceUsd} onChange={(e) => setForm({ ...form, priceUsd: e.target.value })} />
        <Textarea placeholder="Why this reward should count (at least 20 characters)" value={form.rationale} onChange={(e) => setForm({ ...form, rationale: e.target.value })} maxLength={2000} />
        <Textarea placeholder="What remains uncertain" value={form.uncertainty} onChange={(e) => setForm({ ...form, uncertainty: e.target.value })} maxLength={1000} />
        <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => run({ action: "evidence-propose", id: i.id, rationale: form.rationale, uncertainty: form.uncertainty, priceSource: form.priceSource || undefined, priceUsd: form.priceUsd ? Number(form.priceUsd) : undefined }, "Exception proposed for review.")}>Submit for review</Button><Button size="sm" variant="outline" onClick={() => setOpen(null)}>Cancel</Button></div>
      </div> : <Button size="sm" variant="outline" className="mt-2" onClick={() => setOpen(i.id)}>Review evidence</Button>}
    </div>)}
    {q.data.decided.length > 0 && <details><summary className="cursor-pointer font-bold">Decided reviews ({q.data.decided.length})</summary>
      {q.data.decided.map((d) => <p key={d.id} className="mt-1 text-muted">{d.status} · {d.points} Points · {d.decided_by_email ?? "—"} · {d.rationale}</p>)}
    </details>}
  </div>;
}
