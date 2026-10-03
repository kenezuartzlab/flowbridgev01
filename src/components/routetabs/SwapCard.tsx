import { ArrowDownUp, ChevronDown, Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAppConfig, feeBpsLabel } from "@/lib/config/appConfig";
import { cn } from '../../lib/utils';
import { WarningPanel } from './WarningPanel';
import { FeePanel } from './FeePanel';
import { TokenIcon } from '../TokenIcon';
import { PriceTrendChart } from './PriceTrendChart';

interface TokenInputProps {
  label: string;
  amount: string;
  symbol: string;
  usdValue: string;
  balance: string;
  maxAmount?: string;
  onChange?: (val: string) => void;
  readOnly?: boolean;
}

function TokenInput({ label, amount, symbol, usdValue, balance, maxAmount, onChange, readOnly }: TokenInputProps) {
  // Admin-published platform fee (bps), mirrors FlowBridgeRouter's globalFeeBps.
  const feeLabel = feeBpsLabel(useAppConfig().fees.platformFeeBps);
  const [clamped, setClamped] = useState(false);
  // Percentage chips reveal on focus and disappear on blur.
  const [focused, setFocused] = useState(false);
  const maxNum = maxAmount != null ? parseFloat(maxAmount) : NaN;
  const hasMax = isFinite(maxNum) && maxNum > 0;
  const showPercents = !readOnly && !!onChange && focused && hasMax;

  const applyPercent = (pct: number) => {
    if (!onChange || !hasMax) return;
    setClamped(false);
    if (pct >= 1) return onChange(maxAmount as string);
    // Truncate (never round up) so the result stays spendable.
    const val = Math.floor(maxNum * pct * 1e8) / 1e8;
    onChange(val > 0 ? String(val) : '');
  };


  const handleMaxClick = () => {
    if (!readOnly && onChange) {
      // Use the exact spendable amount when supplied; display balances can be rounded/truncated.
      const nextValue = maxAmount || balance;
      const parsed = parseFloat(nextValue);
      setClamped(false);
      if (!isNaN(parsed)) {
        onChange(nextValue);
      } else {
        onChange(balance);
      }
    }
  };

  // Free typing: any amount is allowed so users can preview quotes. Amounts above
  // the spendable maximum (balance minus the 0.1% platform fee taken on top) are
  // flagged below and blocked by the action button instead of being rewritten.
  const handleInputChange = (val: string) => {
    if (!onChange) return;
    const n = parseFloat(val);
    setClamped(hasMax && isFinite(n) && n > maxNum);
    onChange(val);
  };



  return (
    <div className="bg-background/75 border border-foreground/15 px-3 py-2.5 rounded-xl space-y-1.5 font-sans shadow-inner">
      {/* Top Row: Label and Balance */}
      <div className="flex justify-between items-center text-[11px] font-black text-muted uppercase tracking-wider font-mono">

        <span>{label}</span>
        <div className="flex items-center gap-1.5 font-bold">
          <span 
            onClick={!readOnly ? handleMaxClick : undefined}
            className={cn(
              "text-muted normal-case font-mono font-bold",
              !readOnly && "cursor-pointer hover:text-primary transition-colors"
            )}
          >
            Balance: {balance}
          </span>
          {!readOnly && onChange && (
            <button
              type="button"
              onClick={handleMaxClick}
              className="bg-primary/10 hover:bg-primary/20 active:scale-95 text-primary border border-primary/25 px-1.5 py-0.5 rounded text-[10px] font-black tracking-widest uppercase transition-all duration-150 cursor-pointer shadow-none"
            >
              Max
            </button>
          )}
        </div>
      </div>

      {/* Middle Row: Value & Token Symbol */}
      <div className="flex justify-between items-center gap-2">
        <div className="flex-1 min-w-0">
          {readOnly ? (
            (() => {
              const display = amount ? parseFloat(amount).toFixed(8) : '0.00000000';
              const size =
                display.length > 16 ? 'text-xl sm:text-2xl'
                : display.length > 12 ? 'text-2xl sm:text-3xl'
                : 'text-3xl sm:text-4xl';
              return (
                <div
                  title={display}
                  className={cn(
                    'font-black text-foreground leading-none h-[40px] flex items-center truncate font-mono',
                    size,
                  )}
                >
                  {display}
                </div>
              );
            })()
          ) : (
            <input
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 150)}
              value={amount}
              onChange={(e) => handleInputChange(e.target.value)}
              className={cn(
                'bg-transparent text-foreground font-black w-full min-w-0 focus:outline-none placeholder:text-muted/40 leading-none h-[40px] font-mono',
                amount.length > 16 ? 'text-xl sm:text-2xl' : amount.length > 12 ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl',
              )}
            />
          )}
        </div>


        <div className="bg-card/90 pl-1 pr-2 py-1 rounded-full flex items-center gap-1.5 shrink-0 border border-foreground/15 font-mono max-w-[46%]">
          <TokenIcon symbol={symbol} size={20} />
          <span className="font-black text-[13px] text-foreground tracking-wide uppercase truncate">{symbol}</span>
        </div>
      </div>

      {showPercents && (
        <div className="flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
          {[0.25, 0.5, 0.75, 1].map((p) => (
            <button
              key={p}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyPercent(p)}
              className="flex-1 py-1 rounded-lg bg-card border border-foreground/15 text-[10px] font-black tracking-widest uppercase text-muted hover:text-primary hover:border-primary/30 active:scale-95 transition font-mono cursor-pointer"
            >
              {p === 1 ? 'Max' : `${p * 100}%`}
            </button>
          ))}
        </div>
      )}




      {/* Bottom Row: Estimated USD value */}
      <div className="text-muted font-medium flex items-center text-[12px] font-mono leading-none">
        <span>≈ {usdValue}</span>
      </div>

      {!readOnly && clamped && (
        <p className="text-[11px] font-mono leading-snug text-[#FFC46B]">
          Preview only — above your spendable balance. Max swappable is {maxNum.toFixed(6)} {symbol} ({feeLabel} fee taken on top). Tap MAX to fill it.
        </p>
      )}
    </div>
  );

}

interface SwapCardProps {
  fromSymbol: string;
  toSymbol: string;
  fromAmount: string;
  toAmount: string;
  fromUsdValue: string;
  toUsdValue: string;
  fromBalance: string;
  toBalance: string;
  fromMaxAmount?: string;
  onFromAmountChange: (val: string) => void;
  onSubmit: () => void;
  onToggleDirection?: () => void;
  buttonLabel: string;
  buttonDisabled?: boolean;
  networkWarning?: string;
  warningMessage?: string;
  successMessage?: string;
  infoMessage?: string;
  onShowRoute?: () => void;
  onReset?: () => void;
  txHash?: string;
  txUrlPrefix?: string;
  // Bohr DEX Aggregator Pro features
  showAggregatorSelector?: boolean;
  selectedPair?: string;
  onPairChange?: (pair: string) => void;
  isFlowUnlocked?: boolean;
  livePrice?: number;
}

export function SwapCard({
  fromSymbol,
  toSymbol,
  fromAmount,
  toAmount,
  fromUsdValue,
  toUsdValue,
  fromBalance,
  toBalance,
  fromMaxAmount,
  onFromAmountChange,
  onSubmit,
  onToggleDirection,
  buttonLabel,
  buttonDisabled,
  networkWarning,
  warningMessage,
  successMessage,
  infoMessage,
  onShowRoute,
  onReset,
  txHash,
  txUrlPrefix,
  showAggregatorSelector,
  selectedPair,
  onPairChange,
  isFlowUnlocked = false,
  livePrice
}: SwapCardProps) {
  const platformFeeLabel = feeBpsLabel(useAppConfig().fees.platformFeeBps);
  const isBotUsdtPair = 
    (showAggregatorSelector && selectedPair === 'BOT/USDT') || 
    (!showAggregatorSelector && (
      (fromSymbol === 'BOT' && toSymbol === 'USDT') || 
      (fromSymbol === 'USDT' && toSymbol === 'BOT')
    ));

  return (
    <div className="flex flex-col flex-1 relative z-10 w-full space-y-4">
      {/* Aggregator selector selector */}
      {showAggregatorSelector && (
        <div className="bg-card/60 border border-foreground/15 rounded-2xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono">
          <div className="flex flex-col text-left w-full sm:w-auto">
            <span className="text-[11px] text-primary uppercase font-black tracking-widest">Bohr DEX Aggregator (Pro)</span>
            <span className="text-[12px] text-foreground/50">Multi-routing non-custodial engine</span>
          </div>
          <PairDropdown
            value={selectedPair ?? 'BOT/USDT'}
            onChange={(v) => onPairChange?.(v)}
            isFlowUnlocked={isFlowUnlocked}
          />
        </div>
      )}


      {/* 1. INPUT CARD BLOCK with enhanced border-foreground/20 visibility */}
      <div className="bg-card/70 border border-foreground/20 rounded-[20px] shadow-2xl p-3 sm:p-3.5 relative space-y-2">
        <TokenInput
          label="You pay"
          amount={fromAmount}
          symbol={fromSymbol}
          usdValue={fromUsdValue}
          balance={fromBalance}
          maxAmount={fromMaxAmount}
          onChange={onFromAmountChange}
        />
        
        {/* Switch pair button centered between boxes */}
        <div className="flex justify-center -my-5 relative z-20">
          <button 
            type="button"
            onClick={onToggleDirection}
            className="bg-card border border-foreground/20 text-muted hover:text-primary hover:border-primary/35 p-1.5 rounded-lg shadow-lg hover:rotate-180 transition-all duration-300 active:scale-90 cursor-pointer"
            title="Switch direction"
            aria-label="Switch swap direction"
          >

            <ArrowDownUp className="w-3.5 h-3.5" />
          </button>
        </div>


        <TokenInput
          label="You receive"
          amount={toAmount}
          symbol={toSymbol}
          usdValue={toUsdValue}
          balance={toBalance}
          readOnly
        />
      </div>

      {/* 2. MAIN SWAP BUTTON (Right below the card container) */}
      <div className="font-sans">
        <button
          onClick={onSubmit}
          disabled={buttonDisabled}
          className={cn(
            "w-full py-4 rounded-2xl text-sm font-black tracking-widest uppercase transition-all flex justify-center items-center gap-2 cursor-pointer",
            buttonDisabled 
              ? "bg-foreground/5 text-muted/45 border border-foreground/10 cursor-not-allowed shadow-none" 
              : "bg-primary hover:bg-primary-strong text-primary-foreground shadow-[0_0_16px_rgba(50,255,139,0.25)] hover:shadow-[0_0_24px_rgba(50,255,139,0.45)] hover:scale-[1.01] active:scale-[0.99]"
          )}
        >
          <span>{buttonLabel}</span>
        </button>
      </div>

      {/* 3. DETAILS & FEEDBACKS (Rendered below the action button) */}
      {fromAmount && parseFloat(fromAmount) > 0 && toAmount && parseFloat(toAmount) > 0 && (
        <div className="space-y-2.5">
          <FeePanel 
            rows={[
              { label: 'Dex Swap Fee', value: '0.3%' },
              { label: 'Platform Fee', value: platformFeeLabel },
              { label: 'Slippage Tolerance', value: '0.1%' },
              { label: 'Exchange Rate', value: `1 ${fromSymbol} ≈ ${(parseFloat(toAmount) / parseFloat(fromAmount)).toFixed(8)} ${toSymbol}` }
            ]}
          />
          <p className="px-1 font-mono text-[10px] leading-relaxed text-muted/60">
            Quotes are live executable amounts from the on-chain routers, including CA's
            temporary sell tax. Market/chart prices (Ave.ai, CaryPact) exclude that tax, so
            they read higher than what a sell actually returns.
          </p>
          {onShowRoute && (
            <div className="flex justify-between items-center bg-primary/5 border border-primary/15 rounded-xl px-3 py-2 text-[12px] font-bold text-foreground shadow-sm font-mono">
              <span className="text-muted flex items-center gap-1 uppercase tracking-wider">
                Routing Path
              </span>
              <button 
                type="button" 
                onClick={onShowRoute}
                className="text-primary hover:text-primary hover:underline flex items-center gap-1.5 font-bold cursor-pointer transition-colors"
                id="show_route_btn"
              >
                1 on-chain route
                <span className="text-[11px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-black shrink-0 tracking-widest">VIEW</span>
              </button>
            </div>
          )}
        </div>
      )}

      {networkWarning && (
        <WarningPanel type="error" message={networkWarning} />
      )}
      
      {warningMessage && !networkWarning && (
        <WarningPanel type="warning" message={warningMessage} />
      )}
      
      {infoMessage && !networkWarning && (
        <WarningPanel type="info" message={infoMessage} />
      )}
      
      {successMessage && !networkWarning && (
        <div className="flex flex-col gap-2.5 font-sans">
          <WarningPanel type="info" title="Success" message={successMessage} txHash={txHash} txUrlPrefix={txUrlPrefix} />
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="w-full py-2.5 px-4 bg-foreground/5 hover:bg-foreground/10 text-foreground font-mono text-[12px] tracking-widest uppercase font-black rounded-xl transition duration-150 active:scale-98 border border-foreground/10 cursor-pointer shadow-inner text-center"
            >
              Start New Swap
            </button>
          )}
        </div>
      )}

      {/* Mini Price Trend Chart for BOT/USDT placed elegantly at the bottom */}
      {isBotUsdtPair && (
        <PriceTrendChart currentLivePrice={livePrice} />
      )}
    </div>
  );
}

interface PairDropdownProps {
  value: string;
  onChange: (value: string) => void;
  isFlowUnlocked?: boolean;
}

function PairDropdown({ value, onChange, isFlowUnlocked }: PairDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const options: { value: string; label: string; locked?: boolean }[] = [
    { value: 'BOT/USDT', label: 'BOT / USDT (Standard)' },
    { value: 'CA/BOT', label: 'CA / BOT' },
    { value: 'CA/USDT', label: 'CA / USDT' },
    { value: 'FLOW/BOT', label: 'FLOW / BOT', locked: !isFlowUnlocked },
    { value: 'FLOW/USDT', label: 'FLOW / USDT', locked: !isFlowUnlocked },
  ];

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const current = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative w-full sm:w-auto">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="bg-background border border-foreground/10 rounded-xl px-3 py-1.5 text-sm font-black text-foreground focus:outline-none cursor-pointer w-full sm:w-auto uppercase flex items-center justify-between gap-2 min-w-[180px] hover:border-foreground/25 transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{current?.label ?? value}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-foreground/60 transition-transform shrink-0', open && 'rotate-180')} />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1.5 right-0 left-0 sm:left-auto sm:min-w-[220px] bg-background border border-foreground/15 rounded-xl shadow-2xl overflow-hidden py-1"
        >
          {options.map(opt => {
            const selected = opt.value === value;
            return (
              <li key={opt.value}>
                <button
                  type="button"
                  onClick={() => {
                    if (opt.locked) return;
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-[13px] font-black uppercase tracking-wider flex items-center justify-between gap-2 transition-colors',
                    opt.locked
                      ? 'text-foreground/30 cursor-not-allowed'
                      : 'text-foreground hover:bg-primary/10 hover:text-primary cursor-pointer'
                  )}
                  disabled={opt.locked}
                >
                  <span className="truncate">
                    {opt.label} {opt.locked && <span className="text-[11px] ml-1">🔒</span>}
                  </span>
                  {selected && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
