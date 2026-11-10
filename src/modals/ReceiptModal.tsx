import { useEffect } from 'react';
import { ExternalLink, CheckCircle2 } from 'lucide-react';
import { TransactionModalFrame } from './TransactionModalFrame';
import { Button } from '@/components/ui/button';
import { shouldDismissBridgeReceipt } from '@/lib/bridge/trackingState';
import { PostActionActivationCard } from '@/components/growth/PostActionActivationCard';


interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  txHash: string;
  txUrlPrefix: string;
  txType?: 'swap' | 'bridge';
  status?: 'success' | 'failed';
  trackedHash?: string;
  trackingPersisted?: boolean;
}

export function ReceiptModal({
  isOpen,
  onClose,
  txHash,
  txUrlPrefix,
  txType = 'swap',
  trackedHash,
  trackingPersisted = false,
  status = 'success'
}: ReceiptModalProps) {
  useEffect(() => {
    if (!isOpen || !shouldDismissBridgeReceipt({type:txType, status, hash:txHash, trackedHash, persisted:trackingPersisted})) return;
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [isOpen, txType, status, txHash, trackedHash, trackingPersisted, onClose]);

  if (!isOpen) return null;

  return <TransactionModalFrame id="receipt_modal" title={status === 'failed' ? 'Transaction failed' : txType === 'bridge' ? 'Bridge submitted' : 'Swap confirmed on-chain'} onClose={onClose}
    footer={<Button className="w-full h-11" onClick={onClose}>{txType === 'bridge' && trackingPersisted && status === 'success' ? 'Track transaction' : 'Close receipt'}</Button>}>
    {txType === 'swap' && status === 'success' && <div role="status" className="growth-confirmed growth-reveal flex items-center gap-3 rounded-lg border p-4"><CheckCircle2 className="h-8 w-8 shrink-0 text-success" aria-hidden/><div><p className="font-semibold">Swap complete</p><p className="text-xs text-muted">Confirmed on-chain. Your next move is yours.</p></div></div>}
    <p className="text-xs text-muted">{status === 'failed' ? 'The origin transaction reverted on-chain. It is not a successful transaction.' : txType === 'bridge' ? 'Origin transaction submitted. Destination delivery is separate and must be verified in the tracker.' : 'The swap was mined successfully and verified from the final chain receipt.'}</p>
    {txHash && <a href={`${txUrlPrefix}${txHash}`} target="_blank" rel="noopener noreferrer" className="block break-all text-xs text-primary">{txHash} <ExternalLink className="inline w-3 h-3" /></a>}
    {txType === 'swap' && status === 'success' && <><p className="text-xs text-muted">The Protocol Fee shown during confirmation was included in this swap.</p><p className="text-xs text-muted">Rewards: pending verification. A confirmed swap is not yet a verified Points award.</p><PostActionActivationCard outcomeSuccessful={status === 'success'} onClose={onClose} /></>}
  </TransactionModalFrame>;
}
