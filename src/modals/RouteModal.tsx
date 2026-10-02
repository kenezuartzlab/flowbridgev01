import { X, Info } from 'lucide-react';
import { TokenIcon } from '../components/TokenIcon';
import { ModalPortal } from './ModalPortal';

interface RouteModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromSymbol: string;
  toSymbol: string;
  poolFee?: string;
}

export function RouteModal({
  isOpen,
  onClose,
  fromSymbol,
  toSymbol,
  poolFee = "0.30%"
}: RouteModalProps) {
  if (!isOpen) return null;

  // Render text for helper label
  const isCaryPactDirect = fromSymbol === 'CA' || toSymbol === 'CA';

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-background/92 backdrop-blur-md animate-fade-in font-sans">
      <div 
        id="route_modal"
        className="bg-card border border-hairline text-foreground rounded-[20px] sm:rounded-[24px] w-full max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain max-w-[360px] p-4 sm:p-6 shadow-2xl relative flex flex-col space-y-6 animate-scale-up border-b-[5px] border-b-primary"
      >
        {/* Header container */}
        <div className="flex justify-between items-center font-mono text-sm">
          <div className="flex items-center gap-1.5 text-foreground">
            <h3 className="font-black uppercase tracking-wider">Algorithmic Route</h3>
            <span className="p-0.5 bg-white/5 rounded text-[#C5C1B9] hover:text-white cursor-help">
              <Info className="w-4 h-4" />
            </span>
          </div>
          <button 
            onClick={onClose}
            aria-label="Close route details"
            className="p-1.5 hover:bg-foreground/5 rounded-xl text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Route Graph Box */}
        <div className="bg-background border border-hairline rounded-2xl p-6 flex items-center justify-between relative overflow-hidden font-mono">
          
          {/* Node 1: Origin Token */}
          <div className="flex flex-col items-center gap-1.5 z-10">
            <TokenIcon symbol={fromSymbol} size={36} className="hover:scale-105 transition-transform" />
            <span className="text-[12px] font-black tracking-tight text-[#32FF8B]">100%</span>
            <span className="text-[11px] font-bold text-muted uppercase tracking-wider">{fromSymbol}</span>
          </div>

          {/* Dotted Connection line 1 */}
          <div className="flex-1 h-0.5 border-b-2 border-dashed border-white/10 mx-2 relative top-[-10px]" />

          {/* Node 2: Intermediary Pool */}
          <div className="flex flex-col items-center gap-1.5 z-10">
            <div className="flex items-center -space-x-3.5">
              <TokenIcon symbol={fromSymbol} size={36} className="hover:scale-105 transition-transform" />
              <TokenIcon symbol={toSymbol} size={36} className="hover:scale-105 transition-transform" />
            </div>
            
            <span className="px-2 py-0.5 bg-[#32FF8B]/10 border border-[#32FF8B]/20 rounded-md text-[11px] font-black text-[#32FF8B] mt-1.5 uppercase shadow-inner tracking-wider">
              {isCaryPactDirect ? "V2 0.30%" : `V3 ${poolFee}`}
            </span>
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-0.5">Router</span>
          </div>

          {/* Dotted Connection line 2 */}
          <div className="flex-1 h-0.5 border-b-2 border-dashed border-white/10 mx-2 relative top-[-10px]" />

          {/* Node 3: Target Token */}
          <div className="flex flex-col items-center gap-1.5 z-10">
            <TokenIcon symbol={toSymbol} size={36} className="hover:scale-105 transition-transform" />
            <span className="text-[12px] font-black tracking-tight text-[#32FF8B]">100%</span>
            <span className="text-[11px] font-bold text-muted uppercase tracking-wider">{toSymbol}</span>
          </div>
        </div>

        {/* Informative description */}
        <div className="space-y-3 px-1 text-sm text-muted leading-relaxed">
          <p>
            The Ecosurge router dynamically bundles pooled liquidity, optimizing gas fee routing and slippage impact.
          </p>
          <div className="p-3 bg-[#010C1B]/60 rounded-xl border border-white/5 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#32FF8B] animate-pulse shrink-0" />
            <span className="text-[12px] font-semibold text-white/80 font-mono uppercase tracking-wide">
              {isCaryPactDirect 
                ? "Direct Bohr VM Smart Contract execution"
                : "Optimized multi-hop cross-pool path loaded"
              }
            </span>
          </div>
        </div>

        {/* Dismiss Button */}
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-primary hover:bg-primary-strong text-primary-foreground font-mono tracking-widest font-black text-sm uppercase transition-all duration-150 active:scale-95 cursor-pointer fb-glow"
        >
          Confirm Route
        </button>
      </div>
    </div>
    </ModalPortal>
  );
}
