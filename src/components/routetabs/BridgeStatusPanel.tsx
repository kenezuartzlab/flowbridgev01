import { useEffect, useState } from 'react';
import { createPublicClient, http } from 'viem';
import { botMainnet, botTestnet, bscMainnet, bscTestnet, ethereum, sepolia } from '../../lib/wagmi';
import { fetchTronConfirmations } from '../../lib/tronBridge';
import { CheckCircle2, Loader2, XCircle, ExternalLink, Clock, AlertTriangle } from 'lucide-react';
import { useBridgeTracking } from '@/lib/bridge/useBridgeTracking';
import type { PendingAdapterBridge } from '../../store/routeSession';
import { useAdapterStatus } from '../../lib/bridge/useAdapterStatus';
import { useAdapterRefundClaim } from '../../lib/bridge/useAdapterRefundClaim';


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
      ? 'text-primary'
      : severity === 'critical'
        ? 'text-red-400'
        : severity === 'warning'
          ? 'text-amber-300'
          : 'text-primary';
  const showRefundArea = status?.refundClaimable === true || claimCompleted;

  return (
    <div className="bg-card/80 border border-foreground/20 rounded-2xl p-4 space-y-3 font-mono shadow-inner">
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
          <span className="text-[12px] font-black uppercase tracking-widest text-foreground truncate">
            {claimCompleted ? 'Refund completed' : status ? status.title : 'Checking bridge request…'}
          </span>
        </div>
        <a
          href={`${sourceExplorerPrefix}${session.tx_hash}`}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-primary hover:underline flex items-center gap-1 shrink-0"
        >
          View <ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="text-[11px] text-muted leading-relaxed">
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
        <div className="space-y-2 pt-2 border-t border-foreground/10">
          <div className="text-[10px] text-muted/80 break-all">
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
              className="w-full rounded-xl bg-foreground/10 text-muted text-[12px] font-black uppercase tracking-widest py-2.5 cursor-not-allowed"
            >
              Refund completed
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={claim}
                disabled={claiming}
                className="w-full rounded-xl bg-primary text-primary-foreground text-[12px] font-black uppercase tracking-widest py-2.5 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

      <div className="text-[10px] text-muted/70 space-y-0.5 pt-1 border-t border-foreground/5">
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
  const state = useBridgeTracking({ active: !!txHash && !adapterSession, txHash, direction: bridgeDirection, isMainnet });
  if (adapterSession) return <AdapterStatusBranch session={adapterSession} sourceExplorerPrefix={sourceExplorerPrefix} />;
  if (!txHash) return null;
  return <div className="border border-hairline rounded-lg p-3 space-y-2 text-xs">
    <p className="font-semibold">{state.phase === 'failed' ? 'Origin transaction failed' : state.sourceDone ? `Confirmed on ${sourceChainName(bridgeDirection)}` : `Waiting for ${sourceChainName(bridgeDirection)} confirmation`}</p>
    {state.received && <p className="text-primary font-semibold">USDT received on {destChainName(bridgeDirection)}{state.evidence.destinationTxHash && destExplorerPrefix ? <> — <a className="underline" target="_blank" rel="noopener noreferrer" href={`${destExplorerPrefix}${state.evidence.destinationTxHash}`}>view</a></> : null}</p>}
    {state.sourceDone && !state.received && <p>Awaiting relay acceptance and verified destination delivery on {destChainName(bridgeDirection)}. ETA unknown.</p>}
    {state.readError && <p className="text-warning">Chain read unavailable — retrying without changing the last confirmed status.</p>}
    <a className="text-primary inline-flex gap-1 items-center" href={`${sourceExplorerPrefix}${txHash}`} target="_blank" rel="noopener noreferrer">Origin receipt <ExternalLink className="w-3 h-3" /></a>
    {state.sourceDone && <a className="block text-primary" href={destExplorerPrefix} target="_blank" rel="noopener noreferrer">Destination explorer</a>}
  </div>;
}
