import { useState } from 'react';
import { LockKeyhole, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { BNB_PROVIDERS, createBnbReadOnlyAdapter, type BnbPair, type BnbProvider } from '@/lib/bnb/quoteAdapter';

/** Preview-only, no network transport, no historical output disguised as a fresh quote. */
export function BnbQuoteInspection({ contextId }: { contextId: number }) {
  const [pair, setPair] = useState<BnbPair>('WBNB/USDT');
  const [provider, setProvider] = useState<BnbProvider>('pancake-v3');
  const [revision, setRevision] = useState(0);
  const context = contextId + revision;
  const [sell,buy] = pair === 'WBNB/USDT' ? ['WBNB','USDT'] as const : ['USDT','XAUt'] as const;
  const result = createBnbReadOnlyAdapter(provider).inspect({ chainId:56, pair, provider, sell, buy, amountIn: sell === 'USDT' ? '25000000000000000000' : '10000000000000000', contextId:context },context,Date.now());
  return <Popover><PopoverTrigger asChild><Button variant="ghost" aria-label="Inspect BNB quote readiness" className="min-h-11 gap-2 text-xs text-muted"><Info className="h-3 w-3" />Quote readiness · Unverified</Button></PopoverTrigger>
    <PopoverContent aria-label="BNB quote readiness" className="w-80 max-w-[calc(100vw-24px)] border-hairline bg-card p-3 text-foreground motion-reduce:animate-none"><div className="w-full space-y-3" data-bnb-inspection>
    <div className="flex items-center justify-between gap-2">
      <Popover>
        <PopoverTrigger asChild><Button variant="ghost" className="min-h-11 px-2 text-xs font-bold" aria-label="Inspect BNB pair">{pair === 'WBNB/USDT' ? 'BNB / USDT' : 'USDT / XAUt'} <Info className="ml-1 h-3 w-3" /></Button></PopoverTrigger>
        <PopoverContent aria-label="BNB read-only pair" className="w-64 border-hairline bg-card p-2 text-foreground motion-reduce:animate-none">
          {(['WBNB/USDT','USDT/XAUt'] as const).map(p=><Button key={p} variant="ghost" aria-pressed={p===pair} className="min-h-11 w-full justify-start text-xs" onClick={()=>{setPair(p);setRevision(n=>n+1);}}>{p==='WBNB/USDT'?'BNB / USDT · wrapped pool':'USDT / XAUt · RWA restricted'}</Button>)}
          <p className="px-2 py-1 text-[11px] text-muted">Chain 56 · fixed assets only · no custom imports</p>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild><Button variant="ghost" className="min-h-11 gap-1 px-2 text-[11px]" aria-label="Inspect BNB quote provider">{BNB_PROVIDERS[provider].label}<Info className="h-3 w-3" /></Button></PopoverTrigger>
        <PopoverContent aria-label="BNB quote providers" className="w-64 border-hairline bg-card p-2 text-foreground motion-reduce:animate-none">
          {(Object.keys(BNB_PROVIDERS) as BnbProvider[]).map(p=><Button key={p} variant="ghost" aria-pressed={provider===p} className="min-h-12 w-full justify-start text-xs" onClick={()=>{setProvider(p);setRevision(n=>n+1);}}><span className="text-left"><span className="block font-bold">{BNB_PROVIDERS[p].label}</span><span className="block text-[11px] text-muted">{BNB_PROVIDERS[p].kind} · Unverified</span></span></Button>)}
          <p className="px-2 py-1 text-[11px] text-muted">No current provider offer · execution blocked</p>
        </PopoverContent>
      </Popover>
    </div>
    <div className="flex items-center justify-between gap-2 border-y border-hairline py-3 text-xs"><span className="text-muted">Expected output</span><span className="font-mono" aria-label="BNB quote output">—</span></div>
    <div className="flex items-center justify-between gap-2 text-[11px]"><span className="text-muted">{BNB_PROVIDERS[provider].kind}</span><span role="status" className="font-bold text-muted">Unverified</span></div>
    <p className="text-[11px] text-muted">{result.reason}</p>
    {pair==='USDT/XAUt' && <p className="text-[11px] text-muted">RWA eligibility, issuer rules, market hours and provider permission: Blocked</p>}
    <p className="flex items-center justify-center gap-1 text-[11px] text-muted"><LockKeyhole className="h-3 w-3" />No live quote · trading disabled</p>
  </div></PopoverContent></Popover>;
}