import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getIdToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { PIPELINE } from "@/lib/rewards/evidenceReview";
import { groupedReviewState } from '@/lib/rewards/groupedEvidenceReview';

type Review = { id: string; group_id?:string|null; status: string; points: number; uncertainty: string; rationale: string; canDecide:boolean; proposed_by_email: string; created_at: string; decided_by_email?: string | null; decision_note?: string | null };
type Item = { id: string; points: number; funded: boolean; policyVersion: string | null; recordedUsd: number | null; txHash: string | null; earnedAt: string; review: Review | null; assessment?:{status:string;reasons:string[];condition:string;exceptionAllowed:boolean};evidence:{transactionStatus?:string;boundWallet?:string|null;reservation?:{id:string;points:number;program:string}|null} };
type Data = { pending: Item[]; decided: Review[];round3HeldIds:string[];round3:{storedFlow:number|null;heldPoints:number;assessment:Record<string,{rows:number;points:number}>} };

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
  const qc=useQueryClient();
  const q = useQuery({ queryKey: ["evidence-review", wallet], queryFn: () => post(wallet, { action: "evidence-list" }) as Promise<Data>, retry: false });
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ rationale: "", uncertainty: "", priceSource: "", priceUsd: "" });
  const [busy, setBusy] = useState(false);
  const [selected,setSelected]=useState<string[]>([]);
  const [groupOpen,setGroupOpen]=useState(false);
  const run = async (body: Record<string, unknown>, ok: string) => {
    if (busy) return; setBusy(true);
    try { const result=await post(wallet, body); toast.success(ok); if(result.recalculation?.status==='CHECKS_UNAVAILABLE')toast.warning('Review saved; eligibility checks are temporarily unavailable. Re-check Payout Operations.'); setOpen(null);setGroupOpen(false); setSelected([]); setForm({ rationale: "", uncertainty: "", priceSource: "", priceUsd: "" }); await q.refetch(); await qc.invalidateQueries({queryKey:['rewards-control']});await qc.invalidateQueries({queryKey:['payout-operations']}); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  if (q.isLoading) return <p className="text-[12px] text-muted">Loading rewards awaiting evidence review…</p>;
  if (q.error || !q.data) return <div role="alert" className="space-y-2 text-[12px] text-danger"><p>{(q.error as Error)?.message ?? "Unavailable."}</p><Button size="sm" variant="outline" onClick={() => q.refetch()}>Retry</Button></div>;
  const total = q.data.pending.reduce((t, i) => t + i.points, 0);
  const isSuper = role === "super_admin";
  const group=groupedReviewState(q.data.pending,q.data.round3HeldIds);
  const groupReview=group.records.find(r=>r.review)?.review as Review|undefined;
  return <div className="space-y-3 text-[12px]">
    <div className="border-b border-hairline pb-3"><p className="font-bold">Round #3 · {q.data.round3.storedFlow} FLOW · unchanged and unpublished</p><p className="text-muted">{q.data.round3.heldPoints} held Core Swap Points · read-only assessment</p>{Object.entries(q.data.round3.assessment).map(([k,v])=><p key={k}>{k.replaceAll('_',' ')} · {v.rows} records · {v.points} Points</p>)}</div>
    {group.records.length>0 && <section aria-label="Round 3 grouped review" className="space-y-3 border-y border-hairline py-3">
      <h3 className="font-bold">Round #3 · one grouped valuation review</h3>
      <p>{group.records.length} individually auditable records · {group.points.toLocaleString()} Points · existing funding reservations retained</p>
      <p className="text-warning">Missing evidence: original historical price source. Confirmed transactions and recorded USD do not establish historical valuation.</p>
      <p className="text-muted">HISTORICAL_PRICING_EXCEPTION_V1 · valuation documentation only. Wallet, duplicate, restriction and policy violations remain blocked. No new funding or publication.</p>
      {groupReview && <div><p><b>Proposed rationale:</b> {groupReview.rationale}</p><p><b>Uncertainty:</b> {groupReview.uncertainty}</p><p className="text-warning">A different super admin must decide the entire group.</p></div>}
      {!group.groupId && !groupOpen && <Button disabled={busy || !group.canPropose} onClick={()=>{setGroupOpen(true);setForm({rationale:'',uncertainty:'Original historical price-source evidence is unavailable for these nine recorded awards.',priceSource:'',priceUsd:''});}}>Review Round #3 group</Button>}
      {groupOpen && <div className="space-y-2"><Textarea aria-label="Grouped exception rationale" placeholder="Document why this narrowly scoped historical-valuation exception is justified" maxLength={2000} value={form.rationale} onChange={e=>setForm({...form,rationale:e.target.value})}/><Textarea aria-label="Grouped missing evidence" maxLength={1000} value={form.uncertainty} onChange={e=>setForm({...form,uncertainty:e.target.value})}/><div className="flex flex-wrap gap-2"><Button disabled={busy || !group.canPropose} onClick={()=>run({action:'evidence-group-propose',ids:q.data.round3HeldIds,rationale:form.rationale,uncertainty:form.uncertainty},'One group saved for independent approval; all nine records remain held.')}>Submit group for independent approval</Button><Button variant="outline" onClick={()=>setGroupOpen(false)}>Cancel</Button></div></div>}
      {group.groupId && <div className="flex flex-wrap gap-2"><Button disabled={busy || !isSuper || !group.canApprove} onClick={()=>{if(window.confirm(`Approve the historical-valuation exception for all ${group.records.length} records / ${group.points} Points? This preserves reservations and does not renew, sign or publish Round #3.`))void run({action:'evidence-group-approve',id:group.groupId},'Group approved. Eligibility recalculated; schedule renewal still needs separate approval.');}}>Approve grouped exception</Button><Button variant="outline" disabled={busy || !isSuper || !group.records.every(r=>r.review?.canDecide)} onClick={()=>run({action:'evidence-group-reject',id:group.groupId},'Group rejected; records remain held.')}>Reject group</Button></div>}
      {!group.canPropose && !group.groupId && <p className="text-warning">Group cannot be proposed while a record is blocked or already under individual review.</p>}
      <details open><summary className="cursor-pointer font-bold">Individual transaction and reservation evidence ({group.records.length})</summary><div className="overflow-x-auto"><table className="w-full text-left text-[11px]"><thead><tr><th className="p-2">Points / recorded USD</th><th className="p-2">Confirmed transaction / policy</th><th className="p-2">Bound wallet / original reservation</th></tr></thead><tbody>{q.data.pending.filter(i=>q.data.round3HeldIds.includes(i.id)).map(i=><tr key={i.id} className="border-t border-hairline"><td className="p-2 align-top">{i.points} Points<br/>${i.recordedUsd ?? '—'}</td><td className="max-w-64 break-all p-2 align-top">{i.evidence.transactionStatus ?? 'Unconfirmed'}<br/>{i.txHash}<br/>{i.policyVersion}<br/>{i.assessment?.reasons.join(' · ')}</td><td className="max-w-64 break-all p-2 align-top">{i.evidence.boundWallet ?? 'Unavailable'}<br/>{i.evidence.reservation?.id ?? 'No reservation'}<br/>{i.evidence.reservation?.points} Points · {i.evidence.reservation?.program}</td></tr>)}</tbody></table></div></details>
    </section>}
    <div className="rounded-xl border border-warning/40 bg-warning/5 p-3">
      <p className="font-bold">{total.toLocaleString()} Points across {q.data.pending.length} reward(s) are held for historical evidence review.</p>
      <p className="mt-1 text-muted">Original valuation is not established by recorded USD alone. Only missing historical valuation documentation can be considered under HISTORICAL_PRICING_EXCEPTION_V1. Wallet, duplicate, restriction and policy blockers cannot be waived. Approval preserves amounts and existing reservations; it does not fund or publish.</p>
    </div>
    {selected.length>0 && <div className="space-y-2 border-y border-hairline py-3"><p className="font-bold">{selected.length} selected · {q.data.pending.filter(i=>selected.includes(i.id)).reduce((s,i)=>s+i.points,0)} Points</p>
      <Textarea aria-label="Batch review rationale" placeholder="Reason for this historical valuation exception" value={form.rationale} onChange={e=>setForm({...form,rationale:e.target.value})}/>
      <Textarea aria-label="Batch uncertainty" placeholder="Document the shared missing evidence" value={form.uncertainty} onChange={e=>setForm({...form,uncertainty:e.target.value})}/>
      <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy || q.data.pending.some(i=>selected.includes(i.id)&&!!i.review)} onClick={()=>run({action:'evidence-batch-propose',ids:selected,rationale:form.rationale,uncertainty:form.uncertainty},'Batch proposals saved for independent review.')}>Propose selected exceptions</Button><Button size="sm" disabled={busy || !isSuper || q.data.pending.some(i=>selected.includes(i.id)&&!i.review?.canDecide)} onClick={()=>run({action:'evidence-batch-approve',ids:q.data.pending.filter(i=>selected.includes(i.id)).map(i=>i.review?.id),rationale:form.rationale,uncertainty:form.uncertainty},'Selected exceptions approved; original reservations preserved.')}>Approve selected exceptions</Button><Button variant="ghost" size="sm" onClick={()=>setSelected([])}>Clear selection</Button></div></div>}
    {q.data.pending.filter(i=>!q.data.round3HeldIds.includes(i.id)).map((i) => <div key={i.id} className="rounded-xl border border-hairline bg-card p-3">
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
          <Button size="sm" disabled={busy || !!i.review.group_id || !i.review.canDecide || !i.assessment?.exceptionAllowed} onClick={() => {const review=i.review;if(review)void run({ action: "evidence-approve", id: review.id }, i.funded?'Exception approved. Original funding reservation preserved.':'Exception approved. Funding still requires separate approval.');}}>Approve exception</Button>
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
