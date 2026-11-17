import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import officialBot from '@/assets/bot-chain-official-wordmark.png.asset.json';
import type { SwapView } from '@/lib/swap/viewContext';

function ChainMark({ bnb }: { bnb: boolean }) {
  return bnb
    ? <span aria-hidden className="chain-bnb-mark grid h-4 w-4 shrink-0 place-items-center text-[13px]">◆</span>
    : <span aria-hidden className="block h-4 w-4 shrink-0 overflow-hidden"><img src={officialBot.url} alt="" className="h-4 w-[82px] max-w-none" /></span>;
}

export function SwapChainPicker({ view, walletChain, connected, disabled, onSelect }: {
  view: SwapView; walletChain?: number; connected: boolean; disabled?: boolean; onSelect: (view: SwapView) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = [677, 56, ...(view === 968 ? [968] : [])] as SwapView[];
  return <Popover modal open={open} onOpenChange={setOpen}>
    <div className="relative h-8 w-[78px] shrink-0">
      <PopoverTrigger asChild>
        <Button variant="ghost" disabled={disabled} aria-label={`Select swap chain, ${view === 56 ? 'BNB preview' : view === 968 ? 'BOT Testnet' : 'BOT Mainnet'}`} className="absolute -top-1.5 h-11 w-full gap-1.5 px-0 font-mono text-xs">
          <span className="flex h-7 w-full items-center justify-center gap-1 rounded-md border border-hairline bg-card"><ChainMark bnb={view === 56} /><span>{view === 56 ? 'BNB' : view === 968 ? 'BOT T' : 'BOT'}</span><ChevronDown className="h-3 w-3" /></span>
        </Button>
      </PopoverTrigger>
    </div>
    <PopoverContent aria-label="Swap chain selection" align="start" className="w-[272px] max-w-[calc(100vw-24px)] border-hairline bg-card p-2 text-foreground motion-reduce:animate-none">
      <p className="px-2 pb-2 pt-1 text-xs font-bold">Trading view</p>
      {options.map(chain => <Button key={chain} variant="ghost" aria-pressed={view === chain} onClick={() => { onSelect(chain); setOpen(false); }} className="h-14 w-full justify-start gap-3 px-2">
        <ChainMark bnb={chain === 56} />
        <span className="min-w-0 flex-1 text-left"><span className="block text-xs font-bold">{chain === 56 ? 'BNB' : 'BOT'} {chain === 968 ? 'Testnet' : 'Mainnet'} · {chain}</span><span className="block text-[11px] text-muted">{chain === 56 ? 'Preview · swaps unavailable' : 'Swap active'}</span></span>
        {view === chain && <Check aria-label="Selected view" className="h-4 w-4 shrink-0 text-primary" />}
      </Button>)}
      <div className="mt-1 border-t border-hairline px-2 py-2 text-[11px] text-muted">
        <p>Selected view: {view === 56 ? 'BNB' : 'BOT'} · {view}</p>
        <p>Wallet: {connected ? `chain ${walletChain ?? 'unknown'}${walletChain === view ? ' · matches view' : ' · different network'}` : 'not connected'}</p>
      </div>
    </PopoverContent>
  </Popover>;
}