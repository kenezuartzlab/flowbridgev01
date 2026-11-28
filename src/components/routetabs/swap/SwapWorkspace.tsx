import { useEffect, useState, type ComponentProps } from 'react';
import { useAccount } from 'wagmi';
import { UniversalSwapCard } from './UniversalSwapCard';
import { SwapChainPicker } from './SwapChainPicker';
import { clearSwapDraft, setDexPreference } from '@/lib/trade/tradeSession';
import { isSwapView, normalizeSwapView, type SwapView } from '@/lib/swap/viewContext';

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
  const safeView = normalizeSwapView(view, props.isMainnet);
  useEffect(() => {
    if (view === safeView) return;
    clearSwapDraft();
    setDexPreference('auto');
    setGeneration(n => n + 1);
    setLocked(false);
    onViewChange(safeView);
  }, [view, safeView, onViewChange]);
  // Do not mount the execution card for a stale/forged chain until its draft is invalidated.
  if (!isSwapView(view)) return null;
  const picker = <SwapChainPicker view={view} walletChain={chainId} connected={isConnected} disabled={locked} onSelect={select} />;
  return <UniversalSwapCard {...props} key={`${view}-${generation}-${address ?? 'guest'}-${chainId ?? 'none'}`} isMainnet={view === 677} hydration={generation === 0 ? props.hydration : null} chainPicker={picker} cacheScope={`swap-view-${generation}`} onInteractionLock={setLocked} />;
}