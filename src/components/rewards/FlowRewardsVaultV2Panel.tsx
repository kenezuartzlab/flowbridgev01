import { useEffect, useRef, useState } from 'react';
import { decodeEventLog, encodeFunctionData, formatUnits, type Address, type Hex } from 'viem';
import { Wallet, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getActiveProvider } from '@/lib/wallet/activeProvider';
import { VAULT_V2_ABI } from '@/lib/rewards/vaultV2Abi.generated';
import { VAULT_V2_CONFIG, VAULT_V2_RELEASE, confirmedVaultClaim, vaultClaimGate } from '@/lib/rewards/vaultV2';
import { readVaultV2, vaultClient } from '@/lib/rewards/vaultV2Read';
import { useAccountData } from '@/lib/app/useAccountData';
import { getIdToken } from '@/lib/auth';

export function FlowRewardsVaultV2Panel() {
  const { user, incentives } = useAccountData();
  const [snapshot,setSnapshot] = useState<Awaited<ReturnType<typeof readVaultV2>>>(null);
  const [config,setConfig] = useState(VAULT_V2_CONFIG);
  const [phase,setPhase] = useState('');
  const [hash,setHash] = useState<Hex|null>(null);
  const [busy,setBusy] = useState(false);
  const pending = useRef<Hex|null>(null);
  const bound = incentives?.walletAddress?.toLowerCase();
  useEffect(()=>{let cancelled=false;setSnapshot(null);setConfig(VAULT_V2_CONFIG);if(user)void(async()=>{const token=await getIdToken();if(!token)return;const res=await fetch('/api/rewards/vault-v2',{headers:{authorization:`Bearer ${token}`}});if(!res.ok)return;const cfg=await res.json();if(cancelled||!cfg.enabled)return;const live=await readVaultV2(bound as Address,cfg);if(cancelled)return;setConfig(cfg);setSnapshot(live);})().catch(()=>{if(!cancelled)setPhase('Live balance unavailable. Retry before claiming.');});return()=>{cancelled=true;};},[bound,user]);
  const claim = async () => {
    if (busy || pending.current || !config.enabled || !bound || !user) return;
    setBusy(true);setPhase('Checking wallet and live balance…');
    try {
      const provider = await getActiveProvider();
      if (!provider) throw new Error('Connect your verified wallet.');
      const accounts = await provider.request({method:'eth_requestAccounts'}) as string[];
      const chain = await provider.request({method:'eth_chainId'}) as string;
      const live = await readVaultV2(bound as Address,config);
      if (!live) throw new Error('Vault deployment is not verified.');
      const gate = vaultClaimGate({enabled:config.enabled,verified:config.cutoverVerified,chainId:Number.parseInt(chain,16),walletMatches:accounts[0]?.toLowerCase()===bound,paused:live.paused,balance:live.balance,liabilities:live.liabilities,claimable:live.claimable});
      if(gate!=='READY') throw new Error(gate==='WRONG_NETWORK'?'Switch your wallet to BOT Mainnet.':gate==='WALLET_MISMATCH'?'Connect your verified reward wallet.':`Claim unavailable: ${gate}.`);
      const client=vaultClient();
      await client.simulateContract({address:live.address,abi:VAULT_V2_ABI,functionName:'claim',account:bound as Address});
      // Check again immediately before the signature; do not reuse an earlier wallet/network.
      const freshAccounts=await provider.request({method:'eth_accounts'}) as string[];
      if(freshAccounts[0]?.toLowerCase()!==bound || Number.parseInt(await provider.request({method:'eth_chainId'}) as string,16)!==677) throw new Error('Wallet or network changed. Nothing sent.');
      setPhase('Confirm Claim All in your wallet…');
      const tx=await provider.request({method:'eth_sendTransaction',params:[{from:bound,to:live.address,data:encodeFunctionData({abi:VAULT_V2_ABI,functionName:'claim'}),value:'0x0'}]}) as Hex;
      pending.current=tx;setHash(tx);setPhase('Transaction submitted — waiting for BOT Mainnet confirmation…');
      const receipt=await client.waitForTransactionReceipt({hash:tx,confirmations:3,timeout:180_000});
      if(receipt.status!=='success'){pending.current=null;throw new Error('Transaction reverted. Your credits remain available.');}
      const event=receipt.logs.filter(l=>l.address.toLowerCase()===live.address.toLowerCase()).map(l=>{try{return decodeEventLog({abi:VAULT_V2_ABI,data:l.data,topics:l.topics})}catch{return null}}).find(e=>e?.eventName==='Claimed');
      const canonical=await client.getBlock({blockNumber:receipt.blockNumber});
      const after=await readVaultV2(bound as Address,config);
      const args=event?.eventName==='Claimed'?event.args:null;
      if(!confirmedVaultClaim({receipt:receipt.status,eventWallet:args?.wallet??null,wallet:bound,eventAmount:args?.amount??0n,expectedAmount:live.claimable,canonicalBlock:canonical.hash===receipt.blockHash,rereadClaimable:after?.claimable??null})) throw new Error('Submitted claim needs verification. Do not send again.');
      pending.current=null;setSnapshot(after);setPhase(`Claimed ${formatUnits(live.claimable,18)} FLOW — confirmed on BOT Mainnet.`);
    } catch(e) {setPhase(e instanceof Error?e.message:'Claim could not complete.');}
    finally {setBusy(false);}
  };
  return <section id="flow-rewards-vault-v2" data-release={VAULT_V2_RELEASE} className="min-w-0 space-y-3 border-b border-hairline pb-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-base font-bold"><Wallet className="h-4 w-4 text-primary"/>FLOW Rewards Wallet V2</h2><span className="shrink-0 text-xs font-semibold text-muted">{config.enabled?'BOT Mainnet':'Not activated'}</span></div>
    {config.enabled && snapshot ? <><p className="text-xs text-muted">FLOW available to claim</p><p className="break-words text-3xl font-bold tabular-nums">{formatUnits(snapshot.claimable,18)} <span className="text-sm text-muted">FLOW</span></p><Button className="h-auto min-h-11 w-full whitespace-normal" disabled={busy||snapshot.claimable===0n||snapshot.paused||Boolean(pending.current)} onClick={()=>void claim()}>{busy?<Loader2 className="animate-spin"/>:<Wallet/>}Claim All {formatUnits(snapshot.claimable,18)} FLOW</Button><p className="text-xs text-muted">One wallet confirmation · you pay BOT network gas · no expiry.</p></>:<p className="text-sm leading-relaxed text-muted">V2 is not activated. No Points have been moved. Existing published FLOW rounds remain available below with their original claim windows.</p>}
    {phase&&<p role="status" className="break-words text-sm text-muted">{phase}</p>}
    {hash&&<a className="inline-flex items-center gap-1 text-sm text-primary" href={`https://scan.botchain.ai/tx/${hash}`} target="_blank" rel="noreferrer">View transaction<ExternalLink className="h-3 w-3"/></a>}
  </section>;
}