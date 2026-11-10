import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { getIdToken } from '@/lib/auth';

export function IdentityControl({ wallet }: { wallet:string }) {
  const [account,setAccount] = useState(''); const [record,setRecord] = useState<any>(null);
  const [target,setTarget] = useState(''); const [reason,setReason] = useState(''); const [evidence,setEvidence] = useState('');
  const [hours,setHours] = useState(1); const [busy,setBusy] = useState(false); const [message,setMessage] = useState('');
  async function call(method='GET') {
    setBusy(true); setMessage('');
    try {
      const token = await getIdToken(); if (!token) throw new Error('Sign in first');
      const payload = method==='POST' ? { userId:record.profile.id,targetWallet:target,reason,ownershipEvidence:evidence,expiresAt:new Date(Date.now()+hours*3600000).toISOString() } : {userId:record?.profile.id,reason};
      const res = await fetch(`/api/admin/identity${method==='GET' ? `?account=${encodeURIComponent(account)}`:''}`,{method,headers:{authorization:`Bearer ${token}`,'x-wallet-address':wallet,'content-type':'application/json'},...(method==='GET' ? {}:{body:JSON.stringify(payload)})});
      const data=await res.json(); if(!res.ok) throw new Error(data.error);
      if(method==='GET') setRecord(data); else {setMessage(method==='POST'?'One-time recovery authorized. The user must sign a fresh ownership proof.':'Recovery revoked.'); setRecord(null);}
    } catch(e) {setMessage(e instanceof Error?e.message:'Request failed');} finally{setBusy(false);}
  }
  const input='w-full min-w-0 rounded-md border border-hairline bg-background px-3 py-2 text-sm';
  return <section className="space-y-4">
    <h2 className="text-lg font-bold">Identity Control</h2><p className="text-sm text-muted">Rebinding disabled. One verified identity pair; recovery never moves previous rewards.</p>
    <label className="block text-sm">Exact account email or ID<input className={input} value={account} onChange={e=>setAccount(e.target.value)} /></label>
    <Button onClick={()=>void call()} disabled={busy}>Look up account</Button>
    {record && <div className="space-y-3 border-t border-hairline pt-4">
      <p className="break-all text-sm">{record.profile.email} · {record.profile.wallet_address || 'Unbound'}</p>
      <p className="text-sm">{record.review ? 'Quarantined for identity review':record.pair ? record.pair.recovery_used ? 'Permanent · recovery already used':'Permanent · one recovery unused':'First binding available'}</p>
      {record.grant && <p className="break-all text-sm">Recovery expires {record.grant.expires_at} · {record.grant.consumed_at?'Consumed':record.grant.revoked_at?'Revoked':'Time-limited'}</p>}
      <label className="block text-sm">Approved new wallet<input className={input} value={target} onChange={e=>setTarget(e.target.value)} maxLength={42}/></label>
      <label className="block text-sm">Reason<textarea className={input} value={reason} onChange={e=>setReason(e.target.value)} maxLength={500}/></label>
      <label className="block text-sm">Account ownership verification reference (no secrets)<textarea className={input} value={evidence} onChange={e=>setEvidence(e.target.value)} maxLength={500}/></label>
      <label className="block text-sm">Expiry (hours, maximum 24)<input className={input} type="number" min={0.25} max={24} step={0.25} value={hours} onChange={e=>setHours(Number(e.target.value))}/></label>
      <div className="flex flex-wrap gap-2"><Button disabled={busy||!record.pair||record.pair.recovery_used||!!record.review} onClick={()=>void call('POST')}>Authorize one recovery</Button><Button variant="outline" disabled={busy||!record.grant} onClick={()=>void call('DELETE')}>Revoke recovery</Button></div>
      <details><summary>Recovery audit</summary>{record.audit.map((a:any,i:number)=><p key={i} className="mt-2 text-sm">{a.created_at} · {a.action} · {a.reason}</p>)}</details>
    </div>}
    {message&&<p role="status" className="text-sm">{message}</p>}
  </section>;
}