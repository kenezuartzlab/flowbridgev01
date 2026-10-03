import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { X, ExternalLink, Sparkles, CheckCircle, XCircle } from 'lucide-react';
import { ModalPortal } from './ModalPortal';
import { PostActionActivationCard } from '@/components/growth/PostActionActivationCard';


interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  txHash: string;
  txUrlPrefix: string;
  txType?: 'swap' | 'bridge';
  status?: 'success' | 'failed';
}

export function ReceiptModal({
  isOpen,
  onClose,
  txHash,
  txUrlPrefix,
  txType = 'swap',
  status = 'success'
}: ReceiptModalProps) {
  useEffect(() => {
    if (isOpen && status === 'success') {
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
  }, [isOpen, status]);

  if (!isOpen) return null;

  const displayHash = txHash 
    ? `${txHash.slice(0, 10)}...${txHash.slice(-8)}`
    : "0x6ae56f...8c3d";

  const href = txHash ? `${txUrlPrefix}${txHash}` : "#";

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-background/92 backdrop-blur-md animate-fade-in font-sans">
      <div 
        id="receipt_modal"
        className={`bg-card border border-hairline text-foreground rounded-[20px] w-full max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain max-w-[340px] p-4 shadow-2xl relative flex flex-col items-center space-y-3 animate-scale-up border-b-[4px] ${status === 'success' ? 'border-b-primary' : 'border-b-danger'}`}
      >
        {/* Close Button */}
        <button 
          onClick={onClose}
          aria-label="Close transaction receipt"
          className="absolute top-3 right-3 p-1.5 hover:bg-foreground/5 rounded-xl text-muted hover:text-foreground transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Hand-Crafted Premium CSS Mascot: Gold OK-Sign Coin with Sunglasses */}
        <div className="relative w-36 h-32 flex items-center justify-center -my-3 scale-[0.78] select-none">
          {/* Sparkle indicators around head */}

          <div className="absolute top-1 right-6 text-primary animate-pulse duration-1000">
            <Sparkles className="w-5 h-5 fill-primary" />
          </div>
          <div className="absolute bottom-5 left-4 text-accent animate-pulse duration-700">
            <Sparkles className="w-4 h-4" />
          </div>

          {/* Main 3D Gold Character Coin */}
          <div className="relative w-24 h-24 rounded-full bg-gradient-to-tr from-primary via-accent to-teal-300 border-4 border-foreground/20 shadow-2xl flex flex-col items-center justify-center overflow-hidden">

            {/* Embedded inner coin rim */}
            <div className="absolute inset-1.5 rounded-full border-2 border-dashed border-foreground/20 animate-spin duration-[20s]" />
            
            {/* Glossy lighting highlights */}
            <div className="absolute top-0 inset-x-0 h-10 bg-foreground/20 rounded-full blur-sm -translate-y-5" />

            {/* Cool sunglasses (retro-brutal theme) */}
            <div className="relative z-15 flex items-center justify-center gap-1.25 mt-2">
              <div className="relative w-8 h-5.5 bg-background rounded-b-xl rounded-t-sm shadow-md border border-foreground/10 overflow-hidden flex items-end justify-center">
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-foreground/10 to-transparent w-full h-full transform skew-x-12" />
                <div className="text-[6px] text-primary font-mono select-none leading-none opacity-50 pb-1">ECO</div>
              </div>
              <div className="w-2 h-0.5 bg-background" />
              <div className="relative w-8 h-5.5 bg-background rounded-b-xl rounded-t-sm shadow-md border border-foreground/10 overflow-hidden flex items-end justify-center">
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-foreground/10 to-transparent w-full h-full transform skew-x-12" />
                <div className="text-[6px] text-primary font-mono select-none leading-none opacity-50 pb-1">ECO</div>
              </div>
            </div>

            {/* Mischievous smile */}
            <div className="w-7 h-3 border-b-[3px] border-background rounded-b-full mt-2 relative z-10" />

            {/* Rose cheeks */}
            <div className="absolute bottom-6 left-5 w-3 h-1.5 bg-primary/40 rounded-full blur-[1px]" />
            <div className="absolute bottom-6 right-5 w-3 h-1.5 bg-primary/40 rounded-full blur-[1px]" />
          </div>

          {/* Golden gesture hand sign */}
          <div className="absolute -right-1 bottom-4 w-12 h-12 flex items-center justify-center">
            <div className="bg-card text-sm p-1.5 rounded-xl border border-foreground/10 shadow-lg transform rotate-12 flex items-center justify-center font-bold">
              🤙
            </div>
          </div>
          
          {/* Success Check badge */}
          <div className={`absolute -bottom-1 left-7 text-primary-foreground p-1 rounded-full border-2 border-card shadow-md animate-bounce ${status === 'success' ? 'bg-primary' : 'bg-red-400'}`}>
            {status === 'success' ? <CheckCircle className="w-5 h-5 fill-none" /> : <XCircle className="w-5 h-5 fill-none" />}
          </div>
        </div>

        {/* Dynamic content descriptors */}
        <div className="space-y-1 text-center font-sans">
          <span className="text-[11px] font-black uppercase text-muted tracking-widest leading-none font-mono">
            Final blockchain receipt
          </span>
          <h3 className="text-[15px] font-black text-foreground uppercase tracking-wide font-mono">
            {status === 'success'
              ? (txType === 'bridge' ? 'Bridge Submitted' : 'Swap Confirmed On-Chain')
              : (txType === 'bridge' ? 'Bridge Failed On-Chain' : 'Swap Failed On-Chain')}
          </h3>
          <p className="text-[12px] text-muted px-2 max-w-[280px] mx-auto leading-snug">
            {status === 'success'
              ? (txType === 'bridge'
                  ? 'Your bridge transaction was sent. Please wait and track your transaction until the funds arrive on the destination chain.'
                  : 'The swap transaction was mined successfully and verified from the final chain receipt.')
              : 'The transaction was mined but reverted on-chain. It was not saved as a successful transaction.'}
          </p>
        </div>

        {/* Block Explorer Link */}
        <a 
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-3 px-3 bg-primary hover:bg-primary-strong text-primary-foreground rounded-xl font-mono text-[11px] tracking-widest uppercase font-black transition-all text-center duration-150 flex flex-col items-center justify-center gap-0.5 cursor-pointer fb-glow"
        >
          <span className="opacity-85 text-[9px] font-bold">Block Explorer hash URL</span>
          <div className="flex items-center gap-1 text-primary-foreground truncate max-w-full">
            {displayHash}
            <ExternalLink className="w-3.5 h-3.5 text-primary-foreground shrink-0" />
          </div>
        </a>

        {/*
         * V28 §5 — non-blocking account encouragement AFTER the real outcome.
         * It never hides the receipt, never appears on failure, and respects
         * "Not now" for a real cooldown.
         */}
        <PostActionActivationCard outcomeSuccessful={status === 'success'} onClose={onClose} />

        {/* Secondary close button */}
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-background hover:bg-background-elev text-muted hover:text-foreground font-mono uppercase tracking-wider font-black text-[11px] transition-all border border-hairline cursor-pointer"
        >
          Close receipt
        </button>

        {txType === 'swap' && (
          <p className="text-[10px] text-muted/60 text-center leading-snug px-2">
            A 0.1% platform fee was charged by FlowBridge for this swap.
          </p>
        )}
      </div>
    </div>
    </ModalPortal>
  );
}


// Utility to verify active explorer
function isMainnetExplorer(link: string) {
  return link.includes("botchain") || link.includes("bohr");
}
