import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { getIdToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { PIPELINE } from "@/lib/rewards/evidenceReview";

type Review = { id: string; status: string; points: number; uncertainty: string; rationale: string; canDecide:boolean; proposed_by_email: string; created_at: string; decided_by_email?: string | null; decision_note?: string | null };
type Item = { id: string; points: number; funded: boolean; policyVersion: string | null; recordedUsd: number | null; txHash: string | null; earnedAt: string; review: Review | null; assessment?:{status:string;reasons:string[];condition:string;exceptionAllowed:boolean};evidence:unknown };
type Data = { pending: Item[]; decided: Review[];round3:{storedFlow:number|null;heldPoints:number;assessment:Record<string,{rows:number;points:number}>} };

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
  const [selected,setSelected]=useState<string[]>([]);
  const run = async (body: Record<string, unknown>, ok: string) => {
    if (busy) return; setBusy(true);
    try { await post(wallet, body); toast.success(ok); setOpen(null); setSelected([]); setForm({ rationale: "", uncertainty: "", priceSource: "", priceUsd: "" }); await q.refetch(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  if (q.isLoading) return <p className="text-[12px] text-muted">Loading rewards awaiting evidence review…</p>;
  if (q.error || !q.data) return <div role="alert" className="space-y-2 text-[12px] text-danger"><p>{(q.error as Error)?.message ?? "Unavailable."}</p><Button size="sm" variant="outline" onClick={() => q.refetch()}>Retry</Button></div>;
  const total = q.data.pending.reduce((t, i) => t + i.points, 0);
  const isSuper = role === "super_admin";
  return <div className="space-y-3 text-[12px]">
    <div className="border-b border-hairline pb-3"><p className="font-bold">Round #3 · {q.data.round3.storedFlow} FLOW · unchanged and unpublished</p><p className="text-muted">{q.data.round3.heldPoints} held Core Swap Points · read-only assessment</p>{Object.entries(q.data.round3.assessment).map(([k,v])=><p key={k}>{k.replaceAll('_',' ')} · {v.rows} records · {v.points} Points</p>)}</div>
    <div className="rounded-xl border border-warning/40 bg-warning/5 p-3">
      <p className="font-bold">{total.toLocaleString()} Points across {q.data.pending.length} reward(s) are held for historical evidence review.</p>
      <p className="mt-1 text-muted">Original valuation is not established by recorded USD alone. Only missing historical valuation documentation can be considered under HISTORICAL_PRICING_EXCEPTION_V1. Wallet, duplicate, restriction and policy blockers cannot be waived. Approval preserves amounts and existing reservations; it does not fund or publish.</p>
    </div>
    {selected.length>0 && <div className="space-y-2 border-y border-hairline py-3"><p className="font-bold">{selected.length} selected · {q.data.pending.filter(i=>selected.includes(i.id)).reduce((s,i)=>s+i.points,0)} Points</p>
      <Textarea aria-label="Batch review rationale" placeholder="Reason for this historical valuation exception" value={form.rationale} onChange={e=>setForm({...form,rationale:e.target.value})}/>
      <Textarea aria-label="Batch uncertainty" placeholder="Document the shared missing evidence" value={form.uncertainty} onChange={e=>setForm({...form,uncertainty:e.target.value})}/>
      <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy || q.data.pending.some(i=>selected.includes(i.id)&&!!i.review)} onClick={()=>run({action:'evidence-batch-propose',ids:selected,rationale:form.rationale,uncertainty:form.uncertainty},'Batch proposals saved for independent review.')}>Propose selected exceptions</Button><Button size="sm" disabled={busy || !isSuper || q.data.pending.some(i=>selected.includes(i.id)&&!i.review?.canDecide)} onClick={()=>run({action:'evidence-batch-approve',ids:q.data.pending.filter(i=>selected.includes(i.id)).map(i=>i.review?.id),rationale:form.rationale,uncertainty:form.uncertainty},'Selected exceptions approved; original reservations preserved.')}>Approve selected exceptions</Button><Button variant="ghost" size="sm" onClick={()=>setSelected([])}>Clear selection</Button></div></div>}
    {q.data.pending.map((i) => <div key={i.id} className="rounded-xl border border-hairline bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 font-bold"><input type="checkbox" aria-label={`Select ${i.points} Point record from ${i.earnedAt}`} checked={selected.includes(i.id)} disabled={!i.assessment?.exceptionAllowed || (selected.length>0 && q.data.pending.find(x=>selected.includes(x.id))?.assessment?.condition!==i.assessment.condition) || selected.length>=50 && !selected.includes(i.id)} onChange={e=>setSelected(e.target.checked?[...selected,i.id]:selected.filter(id=>id!==i.id))}/>{i.points.toLocaleString()} Points · {i.funded ? "already funded, held from payout" : "not yet funded"}</label>
        <span className="rounded-full border border-hairline px-2 py-0.5 text-[10px] font-black">{i.review ? "EXCEPTION PROPOSED" : i.assessment?.status.replaceAll('_',' ') ?? 'ASSESSMENT UNAVAILABLE'}</span>
      </div>
      <p className="mt-1 text-muted">Earned {i.earnedAt.slice(0, 10)} · policy {i.policyVersion ?? "—"} · recorded value ${i.recordedUsd ?? "—"}</p>
      <p className="text-warning">{i.assessment?.reasons.map(r=>r.replaceAll('_',' ')).join(' · ')}</p>
      <details className="mt-1"><summary className="cursor-pointer text-muted">Existing transaction, calculation and reservation evidence</summary><p className="break-all font-mono text-[10.5px] text-muted">{i.txHash}</p><pre className="whitespace-pre-wrap break-all text-[10px] text-muted">{JSON.stringify(i.evidence,null,2)}</pre></details>
      {i.review ? <div className="mt-2 space-y-1 border-l-2 border-primary pl-3">
        <p><b>Proposed by</b> {i.review.proposed_by_email} · {i.review.created_at.slice(0, 16).replace("T", " ")}</p>
        <p><b>Rationale:</b> {i.review.rationale}</p><p><b>Uncertainty:</b> {i.review.uncertainty}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" disabled={busy || !i.review.canDecide || !i.assessment?.exceptionAllowed} onClick={() => {const review=i.review;if(review)void run({ action: "evidence-approve", id: review.id }, i.funded?'Exception approved. Original funding reservation preserved.':'Exception approved. Funding still requires separate approval.');}}>Approve exception</Button>
          <Button size="sm" variant="outline" disabled={busy || !i.review.canDecide} onClick={() => {const review=i.review;if(review)void run({ action: "evidence-reject", id: review.id }, "Exception rejected. The reward stays excluded.");}}>Reject</Button>
        </div>
        {!i.review.canDecide && <p className="text-warning">Waiting for a different super admin.</p>}
      </div> : open === i.id ? <div className="mt-2 space-y-2">
        <Input placeholder="Historical price source, only if available (optional)" value={form.priceSource} onChange={(e) => setForm({ ...form, priceSource: e.target.value })} maxLength={500} />
        <Input placeholder="Historical price in USD, if found" inputMode="decimal" value={form.priceUsd} onChange={(e) => setForm({ ...form, priceUsd: e.target.value })} />
        <Textarea placeholder="Why this reward should count (at least 20 characters)" value={form.rationale} onChange={(e) => setForm({ ...form, rationale: e.target.value })} maxLength={2000} />
        <Textarea placeholder="What remains uncertain" value={form.uncertainty} onChange={(e) => setForm({ ...form, uncertainty: e.target.value })} maxLength={1000} />
        <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => run({ action: "evidence-propose", id: i.id, rationale: form.rationale, uncertainty: form.uncertainty, priceSource: form.priceSource || undefined, priceUsd: form.priceUsd ? Number(form.priceUsd) : undefined }, "Exception proposed for review.")}>Submit for review</Button><Button size="sm" variant="outline" onClick={() => setOpen(null)}>Cancel</Button></div>
      </div> : <Button size="sm" variant="outline" className="mt-2" disabled={!i.assessment?.exceptionAllowed} onClick={() => {setOpen(i.id);setForm({rationale:'',uncertainty:'Original historical price archive is unavailable.',priceSource:'',priceUsd:''});}}>Review exception</Button>}
    </div>)}
    {q.data.decided.length > 0 && <details><summary className="cursor-pointer font-bold">Decided reviews ({q.data.decided.length})</summary>
      {q.data.decided.map((d) => <p key={d.id} className="mt-1 text-muted">{d.status} · {d.points} Points · {d.decided_by_email ?? "—"} · {d.rationale}</p>)}
    </details>}
  </div>;
}
