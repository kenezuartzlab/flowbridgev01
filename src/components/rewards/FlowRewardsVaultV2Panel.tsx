import { useEffect, useRef, useState } from 'react';
import { formatUnits, parseUnits, type Address, type Hex } from 'viem';
import { Wallet, Loader2, ExternalLink, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VAULT_V2_CONFIG, VAULT_V2_RELEASE, vaultFlowToken } from '@/lib/rewards/vaultV2';
import { readVaultV2 } from '@/lib/rewards/vaultV2Read';
import { createClaimStakePort, readFlexibleQuote } from '@/lib/rewards/vaultV2ClaimStakeRead';
import { classifySaved, flexibleGate, quoteFingerprint, runClaimStake, type ClaimStakeOperation, type FlexibleQuote, type Step } from '@/lib/rewards/vaultV2ClaimStake';
import { withFlowLock } from '@/lib/rewards/flowLock';
import { refreshRewards } from '@/lib/rewards/useVaultV2Balance';
import { useAccountData } from '@/lib/app/useAccountData';
import { fetchUserIncentives } from '@/lib/app/activityApi';
import { getIdToken } from '@/lib/auth';
import { z } from 'zod';

const address = z.string().regex(/^0x[\da-fA-F]{40}$/);
const txHash = z.string().regex(/^0x[\da-fA-F]{64}$/);
const intent = z.object({step:z.enum(['claim','approve','stake']),nonce:z.number().int().nonnegative(),startBlock:z.string().regex(/^\d+$/),hash:txHash.nullable()});
const operationSchema = z.object({version:z.literal(1),wallet:address,rewardVault:address,token:address,stakingVault:address,mode:z.enum(['claim','stake']),claimAmount:z.string().regex(/^\d+$/),principal:z.string().regex(/^\d+$/),terms:z.string(),transactions:z.object({claim:intent.optional(),approve:intent.optional(),stake:intent.optional()}),complete:z.boolean()});
const fmt = (n:bigint) => Number(formatUnits(n,18)).toLocaleString('en-US',{maximumFractionDigits:4});
const raw = (n:bigint) => formatUnits(n,18);
const STEP_LABEL: Record<Step,string> = {claim:'Claim',approve:'Approval',stake:'Stake'};

export function FlowRewardsVaultV2Panel() {
  const {user,incentives} = useAccountData();
  const bound = incentives?.walletAddress?.toLowerCase() as Address | undefined;
  const [config,setConfig] = useState(VAULT_V2_CONFIG);
  const [snapshot,setSnapshot] = useState<Awaited<ReturnType<typeof readVaultV2>>>(null);
  const [quote,setQuote] = useState<FlexibleQuote|null>(null);
  const [amount,setAmount] = useState('');
  const [problem,setProblem] = useState('');
  const [phase,setPhase] = useState('');
  const [busy,setBusy] = useState(false);
  const [operation,setOperation] = useState<ClaimStakeOperation|null>(null);
  const [state,setState] = useState<'RESUME_STAKING'|'CHECK_PENDING'|null>(null);
  const [done,setDone] = useState<ClaimStakeOperation|null>(null);
  const [manualHash,setManualHash] = useState('');
  const [loaded,setLoaded] = useState(false);
  const running = useRef(false);
  const owner = useRef(bound); owner.current=bound;
  const key = `flowbridge:v2-claim-stake:677:${bound??''}`;
  const binding = async () => {
    if(owner.current!==bound)return null;
    const token=await getIdToken();if(!token)return null;
    return (await fetchUserIncentives(token))?.walletAddress??null;
  };
  const save = (op:ClaimStakeOperation) => {localStorage.setItem(key,JSON.stringify(op));if(owner.current===bound)setOperation(structuredClone(op));};
  /** Verified-complete operations leave the active slot; receipts are kept in a short history. */
  const archive = (op:ClaimStakeOperation) => {
    const hk=`${key}:history`;
    let list:unknown[]=[];try{list=JSON.parse(localStorage.getItem(hk)??'[]');}catch{list=[];}
    localStorage.setItem(hk,JSON.stringify([{...op,complete:true,archivedAt:Date.now()},...(Array.isArray(list)?list:[])].slice(0,10)));
    localStorage.removeItem(key);
    if(owner.current===bound){setOperation(null);setState(null);setDone(op);}
  };
  const refreshLive = async (cfg=config) => {
    if(!bound)return;
    const live=await readVaultV2(bound,cfg);if(owner.current!==bound)return;
    setSnapshot(live);if(live)setAmount(raw(live.claimable));
    refreshRewards();
  };
  /** Read-only receipt check of a saved flow; never sends. */
  const reconcile = async (op:ClaimStakeOperation, cfg:typeof config) => {
    const port=createClaimStakePort(cfg,bound as Address,binding,save,()=>{});
    const verified:Partial<Record<Step,'success'>>={};let reason='';
    for(const s of ['claim','approve','stake'] as Step[]){const t=op.transactions[s];if(!t)continue;
      try{const r=await port.verify(t,op);if(r==='success')verified[s]='success';else{reason=`${STEP_LABEL[s]} reverted.`;delete op.transactions[s];save(op);}}
      catch(e){reason=e instanceof Error?e.message:'Receipt not found yet.';break;}}
    const c=classifySaved(op,verified);
    if(c==='DISCARD_NO_TX'){localStorage.removeItem(key);setOperation(null);setState(null);return;}
    if(c==='ARCHIVE_VERIFIED'){archive(op);setPhase(op.mode==='claim'?'Your last claim is verified. FLOW is in your wallet.':'Your last Claim & Stake is verified.');return;}
    setOperation(op);setAmount(raw(BigInt(op.principal)));setState(c);
    setPhase(c==='RESUME_STAKING'?`Claim verified — ${fmt(BigInt(op.claimAmount))} FLOW is in your wallet. Staking is not completed yet.`:`A ${op.transactions.stake?'stake':op.transactions.approve?'approval':'claim'} transaction is not verified yet. ${reason} Do not send it again.`);
  };
  useEffect(()=>{
    let cancelled=false;
    setConfig(VAULT_V2_CONFIG);setSnapshot(null);setQuote(null);setOperation(null);setState(null);setDone(null);setPhase('');setLoaded(false);
    if(user&&bound) void (async()=>{
      const token=await getIdToken();if(!token)return;
      const res=await fetch('/api/rewards/vault-v2',{headers:{authorization:`Bearer ${token}`}});
      if(!res.ok)throw new Error('Rewards status unavailable.');
      const cfg=await res.json();if(cancelled)return;setLoaded(true);if(!cfg.enabled)return;
      const live=await readVaultV2(bound,cfg);if(cancelled||!live)return;
      setConfig(cfg);setSnapshot(live);setAmount(raw(live.claimable));
      const stored=localStorage.getItem(key);
      if(stored){
        let parsed;try{parsed=operationSchema.safeParse(JSON.parse(stored));}catch{parsed=null;}
        if(!parsed?.success){setPhase('A saved flow could not be read. Check your wallet history before sending another transaction.');return;}
        const op=parsed.data as ClaimStakeOperation;
        if(op.wallet.toLowerCase()!==bound||op.rewardVault.toLowerCase()!==cfg.address.toLowerCase()){setPhase('Saved flow belongs to another wallet or contract; it was not used.');return;}
        setPhase('Checking your last rewards transaction…');
        await reconcile(op,cfg);
      }
    })().catch(e=>{if(!cancelled)setPhase(e.message);});
    return()=>{cancelled=true;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[bound,user,key]);
  useEffect(()=>{
    let cancelled=false;setQuote(null);setProblem('');
    if(!config.enabled||!bound||!snapshot)return;
    const available=operation?.transactions.claim?BigInt(operation.claimAmount):snapshot.claimable;
    if(available===0n)return;
    setProblem('Checking live Flexible terms…');
    void(async()=>{
      const principal=parseUnits(amount||'0',18);
      const q=await readFlexibleQuote(bound,principal);
      flexibleGate(q,vaultFlowToken()??'',available);
      if(!cancelled){setQuote(q);setProblem('');}
    })().catch(e=>{if(!cancelled)setProblem(e.message.startsWith('MINIMUM:')?`Minimum Flexible stake: ${fmt(BigInt(e.message.split(':')[1]))} FLOW. Claim FLOW remains available.`:e.message);});
    return()=>{cancelled=true;};
  },[config,bound,snapshot,amount,operation?.claimAmount,operation?.transactions.claim]);
  const start = async (mode:'claim'|'stake') => {
    if(running.current||!config.enabled||!config.address||!bound||!snapshot)return;
    const rewardVault=config.address;
    const tokenAddress=vaultFlowToken();if(!tokenAddress)return;
    running.current=true;setBusy(true);setDone(null);
    let op:ClaimStakeOperation|null=null;
    try {
      await withFlowLock(key,async()=>{
        const existing=localStorage.getItem(key);
        const prior=existing?operationSchema.safeParse(JSON.parse(existing)):null;
        if(prior?.success&&Object.keys(prior.data.transactions).length>0){
          op=prior.data as ClaimStakeOperation;
          // Resuming after a verified claim: an explicit tap accepts the displayed current terms; never re-claims.
          if(op.mode==='stake'&&op.transactions.claim&&!op.transactions.stake&&quote)op.terms=quoteFingerprint(quote);
        } else {
          const principal=mode==='stake'?parseUnits(amount,18):0n;
          if(mode==='stake'&&!quote)throw new Error('Review a valid live stake quote first.');
          op={version:1,wallet:bound,rewardVault,token:tokenAddress,stakingVault:quote?.stakingVault??rewardVault,mode,claimAmount:snapshot.claimable.toString(),principal:principal.toString(),terms:quote?quoteFingerprint(quote):'',transactions:{},complete:false};
        }
        const port=createClaimStakePort(config,bound,binding,save,setPhase);
        await runClaimStake(op,port);
        archive(op);
        setPhase(op.mode==='claim'?`Claimed ${fmt(BigInt(op.claimAmount))} FLOW to your wallet — verified on chain.`:`Claimed and staked ${fmt(BigInt(op.principal))} FLOW in your Flexible position — verified on chain.`);
      },{locks:typeof navigator!=='undefined'?navigator.locks:undefined,store:localStorage});
      await refreshLive();
    } catch(e) {
      const message=e instanceof Error?e.message:'Interrupted.';
      const current=op as ClaimStakeOperation|null;
      const claimed=Boolean(current?.transactions.claim?.hash)&&current?.mode==='stake';
      setPhase(message);
      if(current&&Object.keys(current.transactions).length>0){await reconcile(structuredClone(current),config).catch(()=>undefined);setPhase(p=>`${message}${claimed?' ':' '}${p===message?'':p}`.trim());}
      else {localStorage.removeItem(key);setOperation(null);setState(null);}
      void refreshLive().catch(()=>undefined);
    } finally {running.current=false;setBusy(false);}
  };
  const attachHash = async () => {
    if(!operation||!txHash.safeParse(manualHash).success)return setPhase('Enter the full transaction hash from your wallet history.');
    const step=(['stake','approve','claim'] as Step[]).find(s=>operation.transactions[s]&&!operation.transactions[s]!.hash);
    if(!step)return;
    const op=structuredClone(operation);op.transactions[step]!.hash=manualHash as Hex;
    setBusy(true);try{await reconcile(op,config);setManualHash('');await refreshLive();}finally{setBusy(false);}
  };
  const pendingUnknownHash=state==='CHECK_PENDING'&&Object.values(operation?.transactions??{}).some(t=>t&&!t.hash);
  const receipts=(state?operation:done)?.transactions??{};
  const nothing=snapshot?.claimable===0n;
  return <section id="flow-rewards-vault-v2" data-release={VAULT_V2_RELEASE} className="min-w-0 space-y-3">
    {config.enabled&&snapshot?<>
      <div className="flex items-end justify-between gap-3"><div className="min-w-0"><p className="text-xs text-muted">FLOW ready to claim</p><p className="break-words text-3xl font-bold tabular-nums">{fmt(snapshot.claimable)} <span className="text-sm text-muted">FLOW</span></p></div><span className="shrink-0 text-xs text-muted">BOT Mainnet</span></div>
      {!state?<>
        {!nothing&&<>
          <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2"><Button className="h-auto min-h-12 whitespace-normal" disabled={busy||snapshot.paused} onClick={()=>void start('claim')}>{busy?<Loader2 className="animate-spin"/>:<Wallet/>}Claim FLOW</Button><Button variant="outline" className="h-auto min-h-12 whitespace-normal" disabled={busy||snapshot.paused||!quote} onClick={()=>void start('stake')}><Sprout/>Claim &amp; Stake Flexible</Button></div>
          <details className="text-xs text-muted"><summary className="cursor-pointer py-1">Stake amount and terms</summary>
            <label className="mt-2 block space-y-1">Flexible stake amount (FLOW)<Input aria-label="Flexible stake amount" inputMode="decimal" value={amount} disabled={busy} onChange={e=>setAmount(e.target.value)} /></label>
            {quote&&<p className="mt-2">Floor APR {quote.floorRate/100}%. {quote.genesisAvailable?`Genesis bonus ${quote.genesisRate/100}% currently available (checked again before each transaction).`:'No Genesis bonus available right now.'} Variable rewards depend on funded epochs; no APR is guaranteed. Withdraw principal anytime.</p>}
          </details>
        </>}
        {nothing&&<p className="text-sm text-muted">Nothing to claim right now. New verified rewards appear here after each batch.</p>}
      </>:<div className="space-y-2 rounded-md border border-hairline p-3">
        {state==='RESUME_STAKING'?<>
          <p className="text-sm">Stake {fmt(BigInt(operation!.principal))} FLOW in Flexible. Your claim is done; this never claims again.</p>
          {quote&&<p className="text-xs text-muted">Current terms: floor {quote.floorRate/100}%{quote.genesisAvailable?`, Genesis ${quote.genesisRate/100}%`:', no Genesis bonus'}. Resume accepts these terms.</p>}
          <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2"><Button className="h-auto min-h-11 whitespace-normal" disabled={busy||!quote} onClick={()=>void start('stake')}>{busy?<Loader2 className="animate-spin"/>:<Sprout/>}Resume staking</Button><Button variant="ghost" className="h-auto min-h-11 whitespace-normal" disabled={busy} onClick={()=>{archive(operation!);setDone(null);setPhase('Kept FLOW in your wallet. You can stake any time from Staking.');}}>Keep FLOW in wallet</Button></div>
        </>:<>
          <Button variant="outline" className="h-auto min-h-11 w-full whitespace-normal" disabled={busy} onClick={()=>{setBusy(true);setPhase('Checking receipts…');void reconcile(structuredClone(operation!),config).then(()=>refreshLive()).finally(()=>setBusy(false));}}>{busy?<Loader2 className="animate-spin"/>:<Wallet/>}Check transaction again</Button>
          {pendingUnknownHash&&<div className="space-y-1 text-xs text-muted"><label className="block">Have the transaction hash from your wallet? Paste it to verify.<Input aria-label="Transaction hash" value={manualHash} disabled={busy} onChange={e=>setManualHash(e.target.value.trim())} placeholder="0x…" /></label><Button size="sm" variant="ghost" disabled={busy||!manualHash} onClick={()=>void attachHash()}>Verify hash</Button></div>}
        </>}
      </div>}
      <p className="text-xs leading-relaxed text-muted">Claim = 1 wallet confirmation. Claim &amp; Stake = 2, or 3 if an exact approval is needed. Each is a separate transaction and you pay BOT gas. V2 credits do not expire.</p>
      {problem&&!state&&!nothing&&<p className="break-words text-xs text-muted">{problem}</p>}
    </>:<p className="text-sm leading-relaxed text-muted">{!user||!bound?'Sign in and bind your wallet to see FLOW ready to claim.':loaded&&!config.enabled?'FLOW Rewards Wallet is not active yet.':'Checking your FLOW rewards…'}</p>}
    {phase&&<p role="status" className="break-words text-sm text-muted">{phase}</p>}
    {Object.values(receipts).map(t=>t?.hash&&<a key={t.step} className="inline-flex items-center gap-1 pr-3 text-xs text-primary" href={`https://scan.botchain.ai/tx/${t.hash}`} target="_blank" rel="noreferrer">{STEP_LABEL[t.step]} receipt<ExternalLink className="h-3 w-3"/></a>)}
  </section>;
}
