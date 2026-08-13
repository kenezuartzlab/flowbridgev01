import { useEffect, useState } from 'react';
import { createPublicClient, http } from 'viem';
import { botMainnet, botTestnet, bscMainnet, bscTestnet, ethereum, sepolia } from '../../lib/wagmi';
import { fetchTronConfirmations } from '../../lib/tronBridge';
import { CheckCircle2, Loader2, XCircle, ExternalLink, Clock, AlertTriangle } from 'lucide-react';
import { toFriendlyError } from '../../lib/friendlyError';
import type { PendingAdapterBridge } from '../../store/routeSession';
import { useAdapterStatus } from '../../lib/bridge/useAdapterStatus';

type Phase = 'pending' | 'mining' | 'confirming' | 'success' | 'failed';

export type BridgeDirection =
  | 'BOT_TO_BNB' | 'BNB_TO_BOT'
  | 'BOT_TO_ETH' | 'ETH_TO_BOT'
  | 'BOT_TO_TRX' | 'TRX_TO_BOT';

interface BridgeStatusPanelProps {
  txHash?: string;
  bridgeDirection: BridgeDirection;
  isMainnet: boolean;
  sourceExplorerPrefix: string;
  destExplorerPrefix: string;
  /** Phase 5A: when set, the Adapter status branch renders instead. */
  adapterSession?: PendingAdapterBridge | null;
}

const REQUIRED_CONFIRMATIONS: Record<number, number> = {
  677: 3,        // BOT mainnet
  968: 1,        // BOT testnet
  56: 15,        // BNB mainnet
  97: 3,         // BNB testnet
  1: 12,         // ETH mainnet
  11155111: 3,   // Sepolia
};

const RELAY_ETA_SECONDS: Record<BridgeDirection, number> = {
  BOT_TO_BNB: 7 * 60,
  BNB_TO_BOT: 5 * 60,
  BOT_TO_ETH: 10 * 60,
  ETH_TO_BOT: 8 * 60,
  BOT_TO_TRX: 6 * 60,
  TRX_TO_BOT: 5 * 60,
};

function chainFor(chainId: number) {
  if (chainId === 677) return botMainnet;
  if (chainId === 968) return botTestnet;
  if (chainId === 56) return bscMainnet;
  if (chainId === 97) return bscTestnet;
  if (chainId === 1) return ethereum;
  return sepolia;
}

function sourceChainId(dir: BridgeDirection, isMainnet: boolean): number | null {
  switch (dir) {
    case 'BOT_TO_BNB': case 'BOT_TO_ETH': case 'BOT_TO_TRX': return isMainnet ? 677 : 968;
    case 'BNB_TO_BOT': return isMainnet ? 56 : 97;
    case 'ETH_TO_BOT': return isMainnet ? 1 : 11155111;
    case 'TRX_TO_BOT': return null; // Tron: non-EVM, polled separately
  }
}

const CHAIN_NAME: Record<'BOT' | 'BNB' | 'ETH' | 'TRX', string> = {
  BOT: 'BOT Chain', BNB: 'BNB Chain', ETH: 'Ethereum', TRX: 'Tron',
};

function peerFor(dir: BridgeDirection) {
  if (dir.startsWith('BOT_TO_')) return dir.slice(7) as 'BNB' | 'ETH' | 'TRX';
  return dir.slice(0, 3) as 'BNB' | 'ETH' | 'TRX';
}
function destChainName(dir: BridgeDirection) {
  return dir.startsWith('BOT_TO_') ? CHAIN_NAME[peerFor(dir)] : CHAIN_NAME.BOT;
}
function sourceChainName(dir: BridgeDirection) {
  return dir.startsWith('BOT_TO_') ? CHAIN_NAME.BOT : CHAIN_NAME[peerFor(dir)];
}

/**
 * Phase 5A: Adapter session status. Finality comes ONLY from the on-chain
 * requestState() read — source confirmations can never show success here.
 */
function AdapterStatusBranch({
  session,
  sourceExplorerPrefix,
}: {
  session: PendingAdapterBridge;
  sourceExplorerPrefix: string;
}) {
  const { status, rpcError } = useAdapterStatus(session);
  const {
    flagEnabled: refundFlagOn,
    claiming,
    claimError,
    claimResult,
    claim,
  } = useAdapterRefundClaim(session);

  const claimCompleted = claimResult?.refundCompleted === true;
  const severity = claimCompleted ? 'info' : (status?.severity ?? 'info');
  const tone =
    severity === 'success'
      ? 'text-[#32FF8B]'
      : severity === 'critical'
        ? 'text-red-400'
        : severity === 'warning'
          ? 'text-amber-300'
          : 'text-[#32FF8B]';
  const showRefundArea = status?.refundClaimable === true || claimCompleted;

  return (
    <div className="bg-[#0D1C2A]/80 border border-white/20 rounded-2xl p-4 space-y-3 font-mono shadow-inner">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {severity === 'success' ? (
            <CheckCircle2 className={`w-4 h-4 shrink-0 ${tone}`} />
          ) : severity === 'critical' ? (
            <XCircle className="w-4 h-4 text-red-400 shrink-0" />
          ) : severity === 'warning' ? (
            <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
          ) : (
            <Loader2 className={`w-4 h-4 animate-spin shrink-0 ${tone}`} />
          )}
          <span className="text-[12px] font-black uppercase tracking-widest text-white truncate">
            {claimCompleted ? 'Refund completed' : status ? status.title : 'Checking bridge request…'}
          </span>
        </div>
        <a
          href={`${sourceExplorerPrefix}${session.tx_hash}`}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-[#32FF8B] hover:underline flex items-center gap-1 shrink-0"
        >
          View <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="text-[11px] text-[#C5C1B9] leading-relaxed">
        {claimCompleted
          ? 'The Adapter paid the recorded refund recipient. Verified on-chain.'
          : status
            ? status.description
            : 'Reading the bridge request state on-chain. The source transaction alone does not confirm delivery.'}
      </div>

      {rpcError && (
        <div className="text-[11px] text-amber-300">
          Network read failed — retrying. Status is unchanged until the chain answers.
        </div>
      )}

      {showRefundArea && (
        <div className="space-y-2 pt-2 border-t border-white/10">
          <div className="text-[10px] text-[#C5C1B9]/80 break-all">
            Refund recipient (fixed by the Adapter): {session.refund_recipient}
          </div>
          {!refundFlagOn ? (
            <div className="text-[11px] text-amber-300">
              Refund claiming is not enabled in this build.
            </div>
          ) : claimCompleted ? (
            <button
              type="button"
              disabled
              className="w-full rounded-xl bg-white/10 text-[#C5C1B9] text-[12px] font-black uppercase tracking-widest py-2.5 cursor-not-allowed"
            >
              Refund completed
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={claim}
                disabled={claiming}
                className="w-full rounded-xl bg-[#32FF8B] text-[#07131E] text-[12px] font-black uppercase tracking-widest py-2.5 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {claiming && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {claiming ? 'Claiming…' : 'Claim refund'}
              </button>
              {claimResult && !claimResult.refundCompleted && (
                <div className="text-[11px] text-amber-300">
                  Verification pending — the Adapter has not reported the refund as claimed yet.
                  Status is being refreshed.
                </div>
              )}
              {claimError && <div className="text-[11px] text-red-400">{claimError}</div>}
            </>
          )}
        </div>
      )}

      <div className="text-[10px] text-[#C5C1B9]/70 space-y-0.5 pt-1 border-t border-white/5">
        <div>Request #{session.gateway_nonce ?? '—'}</div>
        <div className="truncate">Adapter {session.adapter_address}</div>
        <div>
          Chain {session.source_chain_id} → {session.destination_chain_id}
        </div>
      </div>
    </div>
  );
}


export function BridgeStatusPanel({
  txHash,
  bridgeDirection,
  isMainnet,
  sourceExplorerPrefix,
  destExplorerPrefix,
  adapterSession,
}: BridgeStatusPanelProps) {
  const [phase, setPhase] = useState<Phase>('pending');
  const [confirmations, setConfirmations] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [relayCountdown, setRelayCountdown] = useState<number>(0);

  const srcChainId = sourceChainId(bridgeDirection, isMainnet);
  const isTron = srcChainId === null;
  const required = srcChainId != null ? (REQUIRED_CONFIRMATIONS[srcChainId] ?? 1) : 1;

  useEffect(() => {
    if (!txHash) return;
    let cancelled = false;
    setPhase('mining');
    setConfirmations(0);
    setErrorMsg(null);

    // Tron: poll TronGrid via injected tronWeb (see tronBridge.ts). Non-EVM path.
    if (isTron) {
      const pollTron = async () => {
        try {
          const info = await fetchTronConfirmations(txHash);
          if (cancelled) return;
          if (info.confirmed) {
            setPhase('success');
            setConfirmations(1);
            setRelayCountdown(RELAY_ETA_SECONDS[bridgeDirection]);
          } else {
            setPhase('mining');
          }
        } catch (e: any) {
          if (cancelled) return;
          setPhase('failed');
          setErrorMsg(toFriendlyError(e, { action: 'check Tron status', gasSymbol: 'TRX' }));
        }
      };
      pollTron();
      const id = setInterval(pollTron, 4000);
      return () => { cancelled = true; clearInterval(id); };
    }

    const client = createPublicClient({ chain: chainFor(srcChainId!), transport: http() });

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
        setErrorMsg(toFriendlyError(e, { action: 'check bridge status' }));
      }
    };

    poll();
    const id = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(id); };
  }, [txHash, srcChainId, isTron, required, bridgeDirection]);


  useEffect(() => {
    if (phase !== 'success' || relayCountdown <= 0) return;
    const id = setInterval(() => setRelayCountdown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [phase, relayCountdown]);

  // Adapter session → Adapter-specific branch. Direct-gateway sessions below
  // keep their existing behavior byte-for-byte.
  if (adapterSession) {
    return (
      <AdapterStatusBranch session={adapterSession} sourceExplorerPrefix={sourceExplorerPrefix} />
    );
  }

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
