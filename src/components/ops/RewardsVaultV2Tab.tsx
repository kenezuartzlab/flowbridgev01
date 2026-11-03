import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatUnits, type Hex } from 'viem';
import { readOpsJson } from '@/lib/admin/opsRead';
import { getIdToken } from '@/lib/auth';
import { getActiveProvider } from '@/lib/wallet/activeProvider';
import { publisherIdentity, signVaultBatch, type PublisherBatch, type PublisherIntent } from '@/lib/rewards/vaultV2Publisher';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, ExternalLink, FileCheck, PenLine } from 'lucide-react';
type Status={enabled:boolean;release:string;blockers:string[];review:{sourceCount:number;sourcePoints:number;cutoverAt:string|null};configuration:{contract_address:string|null;code_hash:string|null};live:Record<string,string|boolean>|null;programs:{program_id:string;funding_verified:boolean;status:string;reserved_points:number}[];batches:PublisherBatch[];attempts:PublisherIntent[];hashCandidates?:{operation_id:string;tx_hash:string;source:string;status:string}[]};
type Review={batch:PublisherBatch;gas:string;estimatedGasWei:string;liabilities:string;free:string;calldata:Hex};
const flow=(n:string|number)=>formatUnits(BigInt(n),18);
export function RewardsVaultV2Tab({wallet}:{wallet?:string}){
  const q=useQuery({queryKey:['ops-vault-v2',wallet],queryFn:()=>readOpsJson<Status>('/api/admin/rewards-vault-v2',wallet),retry:false});
  const [review,setReview]=useState<Review|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[manual,setManual]=useState(''),[local,setLocal]=useState<PublisherIntent|null>(null),[cursor,setCursor]=useState('');
  const running=useRef(false),currentWallet=useRef(wallet);currentWallet.current=wallet;
  const key=`flowbridge:v2-publisher:677:${wallet??''}`;
  useEffect(()=>{setReview(null);setLocal(null);setMessage('');try{const raw=localStorage.getItem(key);if(raw){const a=JSON.parse(raw);if(typeof a.operation_id!=='string'||typeof a.batch_id!=='string'||a.publisher?.toLowerCase()!==wallet?.toLowerCase())throw new Error();setLocal(a);}}catch{setMessage('Saved signing information needs reconciliation. Do not sign again.');}},[wallet,key]);
  const command=async<T,>(body:Record<string,unknown>):Promise<T>=>{
    if(!wallet||currentWallet.current!==wallet)throw new Error('Reconnect the original bound publisher wallet.');
    const token=await getIdToken();if(!token)throw new Error('Sign in to your approved Ops account.');
    const r=await fetch('/api/admin/rewards-vault-v2',{method:'POST',headers:{authorization:`Bearer ${token}`,'x-wallet-address':wallet,'content-type':'application/json'},body:JSON.stringify(body)});
    const json=await r.json();if(!r.ok)throw new Error(json.error??(Array.isArray(json.mismatches)?`Does not match live on-chain values: ${json.mismatches.join('; ')}. Nothing was saved.`:'Action stopped. Resume verification.'));return json;
  };
  const save=(a:PublisherIntent)=>{localStorage.setItem(key,JSON.stringify(a));if(currentWallet.current===wallet)setLocal({...a});};
  const perform=async(fn:()=>Promise<void>)=>{if(running.current)return;running.current=true;setBusy(true);setMessage('');try{await fn();}catch(e){setMessage(e instanceof Error?e.message:'Interrupted. Resume verification; do not resend.');}finally{running.current=false;setBusy(false);void q.refetch();}};
  const batch=q.data?.batches.find(b=>b.state!=='CREDITED')??q.data?.batches[0];
  const stored=q.data?.attempts.find(a=>a.batch_id===batch?.batch_id&&!['CANCELLED','REVERTED'].includes(a.phase));
  const intent=stored??(local&&local.batch_id===batch?.batch_id?local:null);
  const active=Boolean(intent&&!['CANCELLED','REVERTED','CREDITED'].includes(intent.phase));
  const allowed=Boolean(q.data?.enabled&&wallet&&q.data.live?.publisher===wallet.toLowerCase()&&batch?.state!=='CREDITED');
  const identity=async()=>{const p=await getActiveProvider();if(!p||!wallet||currentWallet.current!==wallet)throw new Error('Publisher wallet disconnected or changed. Resume verification.');const accounts=await p.request({method:'eth_accounts'}) as string[];const chain=await p.request({method:'eth_chainId'});publisherIdentity(wallet,accounts,chain,String(q.data?.live?.publisher??''));return p;};
  const resume=async(a:PublisherIntent)=>{
    const result=await command<{state:string;blocker?:string}>({action:'resume_signing',operationId:a.operation_id,...(a.tx_hash?{txHash:a.tx_hash}:manual?{txHash:manual}:{})});
    setMessage(result.state==='CONFIRMED'?'Credited · canonical receipt and ledger verified.':result.blocker??`${result.state} · reservation retained.`);
    if(['CONFIRMED','REVERTED','RELEASED'].includes(result.state)){localStorage.removeItem(key);setLocal(null);setReview(null);}
  };
  const sign=async()=>{
    if(!review||!batch||!allowed||active)return;
    const reviewed=review.batch;
    await signVaultBatch(reviewed,{
      identity:async()=>{await identity();},
      acquire:()=>command<PublisherIntent>({action:'acquire_signing',batchId:reviewed.batch_id}),persist:save,
      send:async a=>{const p=await identity();return await p.request({method:'eth_sendTransaction',params:[{from:a.publisher,to:reviewed.contract_address,data:a.calldata,value:'0x0',nonce:`0x${Number(a.nonce).toString(16)}`}]}) as Hex;},
      attach:async(a,hash)=>{await command({action:'attach_hash',operationId:a.operation_id,txHash:hash});},
      // Dismissal keeps the local journal and the server lock; only canonical nonce resolution releases it.
      rejected:async a=>{await command({action:'wallet_rejected',operationId:a.operation_id});save({...a,phase:'UNKNOWN'});setReview(null);},
      resume,
    });
  };
  const hash=intent?.tx_hash;
  return <section className="min-w-0 space-y-4 border-t border-hairline py-4">
    <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-bold">Rewards Vault V2</h2><Button variant="ghost" size="icon" title="Refresh Vault V2" aria-label="Refresh Vault V2" onClick={()=>void q.refetch()}><RefreshCw className={q.isFetching?'animate-spin':''}/></Button></div>
    <p className="text-sm font-semibold text-warning">{q.data?.enabled?'BOT Mainnet · manual publisher':'DISABLED · no financial actions'}</p>
    {q.isError?<p role="alert" className="text-sm text-destructive">{q.error.message}</p>:q.isLoading?<p role="status" className="text-sm text-muted">Reading Vault controls…</p>:q.data&&<>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">{[['Contract',q.data.configuration.contract_address??'Not deployed'],['Code hash',q.data.configuration.code_hash??'Not verified'],['Free FLOW',q.data.live?.free?flow(String(q.data.live.free)):'Unavailable'],['FLOW liabilities',q.data.live?.liabilities?flow(String(q.data.live.liabilities)):'Unavailable'],['Publisher',q.data.live?.publisher??'Not configured']].map(([k,v])=><div key={String(k)} className="min-w-0"><dt className="text-xs text-muted">{k}</dt><dd className="break-all text-sm font-semibold">{String(v)}</dd></div>)}</dl>
      <div className="border-t border-hairline pt-3"><h3 className="text-sm font-bold">Review Batch</h3>
        <ol className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted"><li>Prepared</li><li>Signature</li><li>Submitted</li><li>Credited</li></ol>
        {batch?<><p className="mt-2 break-all text-sm">{batch.batch_id}</p><p className="mt-1 text-sm font-semibold">{flow(batch.total_wei)} FLOW · {batch.wallets.length} wallets · {batch.source_ids.length} source awards</p><p className="mt-1 text-xs text-muted">Status: {intent?.phase==='UNKNOWN'?'Signature dismissed or unresolved — resume verification':intent?.phase??'PREPARED'}</p><details className="mt-2 text-xs"><summary>Wallets, amounts and source IDs</summary><ul className="mt-2 space-y-2">{batch.wallets.map((w,i)=><li className="break-all" key={w}>{w} · {flow(batch.amounts_wei[i])} FLOW</li>)}</ul><p className="mt-2 break-all">Source IDs: {batch.source_ids.join(', ')}</p></details></>:<p className="mt-2 text-sm text-muted">No V2 awards reserved or batches created.</p>}
        {review&&<p className="mt-2 break-words text-xs text-muted">Gas estimate: {review.gas} · {formatUnits(BigInt(review.estimatedGasWei),18)} BOT · existing liabilities: {flow(review.liabilities)} FLOW · free: {flow(review.free)} FLOW</p>}
        {q.data.enabled&&<div className="mt-3 flex flex-wrap gap-2">{!batch||batch.state==='CREDITED'?<Button disabled={busy} onClick={()=>void perform(async()=>{const r=await command<{batch:unknown;continuation?:{after:string;scannedRows:number}}>({action:'prepare',...(cursor?{after:cursor}:{})});setCursor(r.continuation?.after??'');setMessage(r.continuation?`Scanned ${r.continuation.scannedRows} source awards without a full batch yet. Continue scan to review later awards.`:r.batch?'Prepared from canonical funded post-cutover awards.':'No eligible post-cutover awards found.');})}><FileCheck/>{cursor?'Continue scan':'Prepare Batch'}</Button>:<Button variant="outline" disabled={busy||active||!allowed} onClick={()=>void perform(async()=>{setReview(await command<Review>({action:'review_batch',batchId:batch.batch_id}));})}><FileCheck/>Review Batch</Button>}{batch&&batch.state!=='CREDITED'&&!active&&<Button disabled={busy||!allowed||!review||review.batch.batch_id!==batch.batch_id} onClick={()=>void perform(sign)}><PenLine/>Sign Batch</Button>}</div>}
        {active&&intent&&<div className="mt-3 space-y-2">{!hash&&<Input aria-label="Transaction hash for reconciliation" placeholder="Transaction hash (if available)" value={manual} onChange={e=>setManual(e.target.value)} disabled={busy}/>}<Button variant="outline" disabled={busy} onClick={()=>void perform(()=>resume({...intent,tx_hash:local?.operation_id===intent.operation_id?local.tx_hash??intent.tx_hash:intent.tx_hash}))}><RefreshCw/>Resume verification</Button><p className="text-xs text-warning">Unknown submissions stay reserved. Verification never sends another transaction. Typed or wallet-returned hashes are checked against the original signer, nonce and batch before they count.</p>{(q.data.hashCandidates??[]).filter(c=>c.operation_id===intent.operation_id).map(c=><p key={c.tx_hash} className="break-all text-xs text-muted">{c.status==='VERIFIED'?'Verified':c.status==='REJECTED'?'Rejected':'Unverified'} · {c.tx_hash}</p>)}</div>}
        {hash&&<a className="mt-2 inline-flex items-center gap-1 text-sm text-primary" href={`https://explorer.botchain.ai/tx/${hash}`} target="_blank" rel="noopener noreferrer">View transaction<ExternalLink className="h-3 w-3"/></a>}
        {message&&<p role="status" className="mt-3 break-words text-sm text-warning">{message}</p>}
      </div>
      <div className="border-t border-hairline pt-3"><h3 className="text-sm font-bold">New-award cutover review</h3><p className="mt-2 text-sm text-muted">Cutover: {q.data.review.cutoverAt??'Not authorized'} · {q.data.review.sourceCount} canonical source awards · {q.data.review.sourcePoints} funded PTS</p><p className="mt-2 text-sm text-muted">All earlier awards, Rounds #1–4 and existing V1 obligations remain in V1.</p><ul className="mt-2 space-y-1 text-sm text-warning">{q.data.blockers.map(b=><li key={b}>{b.replaceAll('_',' ')}</li>)}</ul>
        {!q.data.review.cutoverAt&&<CutoverForm busy={busy} onSubmit={(address,cutoverAt)=>void perform(async()=>{await command({action:'authorize_future_cutover',address,cutoverAt});setMessage('Vault registered and cutover authorized. New awards after this time go to Vault V2.');})}/>}
      </div>
      <SettingsForm busy={busy} contract={q.data.configuration.contract_address??DEPLOYED_VAULT} publisher={typeof q.data.live?.publisher==='string'?q.data.live.publisher:''} onSubmit={v=>void perform(async()=>{await command({action:'sync_settings',...v});setMessage('Settings match the live vault and were saved. The change is recorded in the audit log.');})}/>
      <div className="border-t border-hairline pt-3"><h3 className="text-sm font-bold">Existing program funding</h3>{q.data.programs.map(p=><p key={p.program_id} className="mt-2 break-words text-sm text-muted">{p.program_id}: {p.funding_verified?'Backing verified':'Backing not verified'} · {p.status} · {p.reserved_points.toLocaleString()} reserved PTS</p>)}</div>
    </>}
  </section>;
}

const DEPLOYED_VAULT='0x91f70c91b4273d0129abc3f14373fbb10ca59006';
function CutoverForm({busy,onSubmit}:{busy:boolean;onSubmit:(address:string,cutoverAt:string)=>void}){
  const [address,setAddress]=useState(DEPLOYED_VAULT);
  const [minutes,setMinutes]=useState('10');
  const valid=/^0x[0-9a-fA-F]{40}$/.test(address)&&Number(minutes)>=2;
  return <div className="mt-3 space-y-2 rounded-md border border-hairline p-3">
    <p className="text-sm font-semibold">Register vault &amp; authorize cutover (Super Admin)</p>
    <p className="text-xs text-muted">The server checks the live contract, FLOW token, owner, publisher and limits before saving. Your bound wallet must be connected.</p>
    <Input aria-label="Vault contract address" value={address} onChange={e=>setAddress(e.target.value.trim())} disabled={busy}/>
    <label className="flex items-center gap-2 text-xs text-muted">Start in <Input aria-label="Minutes until cutover" className="w-20" inputMode="numeric" value={minutes} onChange={e=>setMinutes(e.target.value.replace(/\D/g,''))} disabled={busy}/> minutes</label>
    <Button disabled={busy||!valid} onClick={()=>onSubmit(address,new Date(Date.now()+Number(minutes)*60_000).toISOString())}><FileCheck/>Register &amp; authorize</Button>
  </div>;
}

const ADDR=/^0x[0-9a-fA-F]{40}$/,AMT=/^\d{1,12}(\.\d{1,18})?$/;
function SettingsForm({busy,contract,publisher,onSubmit}:{busy:boolean;contract:string;publisher:string;onSubmit:(v:{address:string;owner:string;publisher:string;batchCapFlow:string;dailyCapFlow:string})=>void}){
  const [v,setV]=useState({address:contract,owner:'0x851275569923c62a2ef962ec35bfbb8f1bcbf3dd',publisher:publisher||'0x971e7790fe6c8f77dc666bb05d4aeda362653f94',batchCapFlow:'10000',dailyCapFlow:'10000'});
  const set=(k:keyof typeof v)=>(e:React.ChangeEvent<HTMLInputElement>)=>setV({...v,[k]:e.target.value.trim()});
  const valid=ADDR.test(v.address)&&ADDR.test(v.owner)&&ADDR.test(v.publisher)&&AMT.test(v.batchCapFlow)&&AMT.test(v.dailyCapFlow);
  return <div className="space-y-2 border-t border-hairline pt-3">
    <h3 className="text-sm font-bold">Vault settings (Super Admin)</h3>
    <p className="text-xs text-muted">Change the owner, publisher or limits on-chain first, then enter the new values here. Saving checks the live vault: it succeeds only if every value matches exactly, otherwise nothing changes. Nothing is signed or sent.</p>
    {([['address','Vault contract'],['owner','Owner'],['publisher','Publisher'],['batchCapFlow','Per-batch limit (FLOW)'],['dailyCapFlow','Daily limit (FLOW)']] as const).map(([k,label])=><label key={k} className="block text-xs text-muted">{label}<Input aria-label={label} className="mt-1" inputMode={k.endsWith('Flow')?'decimal':'text'} value={v[k]} onChange={set(k)} disabled={busy}/></label>)}
    <Button variant="outline" disabled={busy||!valid} onClick={()=>onSubmit(v)}><FileCheck/>Check live vault &amp; save</Button>
  </div>;
}
