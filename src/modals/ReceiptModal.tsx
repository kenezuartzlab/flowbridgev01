import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { ExternalLink } from 'lucide-react';
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
    if (isOpen && status === 'success' && txType === 'swap') {
      // Primary celebratory burst of confetti in center
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.55 },
        colors: ['#32FF8B', '#00D7B2', '#010C1B', '#F0F7F3', '#FFD700']
      });

      // Left side delayed booster rocket
      const delayLeft = setTimeout(() => {
        confetti({
          particleCount: 60,
          angle: 60,
          spread: 60,
          origin: { x: 0, y: 0.75 },
          colors: ['#32FF8B', '#00D7B2', '#F0F7F3']
        });
      }, 250);

      // Right side delayed booster rocket
      const delayRight = setTimeout(() => {
        confetti({
          particleCount: 60,
          angle: 120,
          spread: 60,
          origin: { x: 1, y: 0.75 },
          colors: ['#32FF8B', '#00D7B2', '#F0F7F3']
        });
      }, 400);

      return () => {
        clearTimeout(delayLeft);
        clearTimeout(delayRight);
      };
    }
  }, [isOpen, status, txType]);

  useEffect(() => {
    if (!isOpen || !shouldDismissBridgeReceipt({type:txType, status, hash:txHash, trackedHash, persisted:trackingPersisted})) return;
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [isOpen, txType, status, txHash, trackedHash, trackingPersisted, onClose]);

  if (!isOpen) return null;

  return <TransactionModalFrame id="receipt_modal" title={status === 'failed' ? 'Transaction failed' : txType === 'bridge' ? 'Bridge submitted' : 'Swap confirmed on-chain'} onClose={onClose}
    footer={<Button className="w-full h-11" onClick={onClose}>{txType === 'bridge' && trackingPersisted && status === 'success' ? 'Track transaction' : 'Close receipt'}</Button>}>
    <p className="text-xs text-muted">{status === 'failed' ? 'The origin transaction reverted on-chain. It is not a successful transaction.' : txType === 'bridge' ? 'Origin transaction submitted. Destination delivery is separate and must be verified in the tracker.' : 'The swap was mined successfully and verified from the final chain receipt.'}</p>
    {txHash && <a href={`${txUrlPrefix}${txHash}`} target="_blank" rel="noopener noreferrer" className="block break-all text-xs text-primary">{txHash} <ExternalLink className="inline w-3 h-3" /></a>}
    {txType === 'swap' && <><p className="text-xs text-muted">The Protocol Fee shown during confirmation was included in this swap.</p><PostActionActivationCard outcomeSuccessful={status === 'success'} onClose={onClose} /></>}
  </TransactionModalFrame>;
}
