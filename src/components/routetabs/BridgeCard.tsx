import { ArrowDownUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import { WarningPanel } from './WarningPanel';
import { FeePanel } from './FeePanel';
import { TokenIcon } from '../TokenIcon';

interface BridgeCardProps {
  amount: string;
  onAmountChange: (val: string) => void;
  fromChain: string;
  toChain: string;
  symbol: string;
  balance: string;
  estimatedReceive: string;
  receiveAddress: string;
  onSubmit: () => void;
  onToggleDirection?: () => void;
  buttonLabel: string;
  buttonDisabled?: boolean;
  successMessage?: string;
  gasFeeLabel?: string;
  bridgeDirection?: 'BOT_TO_BNB' | 'BNB_TO_BOT';
  onReset?: () => void;
  txHash?: string;
  txUrlPrefix?: string;
}

export function BridgeCard({
  amount,
  onAmountChange,
  fromChain,
  toChain,
  symbol,
  balance,
  estimatedReceive,
  receiveAddress,
  onSubmit,
  onToggleDirection,
  buttonLabel,
  buttonDisabled,
  successMessage,
  gasFeeLabel = "≈ 0.095238 BOT",
  bridgeDirection = 'BOT_TO_BNB',
  onReset,
  txHash,
  txUrlPrefix
}: BridgeCardProps) {
  return (
    <div className="flex flex-col flex-1 relative z-10 w-full space-y-4">
      {/* 1. INPUT CARD BLOCK with enhanced border-white/20 visibility */}
      <div className="bg-[#0D1C2A]/70 border border-white/20 rounded-[20px] shadow-2xl p-4.5 space-y-3 relative">
        {/* FROM BLOCK */}
        <div className="bg-[#010C1B]/75 border border-white/15 p-4 rounded-xl space-y-3 font-sans shadow-inner">
          <div className="flex justify-between items-center border-b border-white/5 pb-2">
            <span className="text-[10px] font-black text-[#C5C1B9] uppercase tracking-wider flex items-center gap-1.5 font-mono">
              From <span className="bg-[#32FF8B]/10 text-[#32FF8B] border border-[#32FF8B]/20 px-2 py-0.5 rounded font-black text-[9px] uppercase tracking-widest">{fromChain}</span>
            </span>
            <div className="flex gap-1.5">
              {['25%', '50%', '75%', '100%'].map((pct) => (
                <button 
                  key={pct} 
                  type="button"
                  onClick={() => {
                    const pctVal = parseFloat(pct) / 100;
                    const balVal = parseFloat(balance) || 0;
                    onAmountChange((balVal * pctVal).toFixed(8));
                  }}
                  className="px-2 py-0.5 bg-[#0D1C2A] border border-white/20 rounded-lg text-[9px] text-[#C5C1B9] hover:text-[#32FF8B] hover:border-[#32FF8B]/20 font-black tracking-wider transition-all duration-150 active:scale-95 cursor-pointer shadow-sm"
                >
                  {pct}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex justify-between items-center gap-3">
            <div className="flex-1 min-w-0">
              <input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => onAmountChange(e.target.value)}
                className="bg-transparent text-white text-2xl font-black w-full focus:outline-none placeholder:text-[#C5C1B9]/40 leading-none h-[36px] font-mono"
              />
              <div 
                onClick={() => {
                  const parsed = parseFloat(balance);
                  if (!isNaN(parsed)) {
                    onAmountChange(parsed.toString());
                  } else {
                    onAmountChange(balance);
                  }
                }}
                className="text-[10px] text-[#C5C1B9] font-mono mt-1.5 select-none cursor-pointer hover:text-[#32FF8B] transition-colors inline-block"
                title="Use maximum balance"
              >
                Balance: {balance} {symbol} <span className="text-[9px] text-[#32FF8B] font-black ml-1 uppercase hover:underline">(Max)</span>
              </div>
            </div>
            <div className="bg-[#0D1C2A]/90 px-3 py-1.5 rounded-xl flex items-center gap-2 shrink-0 border border-white/15 shadow-sm font-mono">
              <TokenIcon symbol={symbol} size={22} />
              <span className="font-black text-xs text-[#FFFFFF] tracking-widest uppercase">{symbol}</span>
            </div>
          </div>
        </div>
        
        {/* BRIDGE DIRECTION SWITCH */}
        <div className="flex justify-center -my-6.5 relative z-20 animate-none">
          <button 
            type="button"
            onClick={onToggleDirection}
            className="bg-[#0D1C2A] border border-white/25 text-[#C5C1B9] hover:text-[#32FF8B] hover:border-[#32FF8B]/30 p-2 rounded-xl shadow-lg hover:rotate-180 transition-all duration-300 active:scale-90 cursor-pointer"
            title="Switch direction"
          >
            <ArrowDownUp className="w-4 h-4" />
          </button>
        </div>

        {/* TO BLOCK */}
        <div className="bg-[#010C1B]/75 border border-white/15 p-4 rounded-xl space-y-3 font-sans shadow-inner">
          <div className="flex justify-between items-center border-b border-white/5 pb-2">
            <span className="text-[10px] font-black text-[#C5C1B9] uppercase tracking-wider flex items-center gap-1.5 font-mono">
              To <span className="bg-[#32FF8B]/10 text-[#32FF8B] border border-[#32FF8B]/20 px-2 py-0.5 rounded font-black text-[9px] uppercase tracking-widest">{toChain}</span>
            </span>
          </div>
          
          <div className="flex justify-between items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-2xl font-black text-white/50 leading-none h-[36px] flex items-center overflow-x-auto whitespace-nowrap scrollbar-none font-mono">
                {estimatedReceive ? parseFloat(estimatedReceive).toFixed(8) : '0.00000000'}
              </div>
            </div>
            <div className="bg-[#0D1C2A]/90 px-3 py-1.5 rounded-xl flex items-center gap-2 shrink-0 border border-white/15 shadow-sm font-mono opacity-90">
               <TokenIcon symbol={symbol} size={22} />
               <span className="font-black text-xs text-[#FFFFFF] tracking-widest uppercase">{symbol}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. MAIN BRIDGE BUTTON (Right below the card container) */}
      <div className="font-sans">
        <button
          onClick={onSubmit}
          disabled={buttonDisabled}
          className={cn(
            "w-full py-4 rounded-2xl text-xs font-black tracking-widest uppercase transition-all flex justify-center items-center gap-2 cursor-pointer",
            buttonDisabled 
              ? "bg-white/5 text-[#C5C1B9]/45 border border-white/10 cursor-not-allowed shadow-none" 
              : "bg-[#32FF8B] hover:bg-[#1FFF7D] text-[#010C1B] shadow-[0_0_16px_rgba(50,255,139,0.25)] hover:shadow-[0_0_24px_rgba(50,255,139,0.45)] hover:scale-[1.01] active:scale-[0.99]"
          )}
        >
          <span>{buttonLabel}</span>
        </button>
      </div>

      {/* 3. DETAILS & FEEDBACKS (Rendered below the action button) */}
      <FeePanel 
        receiveAddress={receiveAddress}
        rows={[
          { label: 'Bridge Fee', value: bridgeDirection === 'BOT_TO_BNB' ? '1 USDT' : '0 USDT (No Fee)' },
          { label: 'Gas fee', value: gasFeeLabel },
          { label: 'Estimated completion time', value: '≈ 7 min' },
          { label: 'Receive (estimated)', value: estimatedReceive ? `${parseFloat(estimatedReceive).toFixed(8)} USDT` : '0.00000000 USDT', isImportant: true }
        ]} 
      />

      <WarningPanel 
        type="warning" 
        message="The value of cross-chain assets must be greater than $10!" 
      />
      
      {successMessage && (
        <div className="flex flex-col gap-2.5 font-sans">
          <WarningPanel type="info" title="Transaction Submitted" message={successMessage} txHash={txHash} txUrlPrefix={txUrlPrefix} />
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              className="w-full py-2.5 px-4 bg-white/5 hover:bg-white/10 text-white font-mono text-[10px] tracking-widest uppercase font-black rounded-xl transition duration-150 active:scale-98 border border-white/10 cursor-pointer shadow-inner text-center"
            >
              Start New Bridge
            </button>
          )}
        </div>
      )}
    </div>
  );
}
