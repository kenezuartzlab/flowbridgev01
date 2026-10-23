import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, CalendarClock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getIdToken } from '@/lib/auth';
import { readOpsJson } from '@/lib/admin/opsRead';
import type { RewardSolvencyReport } from '@/lib/rewards/rewardSolvency.server';
import type { RenewalProposal } from '@/lib/rewards/scheduleRenewal';
import { PublishBatchPanel } from './PublishBatchPanel';

type Data={report:RewardSolvencyReport;viewer:{role:string}};
const date=(sec:number)=>new Date(sec*1000).toISOString().slice(0,16).replace('T',' ')+' UTC';
export function PayoutOperations({wallet}:{wallet?:string}){
 const [proposal,setProposal]=useState<{proposal:RenewalProposal;record:{id:string;fingerprint:string}}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
 const q=useQuery({queryKey:['payout-operations',wallet],enabled:!!wallet,queryFn:()=>readOpsJson<Data>('/api/admin/payout-operations',wallet),refetchInterval:60000,retry:false});
 useEffect(()=>{setProposal(null);setError(null);},[wallet,q.data?.report.settlement.fingerprint,q.data?.report.settlement.renewal?.fingerprint]);
 async function action(body:Record<string,unknown>){
  if(busy || !wallet)return;setBusy(true);setError(null);
  try{const token=await getIdToken();if(!token)throw new Error('Sign in again and reconnect your bound wallet.');
   const res=await fetch('/api/admin/payout-operations',{method:'POST',headers:{authorization:`Bearer ${token}`,'x-wallet-address':wallet,'content-type':'application/json'},body:JSON.stringify(body)});
   const result=await res.json();if(!res.ok)throw new Error(result.error??'Re-check payout state.');
   if(result.proposal)setProposal(result);else {setProposal(null);await q.refetch();}
  }catch(e){setError(e instanceof Error?e.message:'Checks unavailable. Re-check.');}finally{setBusy(false);}
 }
 if(!wallet)return <p className="text-muted">Sign in and connect your bound operator wallet.</p>;
 if(!q.data)return <div role={q.isError?'alert':undefined} className="space-y-3"><p className="text-muted">{q.isError?'Payout checks unavailable. Signing is disabled.':'Checking funded rewards and the payout contract…'}</p><Button variant="outline" onClick={()=>q.refetch()} disabled={q.isFetching}><RefreshCw/>Re-check</Button></div>;
 const r=q.data.report,s=r.settlement,p=s.renewal;
 const expired=!!p?.needed;
 return <section className="space-y-5">
  <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4"><div><h2 className="text-xl font-bold">Payout Operations</h2><p className="text-sm text-muted">BOT Mainnet · Manual signing · Automatic funding OFF</p></div><Button variant="outline" size="sm" disabled={q.isFetching||busy} onClick={()=>q.refetch()}><RefreshCw/>Re-check</Button></header>
  <dl className="grid gap-4 sm:grid-cols-3">
   <Metric label="Funded eligible payout" value={`${r.draftAllocation.totalPoints.toLocaleString()} FLOW`}/>
   <Metric label="Qualified wallets" value={String(r.draftAllocation.leaves)}/>
   <Metric label="Publication readiness" value={expired?'Schedule needs renewal':s.status==='READY_FOR_PUBLISHER_REVIEW'?'Ready for review':'Action required'}/>
  </dl>
  <div className="space-y-2 border-y border-hairline py-4 text-sm">
   <p><ShieldCheck className="mr-2 inline h-4 w-4 text-primary"/>Stored round #{s.epochId??'—'} · {s.storedAllocation?.wallets ?? s.leaves} wallet(s) · {(s.storedAllocation?.totalFlow ?? s.totalFlow).toLocaleString()} FLOW · unchanged allocation, not approval</p>
   <p className="text-muted">{s.claimStartIso?`${s.claimStartIso.slice(0,16)} → ${s.claimEndIso?.slice(0,16)} UTC`:'Claim schedule unavailable'}</p>
   <p className="text-warning">{r.draftAllocation.excludedUnfundedPoints.toLocaleString()} earned-but-unfunded Points excluded · {r.reconciliation.nonclaimableHistoricalTotal.toLocaleString()} historical restricted Points excluded</p>
   {!!s.provenanceExcludedPoints && <p role="alert" className="text-danger">Reward provenance review required: {s.provenanceExcludedPoints.toLocaleString()} Mainnet Core Swap Points are excluded until independent earning evidence passes. Re-check after the review; signing stays disabled.</p>}
   <details><summary className="cursor-pointer text-muted">Excluded Core Swap awards</summary>{r.unfundedSwapAwards.map(group => <p key={group.points} className="text-warning">{group.points.toLocaleString()} Core Swap Points per award · {group.awards} award(s) · UNFUNDED — excluded</p>)}</details>
   <p className="text-xs text-muted">Last checked {r.generatedAt.replace('T',' ').slice(0,19)} UTC</p>
  </div>
  {expired&&p&&<div className="space-y-3">
   <h3 className="flex items-center gap-2 font-bold text-warning"><CalendarClock className="h-5 w-5"/>Schedule needs renewal</h3>
   <p className="text-sm text-muted">The original schedule cannot meet the contract’s {Math.round((p.claimStart-p.signBefore)/3600)}-hour delay. The allocation stays unchanged. Renewal requires explicit super-admin approval before publisher review.</p>
   <dl className="grid gap-3 text-sm sm:grid-cols-2"><Metric label="Original claim window" value={`${date(p.oldClaimStart)} → ${date(p.oldClaimEnd)}`}/><Metric label="Proposed claim window — not approved" value={`${date(p.claimStart)} → ${date(p.claimEnd)}`}/></dl>
   {!p.ready&&<p role="alert" className="text-sm text-danger">Renewal blocked: {p.blockers.join(', ').replaceAll('_',' ')}. Re-check funding and allocation; the approved amount cannot increase automatically.</p>}
   {!proposal?<Button disabled={!p.ready||busy} onClick={()=>action({action:'prepare-renewal'})}>{busy?'Checking…':'Review renewal proposal'}</Button>:<div className="space-y-3 border-l-2 border-primary pl-4 text-sm">
    <p className="font-bold">Schedule-only proposal · {proposal.proposal.wallets} wallet(s) · {Number(BigInt(proposal.proposal.totalWei)/10n**18n).toLocaleString()} FLOW</p>
    <p className="break-all text-xs text-muted">Original batch {proposal.proposal.originalBatchId}<br/>Proposal {proposal.record.id}<br/>Unchanged root {proposal.proposal.root}</p>
    <p>Approval changes only the authorized schedule. It does not fund rewards, sign, publish or move FLOW.</p>
    <div className="flex flex-wrap gap-2"><Button disabled={busy||q.data.viewer.role!=='super_admin'} onClick={()=>action({action:'approve-renewal',id:proposal.record.id,fingerprint:proposal.record.fingerprint,confirm:true})}>Approve schedule renewal</Button><Button variant="outline" onClick={()=>setProposal(null)}>Cancel review</Button></div>
    {q.data.viewer.role!=='super_admin'&&<p className="text-warning">Waiting for an authorized super admin.</p>}
   </div>}
  </div>}
  {error&&<p role="alert" className="text-sm text-danger">{error}</p>}
  <PublishBatchPanel wallet={wallet} s={s} stale={q.isError} rebuild={async()=>({data:(await q.refetch()).data?.report})}/>
 </section>;
}
function Metric({label,value}:{label:string;value:string}){return <div className="min-w-0"><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 break-words text-base font-bold">{value}</dd></div>;}