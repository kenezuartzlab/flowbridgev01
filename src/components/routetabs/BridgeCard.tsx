import { ArrowDownUp, Loader2, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils';
import { WarningPanel } from './WarningPanel';
import { FeePanel } from './FeePanel';
import { TokenIcon } from '../TokenIcon';

export type BridgePeer = 'BNB' | 'ETH' | 'TRX';
export type BridgeDirection =
  | 'BOT_TO_BNB' | 'BNB_TO_BOT'
  | 'BOT_TO_ETH' | 'ETH_TO_BOT'
  | 'BOT_TO_TRX' | 'TRX_TO_BOT';

interface BridgeCardProps {
  amount: string;
  onAmountChange: (val: string) => void;
  fromChain: string;
  toChain: string;
  symbol: string;
  balance: string;
  /** Full-precision balance string (unrounded) used for MAX & percentage clicks. Falls back to `balance` when omitted. */
  exactBalance?: string;
  estimatedReceive: string;
  receiveAddress: string;
  onSubmit: () => void;
  onToggleDirection?: () => void;
  buttonLabel: string;
  buttonDisabled?: boolean;
  successMessage?: string;
  gasFeeLabel?: string;
  bridgeDirection?: BridgeDirection;
  peer?: BridgePeer;
  onPeerChange?: (peer: BridgePeer) => void;
  onReset?: () => void;
  txHash?: string;
  txUrlPrefix?: string;
  receiveBotGas?: boolean;
  onReceiveBotGasChange?: (checked: boolean) => void;
  showReceiveBotGasOption?: boolean;
  /** TronLink readiness — only used when peer === 'TRX'. */
  tronStatus?: 'unavailable' | 'locked' | 'ready';
  tronAddress?: string;
  tronConnecting?: boolean;
  onConnectTron?: () => void;
  /**
   * Phase 3 read-only BridgeAdapter preview (testnet BNB↔BOT, feature-flagged).
   * When present it overrides the fee/limit DISPLAY only — execution is unchanged.
   */
  adapterPreview?: {
    officialFeeFormatted: string;
    refundableFormatted: string;
    feeRatePercent: string;
    minAmountUsdFormatted: string;
    maxAmountUsdFormatted: string;
    routeUnavailable: boolean;
  } | null;
}


export function BridgeCard({
  amount,
  onAmountChange,
  fromChain,
  toChain,
  symbol,
  balance,
  exactBalance,
  estimatedReceive,
  receiveAddress,
  onSubmit,
  onToggleDirection,
  buttonLabel,
  buttonDisabled,
  successMessage,
  gasFeeLabel = "≈ 0.095238 BOT",
  bridgeDirection = 'BOT_TO_BNB',
  peer,
  onPeerChange,
  onReset,
  txHash,
  txUrlPrefix,
  receiveBotGas = false,
  onReceiveBotGasChange,
  showReceiveBotGasOption = false,
  tronStatus,
  tronAddress,
  tronConnecting = false,
  onConnectTron,
}: BridgeCardProps) {
  const activePeer: BridgePeer = peer
    ?? (bridgeDirection.includes('ETH') ? 'ETH'
      : bridgeDirection.includes('TRX') ? 'TRX'
      : 'BNB');
  // Full-precision source for MAX / percentage math. Never round the wallet
  // balance — the bridge accepts arbitrary uint256, so passing the exact
  // wallet amount avoids "insufficient balance" reverts and dust left behind.
  const rawBalance = (exactBalance ?? balance ?? '').trim();
  const rawBalanceNum = parseFloat(rawBalance);
  const hasRawBalance = isFinite(rawBalanceNum) && rawBalanceNum > 0;

  // Trim a decimal string to at most `maxDp` decimals WITHOUT rounding, so
  // 12.345678901234567 → 12.345678 (maxDp=6) — never exceeds wallet balance.
  const truncateDecimals = (s: string, maxDp: number) => {
    if (!s.includes('.')) return s;
    const [int, dec] = s.split('.');
    return dec.length > maxDp ? `${int}.${dec.slice(0, maxDp)}` : s;
  };
  const applyPercent = (pct: number) => {
    if (!hasRawBalance) return onAmountChange('0');
    if (pct >= 1) {
      // MAX: use the exact wallet balance verbatim.
      onAmountChange(rawBalance);
      return;
    }
    // Fractional percentage: compute in JS, then truncate (not round) to a
    // safe precision so we never exceed the wallet balance.
    const dp = Math.min(18, (rawBalance.split('.')[1]?.length ?? 6));
    const val = rawBalanceNum * pct;
    onAmountChange(truncateDecimals(val.toFixed(dp), dp));
  };

  // Auto-shrink the big input font as the value grows so long decimals stay
  // visible without clipping — mimics wallet/Uniswap-style adaptive typography.
  const amtLen = (amount ?? '').length;
  const amountFontClass =
    amtLen > 18 ? 'text-lg' :
    amtLen > 14 ? 'text-xl' :
    amtLen > 11 ? 'text-2xl' :
    amtLen > 8  ? 'text-3xl' : 'text-4xl';
  const estimatedStr = estimatedReceive ? parseFloat(estimatedReceive).toFixed(8) : '0.00000000';
  const estLen = estimatedStr.length;
  const estimatedFontClass =
    estLen > 18 ? 'text-lg' :
    estLen > 14 ? 'text-xl' :
    estLen > 11 ? 'text-2xl' :
    estLen > 8  ? 'text-3xl' : 'text-4xl';
  return (
    <div className="flex flex-col flex-1 relative z-10 w-full space-y-4">
      {/* PEER SELECTOR — pick the counter-chain (BNB / ETH / TRX). */}
      {onPeerChange && (
        <div className="bg-[#0D1C2A]/70 border border-white/20 rounded-2xl p-2 flex items-center gap-1.5 font-mono">
          <span className="text-[11px] font-black text-[#C5C1B9] uppercase tracking-widest px-2 shrink-0">Bridge with</span>
          <div className="grid grid-cols-3 gap-1 flex-1">
            {(['BNB', 'ETH', 'TRX'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onPeerChange(p)}
                className={cn(
                  'px-2 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all duration-150 active:scale-95 cursor-pointer border',
                  activePeer === p
                    ? 'bg-[#32FF8B]/15 text-[#32FF8B] border-[#32FF8B]/40 shadow-[0_0_10px_rgba(50,255,139,0.25)]'
                    : 'bg-[#010C1B]/70 text-[#C5C1B9] border-white/10 hover:text-white hover:border-white/25'
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* TRON LINK STATUS — only when the TRX peer is selected. Guides the
          user through Install / Unlock / Connected states with a retry CTA. */}
      {activePeer === 'TRX' && tronStatus && (
        <div
          className={cn(
            'rounded-2xl border p-3.5 flex items-start gap-3 font-sans shadow-inner',
            tronStatus === 'ready'
              ? 'bg-[#32FF8B]/10 border-[#32FF8B]/25 text-[#32FF8B]'
              : tronStatus === 'locked'
                ? 'bg-[#F6BA00]/10 border-[#F6BA00]/25 text-amber-200'
                : 'bg-[#FC4447]/10 border-[#FC4447]/25 text-red-200'
          )}
        >
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-widest font-black font-mono mb-1">
              {tronStatus === 'ready' ? 'TronLink Connected' : tronStatus === 'locked' ? 'Unlock TronLink' : 'TronLink Not Detected'}
            </div>
            {tronStatus === 'ready' && tronAddress ? (
              <div className="text-[12px] font-mono break-all text-white/85">
                {tronAddress.slice(0, 10)}…{tronAddress.slice(-8)}
              </div>
            ) : tronStatus === 'locked' ? (
              <div className="text-[12px] text-white/75 leading-relaxed">
                Open the TronLink extension, unlock it, and select an account. Then click Retry.
              </div>
            ) : (
              <div className="text-[12px] text-white/75 leading-relaxed">
                Install the TronLink browser extension to sign Tron (TRC-20) transactions.
              </div>
            )}
          </div>
          {tronStatus === 'unavailable' ? (
            <a
              href="https://www.tronlink.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/20 text-white text-[11px] font-black uppercase tracking-widest font-mono transition"
            >
              Install <ExternalLink className="w-3 h-3" />
            </a>
          ) : tronStatus === 'locked' ? (
            <button
              type="button"
              onClick={onConnectTron}
              disabled={tronConnecting}
              className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#F6BA00]/20 hover:bg-[#F6BA00]/30 border border-[#F6BA00]/40 text-[#F6BA00] text-[11px] font-black uppercase tracking-widest font-mono transition disabled:opacity-60"
            >
              {tronConnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
              {tronConnecting ? 'Connecting…' : 'Retry'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onConnectTron}
              className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#32FF8B]/15 hover:bg-[#32FF8B]/25 border border-[#32FF8B]/40 text-[#32FF8B] text-[11px] font-black uppercase tracking-widest font-mono transition"
            >
              Refresh
            </button>
          )}
        </div>
      )}
      {/* 1. INPUT CARD BLOCK with enhanced border-white/20 visibility */}
      <div className="bg-[#0D1C2A]/70 border border-white/20 rounded-[20px] shadow-2xl p-4.5 space-y-3 relative">

        {/* FROM BLOCK */}
        <div className="bg-[#010C1B]/75 border border-white/15 p-4 rounded-xl space-y-3 font-sans shadow-inner">
          <div className="flex flex-col gap-2 border-b border-white/5 pb-2 min-w-0">
            <span className="text-[12px] font-black text-[#C5C1B9] uppercase tracking-wider flex items-center gap-1.5 font-mono min-w-0">
              <span className="shrink-0">From</span>
              <span className="bg-[#32FF8B]/10 text-[#32FF8B] border border-[#32FF8B]/20 px-2 py-0.5 rounded font-black text-[11px] uppercase tracking-widest truncate">{fromChain}</span>
            </span>
            <div className="grid grid-cols-4 gap-1.5 w-full min-w-0">
              {['25%', '50%', '75%', '100%'].map((pct) => (
                <button 
                  key={pct} 
                  type="button"
                  onClick={() => applyPercent(parseFloat(pct) / 100)}
                  className="px-1 py-1 bg-[#0D1C2A] border border-white/20 rounded-lg text-[11px] text-[#C5C1B9] hover:text-[#32FF8B] hover:border-[#32FF8B]/20 font-black tracking-wider transition-all duration-150 active:scale-95 cursor-pointer shadow-sm text-center min-w-0"
                >
                  {pct}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex justify-between items-center gap-3">
            <div className="flex-1 min-w-0">
              <input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  // Accept only digits + a single dot; strip anything else so
                  // long-decimal paste from wallet balances stays clean.
                  const cleaned = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
                  onAmountChange(cleaned);
                }}
                title={amount}
                className={`bg-transparent text-white ${amountFontClass} font-black w-full focus:outline-none placeholder:text-[#C5C1B9]/40 leading-none h-[44px] font-mono overflow-x-auto whitespace-nowrap scrollbar-none transition-[font-size] duration-150`}
              />
              <div 
                onClick={() => applyPercent(1)}
                className="text-[12px] text-[#C5C1B9] font-mono mt-1.5 select-none cursor-pointer hover:text-[#32FF8B] transition-colors inline-block max-w-full truncate"
                title={`Use full balance: ${rawBalance} ${symbol}`}
              >
                Balance: {balance} {symbol} <span className="text-[11px] text-[#32FF8B] font-black ml-1 uppercase hover:underline">(Max)</span>
              </div>
            </div>
            <div className="bg-[#0D1C2A]/90 pl-1 pr-2 py-1 rounded-full flex items-center gap-1.5 shrink-0 border border-white/15 font-mono">
              <TokenIcon symbol={symbol} size={20} />
              <span className="font-black text-[13px] text-[#FFFFFF] tracking-wide uppercase truncate">{symbol}</span>
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
          <div className="flex flex-col gap-2 border-b border-white/5 pb-2 min-w-0">
            <span className="text-[12px] font-black text-[#C5C1B9] uppercase tracking-wider flex items-center gap-1.5 font-mono min-w-0">
              <span className="shrink-0">To</span>
              <span className="bg-[#32FF8B]/10 text-[#32FF8B] border border-[#32FF8B]/20 px-2 py-0.5 rounded font-black text-[11px] uppercase tracking-widest truncate">{toChain}</span>
            </span>
          </div>
          
          <div className="flex justify-between items-center gap-3">
            <div className="flex-1 min-w-0">
              <div title={estimatedStr} className={`${estimatedFontClass} font-black text-white/50 leading-none h-[44px] flex items-center overflow-x-auto whitespace-nowrap scrollbar-none font-mono transition-[font-size] duration-150`}>
                {estimatedStr}
              </div>
            </div>
            <div className="bg-[#0D1C2A]/90 pl-1 pr-2 py-1 rounded-full flex items-center gap-1.5 shrink-0 border border-white/15 font-mono opacity-90">
               <TokenIcon symbol={symbol} size={20} />
               <span className="font-black text-[13px] text-[#FFFFFF] tracking-wide uppercase truncate">{symbol}</span>
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
      <FeePanel 
        receiveAddress={receiveAddress}
        rows={[
          { label: 'Bridge Fee', value: bridgeDirection === 'BOT_TO_BNB' ? '1 USDT' : '0 USDT (No Fee)' },
          { label: 'Gas fee', value: gasFeeLabel },
          { label: 'Estimated completion time', value: '≈ 7 min' },
          { label: 'Receive (estimated)', value: estimatedReceive ? `${parseFloat(estimatedReceive).toFixed(8)} USDT` : '0.00000000 USDT', isImportant: true }
        ]} 
      />

      {showReceiveBotGasOption && (
        <label className="bg-[#0D1C2A]/70 border border-white/15 rounded-2xl p-3.5 flex items-start gap-3 cursor-pointer hover:border-[#32FF8B]/30 transition-colors font-sans">
          <input
            type="checkbox"
            checked={receiveBotGas}
            onChange={(e) => onReceiveBotGasChange?.(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#32FF8B] cursor-pointer shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-black text-white leading-snug">
              Receive 0.1 BOT for Future Gas Fees
            </div>
            <div className="text-[11px] text-[#C5C1B9] mt-1 leading-relaxed">
              This BOT will be used to pay gas fees for your other operations on the BOT chain, so you can use all features smoothly without worrying about insufficient gas. The equivalent amount will be deducted from your USDT transfer (based on the real-time BDEX exchange rate).
            </div>
          </div>
        </label>
      )}

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
              className="w-full py-2.5 px-4 bg-white/5 hover:bg-white/10 text-white font-mono text-[12px] tracking-widest uppercase font-black rounded-xl transition duration-150 active:scale-98 border border-white/10 cursor-pointer shadow-inner text-center"
            >
              Start New Bridge
            </button>
          )}
        </div>
      )}
    </div>
  );
}
