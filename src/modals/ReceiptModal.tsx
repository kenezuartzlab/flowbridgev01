import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { X, ExternalLink, Sparkles, CheckCircle, Heart, XCircle } from 'lucide-react';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  txHash: string;
  txUrlPrefix: string;
  onDonateClick?: () => void;
  txType?: 'swap' | 'bridge';
  status?: 'success' | 'failed';
}

export function ReceiptModal({
  isOpen,
  onClose,
  txHash,
  txUrlPrefix,
  onDonateClick,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#010C1B]/95 backdrop-blur-md animate-fade-in font-sans">
      <div 
        id="receipt_modal"
        className={`bg-[#0D1C2A] border border-white/10 text-[#F0F7F3] rounded-[24px] w-full max-w-[360px] p-7 shadow-2xl relative flex flex-col items-center space-y-6 animate-scale-up border-b-[5px] ${status === 'success' ? 'border-b-[#32FF8B]' : 'border-b-red-400'}`}
      >
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 hover:bg-white/5 rounded-xl text-[#C5C1B9] hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Hand-Crafted Premium CSS Mascot: Gold OK-Sign Coin with Sunglasses */}
        <div className="relative w-44 h-40 flex items-center justify-center mt-3 select-none">
          {/* Sparkle indicators around head */}
          <div className="absolute top-1 right-6 text-[#32FF8B] animate-pulse duration-1000">
            <Sparkles className="w-5 h-5 fill-[#32FF8B]" />
          </div>
          <div className="absolute bottom-5 left-4 text-[#00D7B2] animate-pulse duration-700">
            <Sparkles className="w-4 h-4" />
          </div>

          {/* Main 3D Gold Character Coin */}
          <div className="relative w-28 h-28 rounded-full bg-gradient-to-tr from-[#32FF8B] via-[#00D7B2] to-teal-300 border-4 border-white/20 shadow-2xl flex flex-col items-center justify-center overflow-hidden">
            {/* Embedded inner coin rim */}
            <div className="absolute inset-1.5 rounded-full border-2 border-dashed border-white/20 animate-spin duration-[20s]" />
            
            {/* Glossy lighting highlights */}
            <div className="absolute top-0 inset-x-0 h-10 bg-white/20 rounded-full blur-sm -translate-y-5" />

            {/* Cool sunglasses (retro-brutal theme) */}
            <div className="relative z-15 flex items-center justify-center gap-1.25 mt-2">
              <div className="relative w-8 h-5.5 bg-[#010C1B] rounded-b-xl rounded-t-sm shadow-md border border-white/10 overflow-hidden flex items-end justify-center">
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent w-full h-full transform skew-x-12" />
                <div className="text-[6px] text-[#32FF8B] font-mono select-none leading-none opacity-50 pb-1">ECO</div>
              </div>
              <div className="w-2 h-0.5 bg-[#010C1B]" />
              <div className="relative w-8 h-5.5 bg-[#010C1B] rounded-b-xl rounded-t-sm shadow-md border border-white/10 overflow-hidden flex items-end justify-center">
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent w-full h-full transform skew-x-12" />
                <div className="text-[6px] text-[#32FF8B] font-mono select-none leading-none opacity-50 pb-1">ECO</div>
              </div>
            </div>

            {/* Mischievous smile */}
            <div className="w-7 h-3 border-b-[3px] border-[#010C1B] rounded-b-full mt-2 relative z-10" />

            {/* Rose cheeks */}
            <div className="absolute bottom-6 left-5 w-3 h-1.5 bg-[#32FF8B]/40 rounded-full blur-[1px]" />
            <div className="absolute bottom-6 right-5 w-3 h-1.5 bg-[#32FF8B]/40 rounded-full blur-[1px]" />
          </div>

          {/* Golden gesture hand sign */}
          <div className="absolute -right-1 bottom-4 w-12 h-12 flex items-center justify-center">
            <div className="bg-[#0D1C2A] text-xs p-1.5 rounded-xl border border-white/10 shadow-lg transform rotate-12 flex items-center justify-center font-bold">
              🤙
            </div>
          </div>
          
          {/* Success Check badge */}
          <div className="absolute -bottom-1 left-7 bg-[#32FF8B] text-[#010C1B] p-1 rounded-full border-2 border-[#0D1C2A] shadow-md animate-bounce">
            {status === 'success' ? <CheckCircle className="w-5 h-5 fill-none" /> : <XCircle className="w-5 h-5 fill-none" />}
          </div>
        </div>

        {/* Dynamic content descriptors */}
        <div className="space-y-1.5 text-center font-sans">
          <span className="text-[10px] font-black uppercase text-[#C5C1B9] tracking-widest leading-none font-mono">
            Final blockchain receipt
          </span>
          <h3 className="text-base font-black text-white uppercase tracking-wider font-mono">
            {status === 'success'
              ? (txType === 'bridge' ? 'Bridge Confirmed On-Chain' : 'Swap Confirmed On-Chain')
              : (txType === 'bridge' ? 'Bridge Failed On-Chain' : 'Swap Failed On-Chain')}
          </h3>
          <p className="text-xs text-[#C5C1B9] px-4 max-w-[280px] mx-auto leading-relaxed">
            {status === 'success'
              ? (txType === 'bridge'
                  ? 'The bridge transaction was mined successfully and verified from the final chain receipt.'
                  : 'The swap transaction was mined successfully and verified from the final chain receipt.')
              : 'The transaction was mined but reverted on-chain. It was not saved as a successful transaction.'}
          </p>
        </div>

        {/* Support CTA box */}
        {onDonateClick && status === 'success' && (
          <div className="bg-[#122A26] border border-[#32FF8B]/15 rounded-xl p-3 text-left w-full relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-12 h-12 bg-gradient-to-br from-[#32FF8B]/10 to-transparent blur-md pointer-events-none" />
            <p className="text-[10px] leading-relaxed font-semibold text-[#32FF8B] mb-2 flex items-center gap-1">
              <Heart className="w-3 h-3 fill-[#32FF8B]" />
              <span>We charge 0% protocol fees!</span>
            </p>
            <p className="text-[10px] text-[#C5C1B9] leading-tight mb-2.5">
              Support volunteer builders to keep these learning and public utility tools running fast & free.
            </p>
            <button
              onClick={() => {
                onClose();
                onDonateClick();
              }}
              className="w-full py-1.5 bg-[#32FF8B]/10 hover:bg-[#32FF8B]/20 border border-[#32FF8B]/35 text-[#32FF8B] font-mono font-black text-[9px] uppercase tracking-widest rounded-lg transition-all duration-150 cursor-pointer text-center"
            >
              💖 Donate / Request Tools
            </button>
          </div>
        )}

        {/* Block Explorer Link */}
        <a 
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-3.5 px-4 bg-[#32FF8B] hover:bg-[#1FFF7D] text-[#010C1B] rounded-xl font-mono text-[10px] tracking-widest uppercase font-black transition-all text-center duration-150 flex flex-col items-center justify-center gap-1 cursor-pointer shadow-[0_0_12px_rgba(50,255,139,0.2)]"
        >
          <span className="opacity-85 text-[8px] font-bold">Block Explorer hash URL</span>
          <div className="flex items-center gap-1 text-[#010C1B]">
            {displayHash}
            <ExternalLink className="w-3.5 h-3.5 text-[#010C1B]" />
          </div>
        </a>

        {/* Secondary close button */}
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-[#C5C1B9] hover:text-white font-mono uppercase tracking-wider font-black text-[10px] transition-all border border-white/10 cursor-pointer"
        >
          Close receipt
        </button>
      </div>
    </div>
  );
}

// Utility to verify active explorer
function isMainnetExplorer(link: string) {
  return link.includes("botchain") || link.includes("bohr");
}
