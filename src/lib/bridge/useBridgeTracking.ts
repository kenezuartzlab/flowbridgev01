import { useEffect, useRef, useState } from 'react';
import { createPublicClient, http, fallback, type Chain, type PublicClient } from 'viem';
import { botMainnet, botTestnet, bscMainnet, bscTestnet, ethereum, sepolia } from '@/lib/wagmi';
import { trackingState, isCurrentTrackingResult, rememberDestination, storedDestinationFor, type TrackingEvidence } from './trackingState';
import { bridgeRoute, decodeSourceDeposit, matchDelivery, BRIDGE_EVENTS_ABI, type SourceDeposit, type BridgeRoute } from './bridgeDelivery';

const clientFor = (chain: Chain) => createPublicClient({ chain, transport: fallback(chain.rpcUrls.default.http.map(url => http(url, { timeout: 12000 }))) });
/** Event-log capable endpoints (several default RPCs reject eth_getLogs). Read-only. */
const LOG_RPCS: Record<number, string[]> = {
  677: ['https://rpc.botchain.ai'], 968: ['https://rpc.bohr.life'],
  56: ['https://bsc-rpc.publicnode.com'], // BNB Testnet publicnode silently returns empty log sets, so it must not be used here.
  97: ['https://bnb-testnet.api.onfinality.io/public'],
  1: ['https://ethereum-rpc.publicnode.com'],
};
const logClient = (chainId: number) => createPublicClient({ transport: fallback(LOG_RPCS[chainId].map(u => http(u, { timeout: 15000 }))) }) as PublicClient;
const CHUNK: Record<number, bigint> = { 677: 10000n, 968: 10000n, 56: 5000n, 97: 5000n, 1: 1000n };
const MAX_CHUNKS_PER_POLL = 3;

export type TrackingDirection = 'BOT_TO_BNB' | 'BNB_TO_BOT' | 'BOT_TO_ETH' | 'ETH_TO_BOT' | 'BOT_TO_TRX' | 'TRX_TO_BOT';
const required: Record<number, number> = { 677: 3, 968: 1, 56: 15, 97: 3, 1: 12, 11155111: 3 };

async function verifyDestinationTx(client: PublicClient, hash: `0x${string}`, dep: SourceDeposit, route: BridgeRoute, recipient?: string) {
  const r = await client.getTransactionReceipt({ hash });
  const m = matchDelivery(r, dep, route, recipient);
  if (!m.ok) return null;
  const [latest, block] = await Promise.all([client.getBlockNumber(), client.getBlock({ blockNumber: r.blockNumber })]);
  const confirmed = Number(latest - r.blockNumber) + 1 >= (required[route.destination.chainId] ?? 1);
  return { confirmed, at: Number(block.timestamp) * 1000 };
}

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
    let cursor: bigint | null = null;
    let deposit: SourceDeposit | null = null;
    let done = false;
    const route = bridgeRoute(direction, isMainnet);
    const commit = (evidence: TrackingEvidence) => { if (isCurrentTrackingResult(key, currentKey.current, canceled)) setObserved({ key, evidence, error: false }); };
    const poll = async () => {
      if (busy || done) return;
      busy = true;
      try {
        if (direction === 'TRX_TO_BOT') {
          const tron = (window as unknown as { tronWeb?: { trx: { getTransactionInfo: (hash: string) => Promise<{ blockNumber?: number; blockTimeStamp?: number; receipt?: { result?: string }; result?: string }> } } }).tronWeb;
          if (!tron) throw new Error('Tron receipt unavailable');
          const info = await tron.trx.getTransactionInfo(txHash);
          const outcome = info.receipt?.result ?? info.result;
          if (info.blockNumber && outcome) commit({ source: outcome === 'SUCCESS' ? 'success' : 'failed', sourceConfirmedAt: info.blockTimeStamp, deliveryCheck: 'unsupported' });
          return;
        }
        const chain = direction.startsWith('BOT_TO_') ? isMainnet ? botMainnet : botTestnet
          : direction.startsWith('BNB_') ? isMainnet ? bscMainnet : bscTestnet : isMainnet ? ethereum : sepolia;
        const client = clientFor(chain);
        const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
        if (receipt.status !== 'success') { commit({ source: 'failed' }); done = true; return; }
        const [latest, block] = await Promise.all([client.getBlockNumber(), client.getBlock({ blockNumber: receipt.blockNumber })]);
        const confirmed = Number(latest - receipt.blockNumber) + 1 >= (required[chain.id] ?? 1);
        const sourceConfirmedAt = Number(block.timestamp) * 1000;
        if (!confirmed) { commit({ source: 'pending' }); return; }
        if (!route) { commit({ source: 'success', sourceConfirmedAt, deliveryCheck: 'unsupported' }); return; }
        deposit ??= decodeSourceDeposit(receipt.logs, route);
        if (!deposit) { commit({ source: 'success', sourceConfirmedAt, deliveryCheck: 'unlinkable' }); done = true; return; }
        const base: TrackingEvidence = { source: 'success', sourceConfirmedAt, deliveryCheck: 'searching' };
        const dest = logClient(route.destination.chainId);
        // Refresh: re-verify a previously linked release directly instead of trusting storage.
        const stored = storedDestinationFor(txHash);
        if (stored) {
          const v = await verifyDestinationTx(dest, stored as `0x${string}`, deposit, route, recipient);
          if (v) {
            commit({ ...base, destinationSubmitted: true, destinationTxHash: stored, destinationConfirmed: v.confirmed, destinationTokenArrival: v.confirmed, destinationConfirmedAt: v.at, providerAcceptedAt: v.at });
            if (v.confirmed) done = true;
            return;
          }
        }
        commit(base);
        const destLatest = await dest.getBlockNumber();
        if (cursor == null) {
          // Start a little before the source block time, estimated from recent block spacing.
          const sample = destLatest > 1000n ? destLatest - 1000n : 0n;
          const [a, b] = await Promise.all([dest.getBlock({ blockNumber: sample }), dest.getBlock({ blockNumber: destLatest })]);
          const spacing = Math.max(0.1, Number(b.timestamp - a.timestamp) / Number(destLatest - sample || 1n));
          const back = BigInt(Math.ceil((Number(b.timestamp) - sourceConfirmedAt / 1000 + 600) / spacing));
          cursor = destLatest > back ? destLatest - back : 0n;
        }
        let from: bigint = cursor;
        for (let i = 0; i < MAX_CHUNKS_PER_POLL && from <= destLatest; i++) {
          const to: bigint = from + CHUNK[route.destination.chainId] - 1n > destLatest ? destLatest : from + CHUNK[route.destination.chainId] - 1n;
          const logs = await dest.getLogs({ address: route.destination.gateway as `0x${string}`, event: BRIDGE_EVENTS_ABI[1], args: { depositer: deposit.depositer as `0x${string}`, recipient: deposit.recipient as `0x${string}` }, fromBlock: from, toBlock: to });
          if (!isCurrentTrackingResult(key, currentKey.current, canceled)) return;
          const hit = logs.find(l => l.args.originDepositNonce === deposit!.nonce && l.args.originChainId === BigInt(route.source.chainId));
          if (hit?.transactionHash) {
            const destHash = hit.transactionHash;
            const v = await verifyDestinationTx(dest, destHash, deposit, route, recipient);
            if (v) {
              commit({ ...base, destinationSubmitted: true, destinationTxHash: destHash, destinationConfirmed: v.confirmed, destinationTokenArrival: v.confirmed, destinationConfirmedAt: v.at, providerAcceptedAt: v.at });
              if (v.confirmed) { rememberDestination(txHash, destHash); done = true; }
              return; // keep cursor so confirmations are re-read on the next poll
            }
          }
          from = to + 1n;
          cursor = from;
        }
      } catch {
        if (isCurrentTrackingResult(key, currentKey.current, canceled)) setObserved(prev => ({ key, evidence: prev.key === key ? prev.evidence : {}, error: true }));
      } finally { busy = false; }
    };
    void poll();
    const timer = setInterval(() => void poll(), 6000);
    return () => { canceled = true; clearInterval(timer); };
  }, [active, key, txHash, direction, isMainnet, recipient, amount]);
  useEffect(() => { if (!active) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [active]);
  const evidence: TrackingEvidence = { ...(observed.key === key ? observed.evidence : {}), txHash, walletState, providerRequired: true };
  const route = direction ? bridgeRoute(direction, isMainnet) : null;
  return { ...trackingState(evidence, now), evidence, readError: observed.key === key && observed.error, destinationChainId: route?.destination.chainId };
}
