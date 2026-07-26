import { useState, useEffect } from 'react';
import { X, RefreshCw, Loader2, Check } from 'lucide-react';
import { TokenIcon } from '../components/TokenIcon';
import { ModalPortal } from './ModalPortal';
import { cn } from '../lib/utils';


interface WaitingModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromAmount: string;
  fromSymbol: string;
  toAmount: string;
  toSymbol: string;
  isBridge?: boolean;
  fromChain?: string;
  toChain?: string;
}

export function WaitingModal({
  isOpen,
  onClose,
  fromAmount,
  fromSymbol,
  toAmount,
  toSymbol,
  isBridge = false,
  fromChain,
  toChain
}: WaitingModalProps) {
  const [subStage1, setSubStage1] = useState<'loading' | 'done'>('loading');
  const [subStage2, setSubStage2] = useState<'pending' | 'loading' | 'done'>('pending');
  const [subStage3, setSubStage3] = useState<'pending' | 'loading' | 'done'>('pending');

  useEffect(() => {
    if (isOpen) {
      setSubStage1('loading');
      setSubStage2('pending');
      setSubStage3('pending');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    // Transition stages for swap animations to feel reactive
    const timer1 = setTimeout(() => {
      setSubStage1('done');
      setSubStage2('loading');
    }, 2000);

    const timer2 = setTimeout(() => {
      setSubStage2('done');
      setSubStage3('loading');
    }, 4500);

    const timer3 = setTimeout(() => {
      setSubStage3('done');
    }, 7000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-[#010C1B]/95 backdrop-blur-md animate-fade-in font-sans">
      <div 
        id="waiting_confirmation_modal"
        className="bg-[#0D1C2A] border border-white/10 text-[#F0F7F3] rounded-[20px] w-full max-h-[88dvh] overflow-y-auto overscroll-contain max-w-[340px] p-4 shadow-2xl relative flex flex-col items-center justify-center space-y-3.5 text-center animate-scale-up border-b-[4px] border-b-[#32FF8B]"
      >

        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 hover:bg-white/5 rounded-xl text-[#C5C1B9] hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Glowing Coin Swap Animation with Ecosurge theme */}
        <div className="relative w-24 h-24 flex items-center justify-center">

          <div className="absolute inset-0 rounded-full border border-[#32FF8B]/15 animate-ping duration-1000" />
          <div className="absolute inset-2 rounded-full border border-[#00D7B2]/10 animate-[pulse_2s_infinite]" />
          <div className="absolute inset-0 w-full h-full border-2 border-dashed border-[#32FF8B]/20 rounded-full animate-spin duration-[15s]" />

          <div className="relative flex flex-col items-center justify-center">
            <div className="relative flex items-center justify-center w-16 h-16 bg-gradient-to-tr from-[#010C1B] to-[#0D1C2A] rounded-full border border-white/10 shadow-xl">
              <div className="absolute top-1 right-1 z-0 animate-[bounce_2s_infinite_100ms]">
                <TokenIcon symbol={toSymbol} size={28} />
              </div>
              <div className="absolute z-10 animate-[bounce_2s_infinite_700ms]" style={{ top: '14px', left: '14px' }}>
                <TokenIcon symbol={fromSymbol} size={32} />
              </div>
            </div>

            <div className="absolute -bottom-1 -left-1 bg-[#32FF8B] text-[#010C1B] p-1 rounded-full animate-spin duration-[6s] border border-[#32FF8B]/50 shadow-[0_0_12px_rgba(50,255,139,0.5)]">
              <RefreshCw className="w-3 h-3" />
            </div>
          </div>
        </div>

        {/* Title descriptions */}
        <div className="space-y-1 font-sans w-full">
          <h4 className="text-sm font-black text-white uppercase tracking-wider font-mono">
            Transaction Processing
          </h4>
          
          <p className="text-[13px] font-semibold text-white/90 px-2 leading-tight">
            Swapping <strong className="text-[#32FF8B] font-mono">{parseFloat(fromAmount || "0").toFixed(4)} {fromSymbol}</strong> for <strong className="text-[#32FF8B] font-mono">{parseFloat(toAmount || "0").toFixed(4)} {toSymbol}</strong>
          </p>
        </div>

        {/* Live Swap Milestones Indicator Panel */}
        <div className="w-full bg-[#010C1B]/80 border border-white/5 rounded-xl p-3 space-y-2 text-left font-mono text-[11px]">

          {/* Sign Transaction Milestone */}
          <div className="flex items-center justify-between">
            <span className="text-[#C5C1B9]">1. Wallet Signature approved</span>
            <div className="shrink-0 ml-2">
              {subStage1 === 'loading' && <Loader2 className="w-3 h-3 text-[#32FF8B] animate-spin" />}
              {subStage1 === 'done' && <Check className="w-3.5 h-3.5 text-[#32FF8B] bg-[#32FF8B]/10 rounded border border-[#32FF8B]/20 p-0.5" />}
            </div>
          </div>

          {/* Broadcast Contract Transaction Milestone */}
          <div className="flex items-center justify-between">
            <span className="text-[#C5C1B9]">2. Routing Bohr swap request</span>
            <div className="shrink-0 ml-2">
              {subStage2 === 'loading' && <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />}
              {subStage2 === 'done' && <Check className="w-3.5 h-3.5 text-[#32FF8B] bg-[#32FF8B]/10 rounded border border-[#32FF8B]/20 p-0.5" />}
              {subStage2 === 'pending' && <div className="w-2.5 h-2.5 rounded-full border border-dashed border-white/30" />}
            </div>
          </div>

          {/* VM Execution Validation Milestone */}
          <div className="flex items-center justify-between">
            <span className="text-[#C5C1B9]">3. Final blockchain receipt</span>
            <div className="shrink-0 ml-2">
              {subStage3 === 'loading' && <Loader2 className="w-3 h-3 text-teal-400 animate-spin" />}
              {subStage3 === 'done' && <Check className="w-3.5 h-3.5 text-[#32FF8B] bg-[#32FF8B]/10 rounded border border-[#32FF8B]/20 p-0.5" />}
              {subStage3 === 'pending' && <div className="w-2.5 h-2.5 rounded-full border border-dashed border-white/30" />}
            </div>
          </div>
        </div>

        <p className="text-[10px] text-[#C5C1B9] leading-snug uppercase tracking-wide font-mono">
          Please do not close this window while the chain confirms final success or fail status.
        </p>
      </div>
    </div>
    </ModalPortal>
  );
}

