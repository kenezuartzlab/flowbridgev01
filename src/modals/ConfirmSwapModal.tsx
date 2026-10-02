import { X, ArrowDown, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import { TokenIcon } from '../components/TokenIcon';
import { ModalPortal } from './ModalPortal';


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
  platformFee?: string;
  executionLabel?: string;
  transactionCount?: number;
  approvalCount?: number;
  dexCount?: number;
  routeSteps?: string[];
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
  platformFee = "0.1%",
  executionLabel,
  transactionCount,
  approvalCount,
  dexCount,
  routeSteps = [],
  isBridge = false,
  fromChain = "BOT Chain",
  toChain = "BNB Chain"
}: ConfirmSwapModalProps) {
  if (!isOpen) return null;

  const minRec = minimumReceived || (parseFloat(toAmount) * 0.995).toFixed(6);

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-background/92 backdrop-blur-md animate-fade-in font-sans">
      <div 
        id="confirm_swap_modal"
        className="bg-card border border-hairline text-foreground rounded-[20px] w-full max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain max-w-[340px] p-4 shadow-2xl relative space-y-3.5 animate-scale-up border-b-[4px] border-b-primary"
      >
        {/* Header decoration */}
        <div className="flex justify-between items-center font-mono">

          <h3 className="text-sm font-black text-foreground uppercase tracking-wider">
            {isBridge ? "Confirm Bridge Tx" : "Confirm swap Tx"}
          </h3>
          <button 
            onClick={onClose}
            aria-label="Close swap confirmation"
            className="p-1.5 hover:bg-foreground/5 rounded-xl text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Swap Visual Grid */}
        <div className="space-y-2.5">
          {/* Pay Amount Box */}
          <div className="flex justify-between items-center gap-2 border-b border-hairline pb-1.5">
            <span className="text-2xl font-black text-foreground tracking-tight truncate font-mono">
              {parseFloat(fromAmount || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[13px] font-black text-foreground tracking-widest uppercase font-mono">{fromSymbol}</span>
              <TokenIcon symbol={fromSymbol} size={20} />
            </div>
          </div>

          {/* Directional Downward Arrow */}
          <div className="flex justify-center -my-2.5 relative z-10">
            <div className="bg-background border border-hairline p-1 rounded-full text-primary shadow-md animate-bounce-slow">
              <ArrowDown className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* Receive Amount Box */}
          <div className="flex justify-between items-center gap-2 pt-1.5">
            <span className="text-2xl font-black text-[#32FF8B] tracking-tight truncate font-mono">
              {parseFloat(toAmount || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[13px] font-black text-foreground tracking-widest uppercase font-mono">{toSymbol}</span>
              <TokenIcon symbol={toSymbol} size={20} />
            </div>
          </div>
        </div>


        {/* Bridge specific chain information card */}
        {isBridge && (
          <div className="bg-background border border-hairline rounded-xl p-2.5 space-y-1 font-sans">
            <div className="flex justify-between gap-2 text-muted">
              <span className="text-[11px] uppercase font-bold tracking-wider font-mono">Source network</span>
              <span className="font-bold text-foreground uppercase font-mono text-[11px]">{fromChain}</span>
            </div>
            <div className="flex justify-between gap-2 text-muted">
              <span className="text-[11px] uppercase font-bold tracking-wider font-mono">Destination network</span>
              <span className="font-bold text-[#32FF8B] uppercase font-mono text-[11px]">{toChain}</span>
            </div>
          </div>
        )}

        {/* Transaction Summary Card */}
        <div className="bg-background border border-hairline rounded-xl p-3 space-y-2 text-[12px] font-mono shadow-inner">

          {executionLabel && <div className="flex justify-between items-center text-muted"><span className="uppercase tracking-wider">Execution</span><span className="font-black text-foreground">{executionLabel}</span></div>}
          {transactionCount != null && <div className="flex justify-between items-center text-muted"><span className="uppercase tracking-wider">Transactions</span><span className="font-black text-foreground">{transactionCount}</span></div>}
          {transactionCount != null && dexCount != null && <p className="rounded-lg bg-card px-2 py-1.5 text-[10.5px] text-foreground border border-hairline">This route uses {dexCount} DEX{dexCount === 1 ? "" : "s"} and requires {transactionCount} transaction{transactionCount === 1 ? "" : "s"}.</p>}
          {approvalCount != null && <div className="flex justify-between items-center text-muted"><span className="uppercase tracking-wider">Approvals required</span><span className="font-black text-foreground">{approvalCount}</span></div>}
          {routeSteps.map((step) => <p key={step} className="text-[10.5px] text-muted">{step}</p>)}
          {executionLabel?.includes("STAGED") && <p className="text-[10.5px] text-amber-200">Each next stage is re-quoted after confirmation. If a later stage stops, earlier assets remain in your wallet.</p>}

          <div className="flex justify-between items-center text-muted">
            <span className="uppercase tracking-wider">Price Rate</span>
            <div className="flex items-center gap-1.5 font-bold text-foreground">
              <span>{priceRate}</span>
              <RefreshCw className="w-3 h-3 text-[#32FF8B] cursor-pointer hover:text-[#1FFF7D]" />
            </div>
          </div>

          <div className="flex justify-between items-center text-muted">
            <span className="uppercase tracking-wider">Price impact</span>
            <span className={cn(
              "font-bold", 
              parseFloat(priceImpact) > 5 ? "text-amber-400" : "text-[#32FF8B]"
            )}>
              {priceImpact}
            </span>
          </div>

          <div className="flex justify-between items-center text-muted">
            <span className="uppercase tracking-wider">Slippage</span>
            <span className="px-1.5 py-0.5 bg-[#32FF8B]/10 border border-[#32FF8B]/25 rounded text-[12px] font-black text-[#32FF8B]">
              {slippageTolerance}
            </span>
          </div>

          <div className="border-t border-hairline my-2" />

          <div className="flex justify-between items-center text-muted">
            <span className="uppercase tracking-wider">Min. Received</span>
            <span className="font-black text-foreground">{minRec} {toSymbol}</span>
          </div>

          <div className="flex justify-between items-center text-muted">
            <span className="uppercase tracking-wider">Trading Fee</span>
            <span className="font-bold text-[#32FF8B]">{tradingFee}</span>
          </div>

          {!isBridge && (
            <div className="flex justify-between items-center text-muted">
              <span className="uppercase tracking-wider">Platform Fee</span>
              <span className="font-bold text-[#32FF8B]">{platformFee}</span>
            </div>
          )}

        </div>

        {/* Footnote disclaimer */}
        <p className="text-[11px] text-muted text-center leading-snug px-1">
          Output is estimated. {!isBridge && `A ${platformFee} platform fee is charged by FlowBridge. `}You will receive at least <strong className="text-foreground font-mono">{minRec} {toSymbol}</strong> or the transaction will revert.
        </p>

        {/* Submit Button */}
        <button
          onClick={onConfirm}
          className="w-full py-3 rounded-xl bg-primary hover:bg-primary-strong text-primary-foreground font-mono tracking-widest font-black text-[13px] uppercase transition-all duration-200 active:scale-[0.98] shadow-md fb-glow cursor-pointer"
        >
          {isBridge ? "Confirm Bridge" : "Confirm swap"}
        </button>
      </div>
    </div>
    </ModalPortal>
  );
}

