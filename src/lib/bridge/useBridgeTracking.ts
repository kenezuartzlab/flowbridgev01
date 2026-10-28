import { useEffect, useRef, useState } from 'react';
import { createPublicClient, http, fallback, type Chain } from 'viem';
import { botMainnet, botTestnet, bscMainnet, bscTestnet, ethereum, sepolia } from '@/lib/wagmi';
import { trackingState, isCurrentTrackingResult, type TrackingEvidence } from './trackingState';
const clientFor = (chain: Chain) => createPublicClient({ chain, transport: fallback(chain.rpcUrls.default.http.map(url => http(url, { timeout: 12000 }))) });

export type TrackingDirection = 'BOT_TO_BNB' | 'BNB_TO_BOT' | 'BOT_TO_ETH' | 'ETH_TO_BOT' | 'BOT_TO_TRX' | 'TRX_TO_BOT';
const required: Record<number, number> = { 677: 3, 968: 1, 56: 15, 97: 3, 1: 12, 11155111: 3 };
export function useBridgeTracking({ active, txHash, direction, isMainnet, walletState, recipient, amount }: {
  active: boolean; txHash?: string; direction?: TrackingDirection; isMainnet: boolean; walletState?: TrackingEvidence['walletState']; recipient?: string; amount?: string;
}) {
  const key = `${direction}:${isMainnet}:${txHash}`;
  const currentKey = useRef(key);
  currentKey.current = key;
  const [observed, setObserved] = useState<{ key: string; evidence: TrackingEvidence; error: boolean }>({ key, evidence: {}, error: false });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active || !txHash || !direction) return;
    let canceled = false;
    let busy = false;
    const commit = (evidence: TrackingEvidence) => { if (isCurrentTrackingResult(key, currentKey.current, canceled)) setObserved({ key, evidence, error: false }); };
    const poll = async () => {
      if (busy) return;
      busy = true;
      try {
        if (direction === 'TRX_TO_BOT') {
          const tron = (window as unknown as { tronWeb?: { trx: { getTransactionInfo: (hash: string) => Promise<{ blockNumber?: number; blockTimeStamp?: number; receipt?: { result?: string }; result?: string }> } } }).tronWeb;
          if (!tron) throw new Error('Tron receipt unavailable');
          const info = await tron.trx.getTransactionInfo(txHash);
          const outcome = info.receipt?.result ?? info.result;
          if (info.blockNumber && outcome) commit({ source: outcome === 'SUCCESS' ? 'success' : 'failed', sourceConfirmedAt: info.blockTimeStamp });
          return;
        }
        const chain = direction.startsWith('BOT_TO_') ? isMainnet ? botMainnet : botTestnet
          : direction.startsWith('BNB_') ? isMainnet ? bscMainnet : bscTestnet : isMainnet ? ethereum : sepolia;
        const client = clientFor(chain);
        const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
        if (receipt.status !== 'success') { commit({ source: 'failed' }); return; }
        const [latest, block] = await Promise.all([client.getBlockNumber(), client.getBlock({ blockNumber: receipt.blockNumber })]);
        const confirmed = Number(latest - receipt.blockNumber) + 1 >= (required[chain.id] ?? 1);
        const sourceConfirmedAt = Number(block.timestamp) * 1000;
        if (!confirmed) { commit({ source: 'pending' }); return; }
        const base: TrackingEvidence = { source: 'success', sourceConfirmedAt };
        commit(base);
        // No correlated destination receipt or provider acceptance feed is available.
        // Unrelated wallet transfers must never authorize bridge completion.
      } catch {
        if (isCurrentTrackingResult(key, currentKey.current, canceled)) setObserved(prev => ({ key, evidence: prev.key === key ? prev.evidence : {}, error: true }));
      } finally { busy = false; }
    };
    void poll();
    const timer = setInterval(() => void poll(), 5000);
    return () => { canceled = true; clearInterval(timer); };
  }, [active, key, txHash, direction, isMainnet, recipient, amount]);
  useEffect(() => { if (!active) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [active]);
  // Completion requires destination evidence correlated to this bridge, not wallet transfers.
  const evidence: TrackingEvidence = { ...(observed.key === key ? observed.evidence : {}), txHash, walletState, providerRequired: true };
  return { ...trackingState(evidence, now), evidence, readError: observed.key === key && observed.error };
}