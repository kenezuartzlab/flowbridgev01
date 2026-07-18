import { useEffect, useState } from 'react';
import { createPublicClient, http } from 'viem';
import { botMainnet, botTestnet, bscMainnet, bscTestnet } from '../../lib/wagmi';
import { CheckCircle2, Loader2, XCircle, ExternalLink, Clock } from 'lucide-react';

type Phase = 'pending' | 'mining' | 'confirming' | 'success' | 'failed';

interface BridgeStatusPanelProps {
  txHash?: string;
  bridgeDirection: 'BOT_TO_BNB' | 'BNB_TO_BOT';
  isMainnet: boolean;
  sourceExplorerPrefix: string;
  destExplorerPrefix: string;
}

const REQUIRED_CONFIRMATIONS: Record<number, number> = {
  677: 3,   // BOT mainnet
  968: 1,   // BOT testnet
  56: 15,   // BNB mainnet
  97: 3,    // BNB testnet
};

const RELAY_ETA_SECONDS: Record<'BOT_TO_BNB' | 'BNB_TO_BOT', number> = {
  BOT_TO_BNB: 7 * 60,
  BNB_TO_BOT: 5 * 60,
};

function chainFor(chainId: number) {
  if (chainId === 677) return botMainnet;
  if (chainId === 968) return botTestnet;
  if (chainId === 56) return bscMainnet;
  return bscTestnet;
}

function sourceChainId(dir: 'BOT_TO_BNB' | 'BNB_TO_BOT', isMainnet: boolean) {
  if (dir === 'BOT_TO_BNB') return isMainnet ? 677 : 968;
  return isMainnet ? 56 : 97;
}

function destChainName(dir: 'BOT_TO_BNB' | 'BNB_TO_BOT') {
  return dir === 'BOT_TO_BNB' ? 'BNB Chain' : 'BOT Chain';
}

function sourceChainName(dir: 'BOT_TO_BNB' | 'BNB_TO_BOT') {
  return dir === 'BOT_TO_BNB' ? 'BOT Chain' : 'BNB Chain';
}

export function BridgeStatusPanel({
  txHash,
  bridgeDirection,
  isMainnet,
  sourceExplorerPrefix,
  destExplorerPrefix,
}: BridgeStatusPanelProps) {
  const [phase, setPhase] = useState<Phase>('pending');
  const [confirmations, setConfirmations] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [relayCountdown, setRelayCountdown] = useState<number>(0);

  const srcChainId = sourceChainId(bridgeDirection, isMainnet);
  const required = REQUIRED_CONFIRMATIONS[srcChainId] ?? 1;

  useEffect(() => {
    if (!txHash) return;
    let cancelled = false;
    setPhase('mining');
    setConfirmations(0);
    setErrorMsg(null);

    const client = createPublicClient({ chain: chainFor(srcChainId), transport: http() });

    const poll = async () => {
      try {
        const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` }).catch(() => null);
        if (cancelled) return;
        if (!receipt) {
          setPhase('mining');
          return;
        }
        if (receipt.status !== 'success') {
          setPhase('failed');
          setErrorMsg('Transaction reverted on-chain. Funds were not sent — please try again.');
          return;
        }
        const latest = await client.getBlockNumber();
        const conf = Number(latest - receipt.blockNumber) + 1;
        setConfirmations(conf);
        if (conf >= required) {
          setPhase('success');
          setRelayCountdown(RELAY_ETA_SECONDS[bridgeDirection]);
        } else {
          setPhase('confirming');
        }
      } catch (e: any) {
        if (cancelled) return;
        setPhase('failed');
        setErrorMsg(e?.shortMessage || e?.message || 'Failed to fetch on-chain status.');
      }
    };

    poll();
    const id = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(id); };
  }, [txHash, srcChainId, required, bridgeDirection]);

  useEffect(() => {
    if (phase !== 'success' || relayCountdown <= 0) return;
    const id = setInterval(() => setRelayCountdown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [phase, relayCountdown]);

  if (!txHash) return null;

  const pct = Math.min(100, Math.round((confirmations / required) * 100));
  const mm = Math.floor(relayCountdown / 60);
  const ss = (relayCountdown % 60).toString().padStart(2, '0');

  return (
    <div className="bg-[#0D1C2A]/80 border border-white/20 rounded-2xl p-4 space-y-3 font-mono shadow-inner">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {phase === 'failed' ? (
            <XCircle className="w-4 h-4 text-red-400 shrink-0" />
          ) : phase === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-[#32FF8B] shrink-0" />
          ) : (
            <Loader2 className="w-4 h-4 text-[#32FF8B] animate-spin shrink-0" />
          )}
          <span className="text-[12px] font-black uppercase tracking-widest text-white truncate">
            {phase === 'failed' && 'Bridge Failed'}
            {phase === 'success' && `Confirmed on ${sourceChainName(bridgeDirection)}`}
            {phase === 'confirming' && `Confirming (${confirmations}/${required})`}
            {phase === 'mining' && 'Waiting for block inclusion…'}
            {phase === 'pending' && 'Submitting…'}
          </span>
        </div>
        <a
          href={`${sourceExplorerPrefix}${txHash}`}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-[#32FF8B] hover:underline flex items-center gap-1 shrink-0"
        >
          View <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      {(phase === 'confirming' || phase === 'mining' || phase === 'success') && (
        <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#32FF8B] transition-all duration-500"
            style={{ width: `${phase === 'success' ? 100 : pct}%` }}
          />
        </div>
      )}

      {phase === 'success' && (
        <div className="flex items-center gap-2 text-[11px] text-[#C5C1B9]">
          <Clock className="w-3.5 h-3.5 text-[#32FF8B]" />
          <span>
            Source confirmed. USDT will arrive on <span className="text-white font-black">{destChainName(bridgeDirection)}</span>
            {relayCountdown > 0 ? ` in ~${mm}:${ss}` : ' shortly'} via the bridge relayer.
          </span>
        </div>
      )}

      {phase === 'confirming' && (
        <div className="text-[11px] text-[#C5C1B9]">
          Waiting for {required} block confirmations on {sourceChainName(bridgeDirection)} before the relayer picks up the transfer.
        </div>
      )}

      {phase === 'failed' && (
        <div className="text-[11px] text-red-300 leading-relaxed">
          {errorMsg || 'The transaction failed. No USDT was bridged.'}
        </div>
      )}

      {phase === 'success' && (
        <a
          href={destExplorerPrefix}
          target="_blank"
          rel="noreferrer"
          className="block text-center text-[11px] text-[#32FF8B] hover:underline pt-1 border-t border-white/5"
        >
          Track destination on {destChainName(bridgeDirection)} explorer →
        </a>
      )}
    </div>
  );
}
