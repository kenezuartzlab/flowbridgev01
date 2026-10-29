/** Presentation only. No timing, click, or unrelated balance delta proves settlement. */
export interface TrackingEvidence {
  txHash?: string;
  walletState?: 'awaiting' | 'rejected' | 'error';
  source?: 'pending' | 'success' | 'failed';
  sourceConfirmedAt?: number;
  providerRequired?: boolean;
  providerAcceptedAt?: number;
  destinationSubmitted?: boolean;
  destinationConfirmed?: boolean;
  destinationTokenArrival?: boolean;
  destinationConfirmedAt?: number;
  destinationTxHash?: string;
  /** 'unsupported': this route has no linked delivery source (e.g. Tron). */
  deliveryCheck?: 'searching' | 'unsupported' | 'unlinkable';
}
export function trackingState(e: TrackingEvidence, now: number) {
  const terminalWallet = !e.txHash && (e.walletState === 'rejected' || e.walletState === 'error');
  const sourceDone = !!e.txHash && e.source === 'success';
  const received = sourceDone && e.destinationConfirmed === true && e.destinationTokenArrival === true && !!e.destinationTxHash;
  const relayStart = sourceDone && e.sourceConfirmedAt != null && (!e.providerRequired || e.providerAcceptedAt != null)
    ? Math.max(e.sourceConfirmedAt, e.providerAcceptedAt ?? e.sourceConfirmedAt) : null;
  const phase = !e.txHash ? (terminalWallet ? e.walletState === 'rejected' ? 'canceled' : 'error' : 'awaiting')
    : e.source === 'failed' ? 'failed' : received ? 'received' : !sourceDone ? 'origin_pending'
    : relayStart != null ? 'relaying' : 'awaiting_relay';
  return { phase, sourceDone, destinationDone: received, received,
    relayElapsedSeconds: relayStart != null && !received ? Math.max(0, Math.floor((now - relayStart) / 1000)) : null };
}
export function shouldDismissBridgeReceipt(e: { type: string; status: string; hash?: string; trackedHash?: string; persisted: boolean }) {
  return e.type === 'bridge' && e.status === 'success' && !!e.hash && e.hash === e.trackedHash && e.persisted;
}
export function isCurrentTrackingResult(requestKey: string, currentKey: string, canceled: boolean) {
  return !canceled && requestKey === currentKey;
}

export interface BridgeTrackingContext {
  txHash: string; direction: string; isMainnet: boolean; amount: string; recipient: string;
  fromChain: string; toChain: string; explorerPrefix: string;
  /** Verified linked destination release, persisted so refresh re-verifies it directly. */
  destinationTxHash?: string;
}
const STORAGE_KEY = 'flowbridge_bridge_tracking_v1';
const EXPLORERS = new Set(['https://scan.botchain.ai/tx/', 'https://scan.bohr.life/tx/', 'https://bscscan.com/tx/', 'https://testnet.bscscan.com/tx/', 'https://etherscan.io/tx/', 'https://sepolia.etherscan.io/tx/', 'https://tronscan.org/#/transaction/']);
export function saveBridgeTracking(context: BridgeTrackingContext): boolean {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(context)); return window.localStorage.getItem(STORAGE_KEY) === JSON.stringify(context); } catch { return false; }
}
export function loadBridgeTracking(): BridgeTrackingContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const c = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!c || typeof c.txHash !== 'string' || !/^(0x)?[a-fA-F0-9]{64}$/.test(c.txHash)
      || !['BOT_TO_BNB','BNB_TO_BOT','BOT_TO_ETH','ETH_TO_BOT','BOT_TO_TRX','TRX_TO_BOT'].includes(c.direction)
      || typeof c.isMainnet !== 'boolean' || typeof c.amount !== 'string' || typeof c.recipient !== 'string'
      || typeof c.fromChain !== 'string' || typeof c.toChain !== 'string' || !EXPLORERS.has(c.explorerPrefix)) return null;
    if (c.destinationTxHash !== undefined && !(typeof c.destinationTxHash === 'string' && /^0x[a-fA-F0-9]{64}$/.test(c.destinationTxHash))) delete c.destinationTxHash;
    return c;
  } catch { return null; }
}

/** Records a verified destination hash on the stored context for the same source tx only. */
export function rememberDestination(txHash: string, destinationTxHash: string): void {
  const c = loadBridgeTracking();
  if (!c || c.txHash.toLowerCase() !== txHash.toLowerCase() || !/^0x[a-fA-F0-9]{64}$/.test(destinationTxHash)) return;
  saveBridgeTracking({ ...c, destinationTxHash });
}
export function storedDestinationFor(txHash: string): string | undefined {
  const c = loadBridgeTracking();
  return c && c.txHash.toLowerCase() === txHash.toLowerCase() ? c.destinationTxHash : undefined;
}
