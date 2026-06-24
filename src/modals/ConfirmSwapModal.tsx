import { X, ArrowDown, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import { TokenIcon } from '../components/TokenIcon';

interface ConfirmSwapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  fromAmount: string;
  fromSymbol: string;
  toAmount: string;
  toSymbol: string;
  priceRate: string;
  priceImpact?: string;
  slippageTolerance?: string;
  minimumReceived?: string;
  tradingFee?: string;
  isBridge?: boolean;
  fromChain?: string;
  toChain?: string;
}

export function ConfirmSwapModal({
  isOpen,
  onClose,
  onConfirm,
  fromAmount,
  fromSymbol,
  toAmount,
  toSymbol,
  priceRate,
  priceImpact = "0.30%",
  slippageTolerance = "0.50%",
  minimumReceived,
  tradingFee = "0.30%",
  isBridge = false,
  fromChain = "BOT Chain",
  toChain = "BNB Chain"
}: ConfirmSwapModalProps) {
  if (!isOpen) return null;

  const minRec = minimumReceived || (parseFloat(toAmount) * 0.995).toFixed(6);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#010C1B]/95 backdrop-blur-md animate-fade-in font-sans">
      <div 
        id="confirm_swap_modal"
        className="bg-[#0D1C2A] border border-white/10 text-[#F0F7F3] rounded-[24px] w-full max-w-[360px] p-5 shadow-2xl relative space-y-5 animate-scale-up border-b-[5px] border-b-[#32FF8B]"
      >
        {/* Header decoration */}
        <div className="flex justify-between items-center font-mono">
          <h3 className="text-xs font-black text-white uppercase tracking-wider">
            {isBridge ? "Confirm Bridge Tx" : "Confirm swap Tx"}
          </h3>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-white/5 rounded-xl text-[#C5C1B9] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Swap Visual Grid */}
        <div className="space-y-4">
          {/* Pay Amount Box */}
          <div className="flex justify-between items-center py-1 border-b border-white/5 pb-2">
            <span className="text-2xl font-black text-white tracking-tight shrink-0 truncate max-w-[180px] font-mono">
              {parseFloat(fromAmount || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-white tracking-widest uppercase font-mono">{fromSymbol}</span>
              <TokenIcon symbol={fromSymbol} size={24} />
            </div>
          </div>

          {/* Directional Downward Arrow */}
          <div className="flex justify-center -my-3.5 relative z-10">
            <div className="bg-[#010C1B] border border-white/10 p-1.5 rounded-full text-[#32FF8B] shadow-md animate-bounce-slow">
              <ArrowDown className="w-4 h-4" />
            </div>
          </div>

          {/* Receive Amount Box */}
          <div className="flex justify-between items-center py-1 pt-2">
            <span className="text-2xl font-black text-[#32FF8B] tracking-tight shrink-0 truncate max-w-[180px] font-mono">
              {parseFloat(toAmount || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-white tracking-widest uppercase font-mono">{toSymbol}</span>
              <TokenIcon symbol={toSymbol} size={24} />
            </div>
          </div>
        </div>

        {/* Bridge specific chain information card */}
        {isBridge && (
          <div className="bg-[#010C1B]/60 border border-white/5 rounded-xl p-3.5 space-y-1.5 text-xs font-sans">
            <div className="flex justify-between text-[#C5C1B9]">
              <span className="text-[10px] uppercase font-bold tracking-wider font-mono">Source network</span>
              <span className="font-bold text-white uppercase font-mono text-[10px]">{fromChain}</span>
            </div>
            <div className="flex justify-between text-[#C5C1B9]">
              <span className="text-[10px] uppercase font-bold tracking-wider font-mono">Destination network</span>
              <span className="font-bold text-[#32FF8B] uppercase font-mono text-[10px]">{toChain}</span>
            </div>
          </div>
        )}

        {/* Transaction Summary Card */}
        <div className="bg-[#010C1B]/80 border border-white/10 rounded-xl p-4.5 space-y-3 text-[11px] font-mono">
          <div className="flex justify-between items-center text-[#C5C1B9]">
            <span className="uppercase tracking-wider">Price Rate</span>
            <div className="flex items-center gap-1.5 font-bold text-white">
              <span>{priceRate}</span>
              <RefreshCw className="w-3 h-3 text-[#32FF8B] cursor-pointer hover:text-[#1FFF7D]" />
            </div>
          </div>

          <div className="flex justify-between items-center text-[#C5C1B9]">
            <span className="uppercase tracking-wider">Price impact</span>
            <span className={cn(
              "font-bold", 
              parseFloat(priceImpact) > 5 ? "text-amber-400" : "text-[#32FF8B]"
            )}>
              {priceImpact}
            </span>
          </div>

          <div className="flex justify-between items-center text-[#C5C1B9]">
            <span className="uppercase tracking-wider">Slippage</span>
            <span className="px-1.5 py-0.5 bg-[#32FF8B]/10 border border-[#32FF8B]/25 rounded text-[10px] font-black text-[#32FF8B]">
              {slippageTolerance}
            </span>
          </div>

          <div className="border-t border-white/5 my-2" />

          <div className="flex justify-between items-center text-[#C5C1B9]">
            <span className="uppercase tracking-wider">Min. Received</span>
            <span className="font-black text-white">{minRec} {toSymbol}</span>
          </div>

          <div className="flex justify-between items-center text-[#C5C1B9]">
            <span className="uppercase tracking-wider">Trading Fee</span>
            <span className="font-bold text-[#32FF8B]">{tradingFee}</span>
          </div>
        </div>

        {/* Footnote disclaimer */}
        <p className="text-[10px] text-[#C5C1B9] text-center leading-relaxed px-2">
          Output is estimated. You will receive at least <strong className="text-white font-mono">{minRec} {toSymbol}</strong> or the transaction will revert.
        </p>

        {/* Submit Button */}
        <button
          onClick={onConfirm}
          className="w-full py-3.5 rounded-xl bg-[#32FF8B] hover:bg-[#1FFF7D] text-[#010C1B] font-mono tracking-widest font-black text-xs uppercase transition-all duration-200 active:scale-[0.98] shadow-md hover:shadow-[0_0_20px_rgba(50,255,139,0.3)] cursor-pointer"
        >
          {isBridge ? "Confirm Bridge" : "Confirm swap"}
        </button>
      </div>
    </div>
  );
}
