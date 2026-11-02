import { useEffect, useRef, useState } from 'react';
import { formatUnits, parseUnits, type Address } from 'viem';
import { Wallet, Loader2, ExternalLink, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VAULT_V2_CONFIG, VAULT_V2_RELEASE, vaultFlowToken } from '@/lib/rewards/vaultV2';
import { readVaultV2 } from '@/lib/rewards/vaultV2Read';
import { createClaimStakePort, readFlexibleQuote } from '@/lib/rewards/vaultV2ClaimStakeRead';
import { flexibleGate, quoteFingerprint, runClaimStake, type ClaimStakeOperation, type FlexibleQuote } from '@/lib/rewards/vaultV2ClaimStake';
import { useAccountData } from '@/lib/app/useAccountData';
import { fetchUserIncentives } from '@/lib/app/activityApi';
import { getIdToken } from '@/lib/auth';
import { z } from 'zod';

const address = z.string().regex(/^0x[\da-fA-F]{40}$/);
const intent = z.object({step:z.enum(['claim','approve','stake']),nonce:z.number().int().nonnegative(),startBlock:z.string().regex(/^\d+$/),hash:z.string().regex(/^0x[\da-fA-F]{64}$/).nullable()});
const operationSchema = z.object({version:z.literal(1),wallet:address,rewardVault:address,token:address,stakingVault:address,mode:z.enum(['claim','stake']),claimAmount:z.string().regex(/^\d+$/),principal:z.string().regex(/^\d+$/),terms:z.string(),transactions:z.object({claim:intent.optional(),approve:intent.optional(),stake:intent.optional()}),complete:z.boolean()});
const fmt = (n:bigint) => formatUnits(n,18);
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
  const running = useRef(false);
  const owner = useRef(bound); owner.current=bound;
  const key = `flowbridge:v2-claim-stake:677:${bound??''}`;
  useEffect(()=>{
    let cancelled=false;
    setConfig(VAULT_V2_CONFIG);setSnapshot(null);setQuote(null);setOperation(null);setPhase('');
    if(user&&bound) void (async()=>{
      const token=await getIdToken();if(!token)return;
      const res=await fetch('/api/rewards/vault-v2',{headers:{authorization:`Bearer ${token}`}});
      if(!res.ok)throw new Error('Rewards status unavailable.');
      const cfg=await res.json();if(cancelled||!cfg.enabled)return;
      const live=await readVaultV2(bound,cfg);if(cancelled||!live)return;
      setConfig(cfg);setSnapshot(live);setAmount(fmt(live.claimable));
      const stored=localStorage.getItem(key);
      if(stored){const parsed=operationSchema.safeParse(JSON.parse(stored));if(!parsed.success)throw new Error('Saved flow needs reconciliation. Do not repeat a transaction.');const op=parsed.data as ClaimStakeOperation;if(op.wallet.toLowerCase()!==bound||op.rewardVault.toLowerCase()!==cfg.address.toLowerCase())throw new Error('Saved wallet or deployment mismatch.');setOperation(op);setPhase('Saved flow found. Check receipts before continuing.');}
    })().catch(e=>{if(!cancelled)setPhase(e.message);});
    return()=>{cancelled=true;};
  },[bound,user,key]);
  useEffect(()=>{
    let cancelled=false;setQuote(null);setProblem('Checking live Flexible terms…');
    if(!config.enabled||!bound||!snapshot)return;
    void(async()=>{
      const principal=parseUnits(amount||'0',18);
      const q=await readFlexibleQuote(bound,principal);
      flexibleGate(q,vaultFlowToken()??'',operation?.transactions.claim?BigInt(operation.claimAmount):snapshot.claimable);
      if(!cancelled){setQuote(q);setProblem('');}
    })().catch(e=>{if(!cancelled)setProblem(e.message.startsWith('MINIMUM:')?`Minimum Flexible stake: ${fmt(BigInt(e.message.split(':')[1]))} FLOW. Claim FLOW remains available.`:e.message);});
    return()=>{cancelled=true;};
  },[config,bound,snapshot,amount,operation?.claimAmount,operation?.transactions.claim]);
  const save = (op:ClaimStakeOperation) => {localStorage.setItem(key,JSON.stringify(op));if(owner.current===bound)setOperation(structuredClone(op));};
  const binding = async () => {
    if(owner.current!==bound)return null;
    const token=await getIdToken();if(!token)return null;
    const data=await fetchUserIncentives(token);
    return data?.walletAddress??null;
  };
  const start = async (mode:'claim'|'stake',resume=false) => {
    if(running.current||!config.enabled||!config.address||!bound||!snapshot)return;
    running.current=true;setBusy(true);
    try {
      if(!navigator.locks)throw new Error('Safe transaction locking unavailable in this browser. Use a supported wallet browser.');
      await navigator.locks.request(key,{ifAvailable:true},async lock=>{
        if(!lock)throw new Error('This rewards flow is already open in another tab.');
        const existing=localStorage.getItem(key);
        let op:ClaimStakeOperation;
        if(existing){const parsed=operationSchema.parse(JSON.parse(existing));op=parsed as ClaimStakeOperation;}
        else {
          const principal=mode==='stake'?parseUnits(amount,18):0n;
          if(mode==='stake'&&!quote)throw new Error('Review a valid live stake quote first.');
          op={version:1,wallet:bound,rewardVault:config.address,token:vaultFlowToken() as Address,stakingVault:quote?.stakingVault??config.address,mode,claimAmount:snapshot.claimable.toString(),principal:principal.toString(),terms:quote?quoteFingerprint(quote):'',transactions:{},complete:false};
        }
        if(resume&&op.mode==='stake'&&!op.transactions.stake){
          if(!quote)throw new Error('Review the current Flexible quote before resuming.');
          op.terms=quoteFingerprint(quote); // explicit Resume tap accepts the displayed fresh terms, never repeats claim
          op.principal=quote.principal.toString();
        }
        const port=createClaimStakePort(config,bound,binding,save,setPhase);
        save(op);
        await runClaimStake(op,port);
        const live=await readVaultV2(bound,config);if(owner.current===bound)setSnapshot(live);
      });
    } catch(e) {
      setPhase(e instanceof Error?e.message:'Flow interrupted. Check transaction receipts before retrying.');
    } finally {running.current=false;setBusy(false);}
  };
  const saved=Boolean(operation);
  return <section id="flow-rewards-vault-v2" data-release={VAULT_V2_RELEASE} className="min-w-0 space-y-3 border-b border-hairline pb-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-base font-bold"><Wallet className="h-4 w-4 text-primary"/>FLOW Rewards Wallet V2</h2><span className="shrink-0 text-xs font-semibold text-muted">{config.enabled?'BOT Mainnet':'Not activated'}</span></div>
    {config.enabled&&snapshot?<>
      <div><p className="text-xs text-muted">FLOW available to claim</p><p className="break-words text-3xl font-bold tabular-nums">{fmt(snapshot.claimable)} <span className="text-sm text-muted">FLOW</span></p></div>
      {!saved?<><label className="block space-y-1 text-xs text-muted">Flexible stake amount (FLOW)<Input aria-label="Flexible stake amount" inputMode="decimal" value={amount} disabled={busy} onChange={e=>setAmount(e.target.value)} /></label>
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2"><Button variant="outline" className="h-auto min-h-11 whitespace-normal" disabled={busy||snapshot.paused||snapshot.claimable===0n} onClick={()=>void start('claim')}><Wallet/>Claim FLOW</Button><Button className="h-auto min-h-11 whitespace-normal" disabled={busy||snapshot.paused||snapshot.claimable===0n||!quote} onClick={()=>void start('stake')}><Sprout/>Claim &amp; Stake Flexible</Button></div></>:<>
        <p className="text-sm text-muted">{operation?.complete?'Saved receipts will be verified again; no successful transaction is repeated.':'If the claim succeeded, FLOW is in your wallet; staking is not completed until its receipt and position are verified.'}</p>
        <Button variant="outline" className="min-h-11 w-full whitespace-normal" disabled={busy} onClick={()=>void start(operation?.mode??'claim',true)}>{busy?<Loader2 className="animate-spin"/>:<Wallet/>}{operation?.transactions.claim&&operation.mode==='stake'?'Resume staking':'Check saved transaction status'}</Button>
        {operation?.complete&&<Button variant="ghost" disabled={busy} onClick={()=>{localStorage.removeItem(key);setOperation(null);setPhase('');}}>Close verified flow</Button>}
      </>}
      <p className="text-xs leading-relaxed text-muted">Claim: 1 transaction. Claim &amp; Stake: 2 wallet confirmations, or 3 if exact approval is needed. You pay BOT gas for each. These are separate transactions, not atomic.</p>
      <p className="text-xs leading-relaxed text-muted">Flexible; withdraw principal anytime; APR variable/current quote; bonus may be unavailable. No expiry for V2 credits.</p>
      {quote&&<p className="text-xs text-muted">Current quoted floor APR: {quote.floorRate/100}%. {quote.genesisAvailable?`Genesis quote: ${quote.genesisRate/100}% for up to ${Math.floor(quote.genesisSeconds/86400)} days; availability rechecked before each transaction.`:'No Genesis bonus currently available; standard Flexible staking remains possible.'} Variable rewards depend on funded epochs, not a guaranteed APR.</p>}
      {problem&&<p className="break-words text-xs text-muted">{problem}</p>}
    </>:<p className="text-sm leading-relaxed text-muted">V2 is not activated. No Points have been moved. Existing published FLOW rounds remain available below with their original claim windows.</p>}
    {phase&&<p role="status" className="break-words text-sm text-muted">{phase}</p>}
    {Object.values(operation?.transactions??{}).map(t=>t?.hash&&<a key={t.step} className="inline-flex items-center gap-1 pr-3 text-xs text-primary" href={`https://scan.botchain.ai/tx/${t.hash}`} target="_blank" rel="noreferrer">{t.step} receipt<ExternalLink className="h-3 w-3"/></a>)}
  </section>;
}
