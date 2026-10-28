import { ExternalLink, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import officialBotLogo from '@/assets/bot-chain-official-wordmark.png.asset.json';
import { TransactionModalFrame } from './TransactionModalFrame';
import { useBridgeTracking, type TrackingDirection } from '@/lib/bridge/useBridgeTracking';
import type { TrackingEvidence } from '@/lib/bridge/trackingState';

interface RealtimeBridgeTrackerModalProps {
  isOpen: boolean; onClose: () => void; fromChain: string; toChain: string;
  amount: string; symbol: string; recipientAddress: string; txHash?: string;
  txUrlPrefix?: string; onReset: () => void; bridgeDirection?: TrackingDirection;
  isMainnet?: boolean; walletState?: TrackingEvidence['walletState']; errorMessage?: string | null;
}
function NetworkMark({ chain }: { chain: string }) {
  if (chain.toLowerCase().includes('bot')) return <span className="block h-9 w-9 overflow-hidden shrink-0"><img src={officialBotLogo.url} alt="BOT Chain" className="h-9 w-[185px] max-w-none" /></span>;
  if (/bnb|bsc|binance/i.test(chain)) return <img src="/bnb-logo.png" alt="BNB Chain" className="h-9 w-9 rounded-full" />;
  return <span className="font-bold text-primary">{chain}</span>;
}
export function RealtimeBridgeTrackerModal({ isOpen, onClose, fromChain, toChain, amount, symbol, recipientAddress, txHash, txUrlPrefix = '', onReset, bridgeDirection, isMainnet = true, walletState, errorMessage }: RealtimeBridgeTrackerModalProps) {
  const state = useBridgeTracking({active:isOpen, txHash, direction:bridgeDirection, isMainnet, walletState});
  if (!isOpen) return null;
  const labels: Record<string, string> = {
    awaiting:'Awaiting your confirmation', canceled:'Canceled — you can retry', error:'Confirmation unresolved — review and retry',
    origin_pending:`Waiting for ${fromChain} confirmation`, failed:'Origin transaction failed',
    awaiting_relay:'Source confirmed — awaiting relay acceptance', relaying:'Relaying', received:'Received',
  };
  const milestone = (label: string, done: boolean, loading: boolean) => <div className="flex justify-between items-start gap-3 text-xs"><span>{label}</span>{done ? <Check aria-label="Confirmed" className="w-4 h-4 text-primary shrink-0" /> : loading ? <Loader2 aria-label="Pending" className="w-4 h-4 text-muted animate-spin shrink-0" /> : <span aria-label="Not confirmed" className="text-muted">—</span>}</div>;
  return <TransactionModalFrame id="realtime_bridge_tracker" title="Track your transaction" onClose={onClose}
    footer={<Button variant="outline" className="w-full h-11" onClick={onClose}>Keep tracking in Bridge</Button>}>
    <div className="flex items-center justify-between gap-3 text-xs">
      <div className="flex items-center gap-2 min-w-0"><NetworkMark chain={fromChain} /><span>{fromChain}</span></div>
      <span>→</span><div className="flex items-center gap-2 min-w-0"><NetworkMark chain={toChain} /><span>{toChain}</span></div>
    </div>
    <div className="flex items-center gap-2"><img src="/usdt-logo.png" alt="USDT" className="h-6 w-6" /><strong className="break-all">{amount || '—'} {symbol}</strong></div>
    <p role="status" className="text-sm font-semibold text-primary">{labels[state.phase]}</p>
    {state.relayElapsedSeconds != null && <p className="text-xs">Relay elapsed: {state.relayElapsedSeconds}s</p>}
    {state.sourceDone && !state.received && <p className="text-xs text-muted">Relay ETA unknown. Destination receipt and token arrival are not yet verified. Source confirmation alone does not prove delivery.</p>}
    {state.readError && <p className="text-xs text-warning">Chain read unavailable — retrying. No additional progress is assumed.</p>}
    {errorMessage && (state.phase === 'canceled' || state.phase === 'error' || state.phase === 'failed') && <p className="text-xs text-danger">{errorMessage}</p>}
    <div className="space-y-3 border-y border-hairline py-3">
      {milestone(`Origin confirmed on ${fromChain}`, state.sourceDone, state.phase === 'origin_pending')}
      {milestone(`Destination transaction confirmed on ${toChain}`, state.destinationDone, state.sourceDone && !state.received)}
      {milestone(`Received ${symbol}`, state.received, false)}
    </div>
    {state.evidence.sourceConfirmedAt != null && <p className="text-xs">Origin block time: <time>{new Date(state.evidence.sourceConfirmedAt).toISOString()}</time></p>}
    <details className="text-xs"><summary className="cursor-pointer py-2 text-primary">Transaction details</summary>
      <p className="break-all">Recipient: {recipientAddress}</p><p className="break-all">Origin hash: {txHash || 'Not submitted'}</p>
      {txHash && <a href={`${txUrlPrefix}${txHash}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 py-2 text-primary">Origin explorer <ExternalLink className="w-3 h-3" /></a>}
    </details>
    {['canceled','error','failed','received'].includes(state.phase) && <Button variant="outline" onClick={() => { onReset(); onClose(); }} className="w-full">{state.received ? 'New bridge' : 'Return to retry'}</Button>}
  </TransactionModalFrame>;
}
