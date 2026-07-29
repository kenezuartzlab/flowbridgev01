import { ArrowDownUp, ChevronDown, Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
  const [clamped, setClamped] = useState(false);
  const maxNum = maxAmount != null ? parseFloat(maxAmount) : NaN;
  const hasMax = isFinite(maxNum) && maxNum > 0;

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

  // Hard-clamp typed input to the spendable maximum (balance minus the 0.1%
  // platform fee the router charges on top) so a swap can never be submitted
  // for more than the wallet can cover.
  const handleInputChange = (val: string) => {
    if (!onChange) return;
    setClamped(false);
    if (hasMax) {
      const n = parseFloat(val);
      if (isFinite(n) && n > maxNum) {
        setClamped(true);
        onChange(maxAmount as string);
        return;
      }
    }
    onChange(val);
  };

  const maxHint = hasMax
    ? `Max swappable ${maxNum.toFixed(6)} ${symbol} — the 0.1% platform fee is charged on top of your amount.`
    : undefined;


  return (
    <div className="bg-[#010C1B]/75 border border-white/15 p-4 rounded-xl space-y-3 font-sans shadow-inner">
      {/* Top Row: Label and Balance */}
      <div className="flex justify-between items-center text-[12px] font-black text-[#C5C1B9] uppercase tracking-wider font-mono">
        <span>{label}</span>
        <div className="flex items-center gap-1.5 font-bold">
          <span 
            onClick={!readOnly ? handleMaxClick : undefined}
            className={cn(
              "text-[#C5C1B9] normal-case font-mono font-bold",
              !readOnly && "cursor-pointer hover:text-[#32FF8B] transition-colors"
            )}
          >
            Balance: {balance}
          </span>
          {!readOnly && onChange && (
            <button
              type="button"
              onClick={handleMaxClick}
              className="bg-[#32FF8B]/10 hover:bg-[#32FF8B]/20 active:scale-95 text-[#32FF8B] border border-[#32FF8B]/25 px-1.5 py-0.5 rounded text-[10px] font-black tracking-widest uppercase transition-all duration-150 cursor-pointer shadow-none"
            >
              Max
            </button>
          )}
        </div>
      </div>

      {/* Middle Row: Value & Token Symbol */}
      <div className="flex justify-between items-center gap-2.5 sm:gap-3">
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
                    'font-black text-white leading-none h-[44px] flex items-center truncate font-mono',
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
              value={amount}
              onChange={(e) => handleInputChange(e.target.value)}
              className={cn(
                'bg-transparent text-white font-black w-full min-w-0 focus:outline-none placeholder:text-[#C5C1B9]/40 leading-none h-[44px] font-mono',
                amount.length > 16 ? 'text-xl sm:text-2xl' : amount.length > 12 ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl',
              )}
            />
          )}
        </div>


        <div className="bg-[#0D1C2A]/90 px-3 py-1.5 rounded-xl flex items-center gap-2 shrink-0 border border-white/15 shadow-sm font-mono">
          <TokenIcon symbol={symbol} size={22} />
          <span className="font-black text-sm text-[#FFFFFF] tracking-widest uppercase">{symbol}</span>
        </div>
      </div>

      {/* Bottom Row: Estimated USD value */}
      <div className="text-[#C5C1B9] font-medium flex items-center text-[12px] font-mono leading-none">
        <span>≈ {usdValue}</span>
      </div>

      {!readOnly && (clamped || maxHint) && (
        <p className={cn('text-[11px] font-mono leading-snug', clamped ? 'text-[#FFC46B]' : 'text-[#C5C1B9]/70')}>
          {clamped
            ? `Amount capped to your spendable balance (${maxNum.toFixed(6)} ${symbol}).`
            : maxHint}
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
        <div className="bg-[#0D1C2A]/60 border border-white/15 rounded-2xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono">
          <div className="flex flex-col text-left w-full sm:w-auto">
            <span className="text-[11px] text-[#32FF8B] uppercase font-black tracking-widest">Bohr DEX Aggregator (Pro)</span>
            <span className="text-[12px] text-white/50">Multi-routing non-custodial engine</span>
          </div>
          <PairDropdown
            value={selectedPair ?? 'BOT/USDT'}
            onChange={(v) => onPairChange?.(v)}
            isFlowUnlocked={isFlowUnlocked}
          />
        </div>
      )}


      {/* 1. INPUT CARD BLOCK with enhanced border-white/20 visibility */}
      <div className="bg-[#0D1C2A]/70 border border-white/20 rounded-[20px] shadow-2xl p-4.5 relative space-y-2.5">
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
        <div className="flex justify-center -my-6.5 relative z-20">
          <button 
            type="button"
            onClick={onToggleDirection}
            className="bg-[#0D1C2A] border border-white/25 text-[#C5C1B9] hover:text-[#32FF8B] hover:border-[#32FF8B]/35 p-2 rounded-xl shadow-lg hover:rotate-180 transition-all duration-300 active:scale-90 cursor-pointer"
            title="Switch direction"
            aria-label="Switch swap direction"
          >

            <ArrowDownUp className="w-4 h-4" />
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
              ? "bg-white/5 text-[#C5C1B9]/45 border border-white/10 cursor-not-allowed shadow-none" 
              : "bg-[#32FF8B] hover:bg-[#1FFF7D] text-[#010C1B] shadow-[0_0_16px_rgba(50,255,139,0.25)] hover:shadow-[0_0_24px_rgba(50,255,139,0.45)] hover:scale-[1.01] active:scale-[0.99]"
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
              { label: 'Platform Fee', value: '0.1%' },
              { label: 'Slippage Tolerance', value: '0.1%' },
              { label: 'Exchange Rate', value: `1 ${fromSymbol} ≈ ${(parseFloat(toAmount) / parseFloat(fromAmount)).toFixed(8)} ${toSymbol}` }
            ]}
          />
          {onShowRoute && (
            <div className="flex justify-between items-center bg-[#32FF8B]/5 border border-[#32FF8B]/15 rounded-xl px-3 py-2 text-[12px] font-bold text-[#F0F7F3] shadow-sm font-mono">
              <span className="text-[#C5C1B9] flex items-center gap-1 uppercase tracking-wider">
                Routing Path
              </span>
              <button 
                type="button" 
                onClick={onShowRoute}
                className="text-[#32FF8B] hover:text-[#1FFF7D] hover:underline flex items-center gap-1.5 font-bold cursor-pointer transition-colors"
                id="show_route_btn"
              >
                1 on-chain route
                <span className="text-[11px] bg-[#32FF8B]/20 text-[#32FF8B] px-1.5 py-0.5 rounded font-black shrink-0 tracking-widest">VIEW</span>
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
              className="w-full py-2.5 px-4 bg-white/5 hover:bg-white/10 text-white font-mono text-[12px] tracking-widest uppercase font-black rounded-xl transition duration-150 active:scale-98 border border-white/10 cursor-pointer shadow-inner text-center"
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
        className="bg-[#010C1B] border border-white/10 rounded-xl px-3 py-1.5 text-sm font-black text-white focus:outline-none cursor-pointer w-full sm:w-auto uppercase flex items-center justify-between gap-2 min-w-[180px] hover:border-white/25 transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{current?.label ?? value}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-white/60 transition-transform shrink-0', open && 'rotate-180')} />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1.5 right-0 left-0 sm:left-auto sm:min-w-[220px] bg-[#010C1B] border border-white/15 rounded-xl shadow-2xl overflow-hidden py-1"
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
                      ? 'text-white/30 cursor-not-allowed'
                      : 'text-white hover:bg-[#32FF8B]/10 hover:text-[#32FF8B] cursor-pointer'
                  )}
                  disabled={opt.locked}
                >
                  <span className="truncate">
                    {opt.label} {opt.locked && <span className="text-[11px] ml-1">🔒</span>}
                  </span>
                  {selected && <Check className="w-3.5 h-3.5 text-[#32FF8B] shrink-0" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
