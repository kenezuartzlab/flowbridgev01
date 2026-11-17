import { useState, type ComponentProps } from 'react';
import { Link } from '@tanstack/react-router';
import { useAccount } from 'wagmi';
import { LockKeyhole } from 'lucide-react';
import { UniversalSwapCard } from './UniversalSwapCard';
import { SwapChainPicker } from './SwapChainPicker';
import { clearSwapDraft, setDexPreference } from '@/lib/trade/tradeSession';
import { isSwapView, type SwapView } from '@/lib/swap/viewContext';

export function SwapWorkspace({ view, onViewChange, ...props }: ComponentProps<typeof UniversalSwapCard> & {
  view: SwapView; onViewChange: (next: SwapView) => void;
}) {
  const { chainId, isConnected, address } = useAccount();
  const [generation, setGeneration] = useState(0);
  const [locked, setLocked] = useState(false);
  const select = (next: SwapView) => {
    if (locked || !isSwapView(next) || view === next) return;
    clearSwapDraft();
    setDexPreference('auto');
    setGeneration(n => n + 1);
    onViewChange(next);
  };
  const picker = <SwapChainPicker view={view} walletChain={chainId} connected={isConnected} disabled={locked} onSelect={select} />;
  if (view === 56) return <section className="flex flex-1 flex-col space-y-4" aria-label="BNB read-only trading view">
    <div data-swap-heading className="grid h-8 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
      <div className="flex min-w-0 items-center gap-2"><span className="font-mono text-lg font-black uppercase">Swap</span>{picker}</div>
      <LockKeyhole aria-label="BNB swaps unavailable" className="h-4 w-4 text-muted" />
    </div>
    <div data-swap-form className="flex min-h-[231px] flex-col items-center justify-center gap-3 rounded-lg border border-hairline bg-card px-4 text-center">
      <LockKeyhole className="h-6 w-6 text-muted" />
      <p className="text-sm font-bold">BNB swaps coming after security approval</p>
      <p className="text-xs text-muted">Read-only research · no live trading or approvals</p>
      {import.meta.env.DEV && <Link to="/campaigns/rwa" className="inline-flex min-h-11 items-center text-xs font-bold text-primary">XAUt/USDT · archived quote research →</Link>}
    </div>
  </section>;
  return <UniversalSwapCard {...props} key={`${view}-${generation}-${address ?? 'guest'}-${chainId ?? 'none'}`} isMainnet={view === 677} hydration={generation === 0 ? props.hydration : null} chainPicker={picker} cacheScope={`swap-view-${generation}`} onInteractionLock={setLocked} />;
}