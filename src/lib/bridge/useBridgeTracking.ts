import { useEffect, useRef, useState } from 'react';
import { createPublicClient, http, fallback, parseAbiItem, parseUnits, type Chain } from 'viem';
import { botMainnet, botTestnet, bscMainnet, bscTestnet, ethereum, sepolia } from '@/lib/wagmi';
import { trackingState, isCurrentTrackingResult, matchDestinationTransfer, loadBridgeTracking, type TrackingEvidence } from './trackingState';
import { MAINNET_CONTRACTS, TESTNET_CONTRACTS } from '@/lib/contracts';

const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const clientFor = (chain: Chain) => createPublicClient({ chain, transport: fallback(chain.rpcUrls.default.http.map(url => http(url, { timeout: 12000 }))) });
function destinationFor(direction: TrackingDirection, isMainnet: boolean): { chain: Chain; token: `0x${string}`; decimals: number } | null {
  const c = isMainnet ? MAINNET_CONTRACTS : TESTNET_CONTRACTS;
  if (direction === 'BOT_TO_BNB') return { chain: isMainnet ? bscMainnet : bscTestnet, token: c.usdtBnb as `0x${string}`, decimals: 18 };
  if (direction === 'BOT_TO_ETH') return { chain: isMainnet ? ethereum : sepolia, token: c.usdtEth as `0x${string}`, decimals: 6 };
  if (direction.endsWith('_TO_BOT')) return { chain: isMainnet ? botMainnet : botTestnet, token: c.usdtBot as `0x${string}`, decimals: 6 };
  return null;
}
/** Reads destination-chain USDT Transfer logs to the recipient since the origin block time. */
async function findDestinationDelivery(direction: TrackingDirection, isMainnet: boolean, recipient: string, amount: string, sourceConfirmedAt: number) {
  const dest = destinationFor(direction, isMainnet);
  if (!dest || !/^0x[0-9a-fA-F]{40}$/.test(recipient)) return null;
  const sentUnits = parseUnits(amount.replace(/,/g, ''), dest.decimals);
  const client = clientFor(dest.chain);
  const latest = await client.getBlockNumber();
  const sample = 1000n > latest ? latest : 1000n;
  const [head, back] = await Promise.all([client.getBlock({ blockNumber: latest }), client.getBlock({ blockNumber: latest - sample })]);
  const blockMs = Math.max(100, Number(head.timestamp - back.timestamp) * 1000 / Math.max(1, Number(sample)));
  const span = BigInt(Math.ceil(Math.max(0, Date.now() - sourceConfirmedAt) / blockMs) + 100);
  const from = latest > span ? latest - span : 0n;
  const chunk = 4000n;
  for (let start = from; start <= latest; start += chunk) {
    const end = start + chunk - 1n > latest ? latest : start + chunk - 1n;
    const logs = await client.getLogs({ address: dest.token, event: TRANSFER, args: { to: recipient as `0x${string}` }, fromBlock: start, toBlock: end });
    if (!logs.length) continue;
    const withTime = await Promise.all(logs.map(async l => ({ to: l.args.to as string, from: l.args.from as string, value: l.args.value as bigint, txHash: l.transactionHash as string,
      timestampMs: Number((await client.getBlock({ blockNumber: l.blockNumber! })).timestamp) * 1000 })));
    const hit = matchDestinationTransfer(withTime, { recipient, sentUnits, sourceConfirmedAt });
    if (hit) return hit;
  }
  return null;
}

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
    let delivered: TrackingEvidence | null = null;
    const saved = loadBridgeTracking();
    const to = recipient || (saved?.txHash === txHash ? saved.recipient : '');
    const sent = amount || (saved?.txHash === txHash ? saved.amount : '');
    const commit = (evidence: TrackingEvidence) => { if (isCurrentTrackingResult(key, currentKey.current, canceled)) setObserved({ key, evidence, error: false }); };
    const poll = async () => {
      if (busy || delivered) return;
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
        if (!to || !sent) return;
        const hit = await findDestinationDelivery(direction, isMainnet, to, sent, sourceConfirmedAt);
        if (hit) { delivered = { ...base, providerAcceptedAt: sourceConfirmedAt, destinationSubmitted: true, destinationConfirmed: true, destinationTokenArrival: true, destinationConfirmedAt: hit.timestampMs, destinationTxHash: hit.txHash }; commit(delivered); }
      } catch {
        if (isCurrentTrackingResult(key, currentKey.current, canceled)) setObserved(prev => ({ key, evidence: prev.key === key ? prev.evidence : {}, error: true }));
      } finally { busy = false; }
    };
    void poll();
    const timer = setInterval(() => void poll(), 5000);
    return () => { canceled = true; clearInterval(timer); };
  }, [active, key, txHash, direction, isMainnet, recipient, amount]);
  useEffect(() => { if (!active) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [active]);
  // Destination delivery is proven only by an on-chain USDT Transfer to the recipient
  // on the destination chain after the origin block; never by time or balance deltas.
  const evidence: TrackingEvidence = { ...(observed.key === key ? observed.evidence : {}), txHash, walletState, providerRequired: true };
  return { ...trackingState(evidence, now), evidence, readError: observed.key === key && observed.error };
}