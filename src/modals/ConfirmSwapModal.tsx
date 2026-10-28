import { ArrowDown, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import { TokenIcon } from '../components/TokenIcon';
import { TransactionModalFrame } from './TransactionModalFrame';
import { Button } from '@/components/ui/button';


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
  /** Exact route-specific fee read from the selected router before signing. */
  feeBreakdown?: import("@/lib/swap/feeDisclosure").FeeBreakdown | null;
  executionLabel?: string;
  transactionCount?: number;
  approvalCount?: number;
  dexCount?: number;
  routeSteps?: string[];
  confirmDisabled?: boolean;
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
  platformFee = "checked before signing",
  feeBreakdown,
  executionLabel,
  transactionCount,
  approvalCount,
  dexCount,
  routeSteps = [],
  confirmDisabled = false,
  isBridge = false,
  fromChain = "BOT Chain",
  toChain = "BNB Chain"
}: ConfirmSwapModalProps) {
  if (!isOpen) return null;

  const minRec = minimumReceived || (parseFloat(toAmount) * 0.995).toFixed(6);

  return (
    <TransactionModalFrame id="confirm_swap_modal" title={isBridge ? "Confirm Bridge Tx" : "Confirm Swap Tx"} onClose={onClose}
      footer={<Button disabled={confirmDisabled} onClick={onConfirm} className="w-full h-11 font-bold uppercase">{confirmDisabled ? "Review unavailable — retry" : isBridge ? "Confirm Bridge" : "Confirm Swap"}</Button>}>
        {/* Swap Visual Grid */}
        <div className="space-y-2.5">
          {/* Pay Amount Box */}
          <div className="flex justify-between items-center gap-2 border-b border-hairline pb-1.5">
            <span className="text-xl font-black text-foreground break-all font-mono">
              {parseFloat(fromAmount || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[13px] font-black text-foreground uppercase font-mono">{fromSymbol}</span>
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
            <span className="text-xl font-black text-primary break-all font-mono">
              {parseFloat(toAmount || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[13px] font-black text-foreground uppercase font-mono">{toSymbol}</span>
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
              <span className="font-bold text-primary uppercase font-mono text-[11px]">{toChain}</span>
            </div>
          </div>
        )}

        <div className="space-y-1 text-xs font-mono">
          {executionLabel && <p>Route: <strong>{executionLabel}</strong></p>}
          {transactionCount != null && <p>{dexCount ?? 1} DEX stages · {transactionCount} transactions · {approvalCount ?? 0} approvals</p>}
          {!isBridge && <p>Minimum received: <strong>{minRec} {toSymbol}</strong></p>}
          <p>{isBridge ? "Bridge Fee" : "Trading Fee"}: {tradingFee}</p>
          {!isBridge && <p>Protocol Fee: {feeBreakdown?.percent ?? platformFee}</p>}
          {!isBridge && parseFloat(priceImpact) > 5 && <p className="text-warning">High price impact: {priceImpact}. Review the estimated output carefully.</p>}
          {executionLabel?.includes("STAGED") && <p className="text-warning">Each next stage is re-quoted after confirmation. If a later stage stops, earlier assets remain in your wallet.</p>}
        </div>
        <p className="text-xs text-muted">{isBridge ? "Destination delivery requires relay processing and destination confirmation. Origin success does not confirm receipt." : `Output is estimated. You receive at least ${minRec} ${toSymbol} or the transaction reverts.`}</p>
        <details className="text-xs">
          <summary className="cursor-pointer py-2 font-semibold text-primary">Technical details</summary>
        {/* Transaction Summary Card */}
        <div className="bg-background border border-hairline rounded-lg p-3 space-y-2 text-[12px] font-mono shadow-inner">

          {executionLabel && <div className="flex justify-between items-start gap-3 text-muted"><span className="uppercase tracking-wider">Execution</span><span className="font-black text-foreground">{executionLabel}</span></div>}
          {transactionCount != null && <div className="flex justify-between items-start gap-3 text-muted"><span className="uppercase tracking-wider">Transactions</span><span className="font-black text-foreground">{transactionCount}</span></div>}
          {transactionCount != null && dexCount != null && <p className="rounded-lg bg-card px-2 py-1.5 text-[10.5px] text-foreground border border-hairline">This route uses {dexCount} DEX{dexCount === 1 ? "" : "s"} and requires {transactionCount} transaction{transactionCount === 1 ? "" : "s"}.</p>}
          {approvalCount != null && <div className="flex justify-between items-start gap-3 text-muted"><span className="uppercase tracking-wider">Approvals required</span><span className="font-black text-foreground">{approvalCount}</span></div>}
          {routeSteps.map((step) => <p key={step} className="text-[10.5px] text-muted">{step}</p>)}
          

          <div className="flex justify-between items-start gap-3 text-muted">
            <span className="uppercase tracking-wider">Price Rate</span>
            <div className="flex items-center gap-1.5 font-bold text-foreground">
              <span>{priceRate}</span>
              <RefreshCw className="w-3 h-3 text-primary cursor-pointer hover:text-primary" />
            </div>
          </div>

          <div className="flex justify-between items-start gap-3 text-muted">
            <span className="uppercase tracking-wider">Price impact</span>
            <span className={cn(
              "font-bold", 
              parseFloat(priceImpact) > 5 ? "text-warning" : "text-primary"
            )}>
              {priceImpact}
            </span>
          </div>

          <div className="flex justify-between items-start gap-3 text-muted">
            <span className="uppercase tracking-wider">Slippage</span>
            <span className="px-1.5 py-0.5 bg-primary/10 border border-primary/25 rounded text-[12px] font-black text-primary">
              {slippageTolerance}
            </span>
          </div>

          <div className="border-t border-hairline my-2" />

          <div className="flex justify-between items-start gap-3 text-muted">
            <span className="uppercase tracking-wider">Min. Received</span>
            <span className="font-black text-foreground">{minRec} {toSymbol}</span>
          </div>

          <div className="flex justify-between items-start gap-3 text-muted">
            <span className="uppercase tracking-wider">Trading Fee</span>
            <span className="font-bold text-primary">{tradingFee}</span>
          </div>

          {!isBridge && (
            <div className="flex justify-between items-start gap-3 text-muted">
              <span className="uppercase tracking-wider">Protocol fee</span>
              <span className="font-bold text-primary">{feeBreakdown?.percent ?? platformFee}</span>
            </div>
          )}
          {!isBridge && feeBreakdown && (
            <>
              <div className="flex justify-between items-start gap-3 text-muted"><span className="uppercase tracking-wider">Swap amount</span><span className="font-bold text-foreground break-all text-right">{feeBreakdown.swapAmount}</span></div>
              <div className="flex justify-between items-start gap-3 text-muted"><span className="uppercase tracking-wider">Fee amount</span><span className="font-bold text-foreground break-all text-right">{feeBreakdown.fee}</span></div>
              <div className="flex justify-between items-start gap-3 text-muted"><span className="uppercase tracking-wider">Total</span><span className="font-black text-foreground break-all text-right">{feeBreakdown.total}</span></div>
            </>
          )}

        </div>

        </details>
    </TransactionModalFrame>
  );
}
