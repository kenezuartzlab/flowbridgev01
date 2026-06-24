import { useState, useEffect } from 'react';
import { X, ExternalLink, Loader2, Check, Heart } from 'lucide-react';
import { cn } from '../lib/utils';
import { TokenIcon } from '../components/TokenIcon';

interface RealtimeBridgeTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
  fromChain: string;
  toChain: string;
  amount: string;
  symbol: string;
  recipientAddress: string;
  txHash?: string;
  txUrlPrefix?: string;
  onReset: () => void;
  onDonateClick?: () => void;
}

export function RealtimeBridgeTrackerModal({
  isOpen,
  onClose,
  fromChain,
  toChain,
  amount,
  symbol = 'USDT',
  recipientAddress,
  txHash,
  txUrlPrefix = 'https://scan.bohr.life/tx/',
  onReset,
  onDonateClick
}: RealtimeBridgeTrackerModalProps) {
  // Realtime count-up Stopwatch state
  const [seconds, setSeconds] = useState(0);
  const [minutes, setMinutes] = useState(0);
  
  // Realtime 3-stage visual steps simulation
  const [stage1, setStage1] = useState<'pending' | 'loading' | 'done'>('loading');
  const [stage2, setStage2] = useState<'pending' | 'loading' | 'done'>('pending');
  const [stage3, setStage3] = useState<'pending' | 'loading' | 'done'>('pending');
  const [isCompleted, setIsCompleted] = useState(false);

  // Restart clocks
  useEffect(() => {
    if (isOpen) {
      setSeconds(0);
      setMinutes(0);
      setStage1('loading');
      setStage2('pending');
      setStage3('pending');
      setIsCompleted(false);
    }
  }, [isOpen]);

  // Stopwatch ticking
  useEffect(() => {
    if (!isOpen || isCompleted) return;

    const interval = setInterval(() => {
      setSeconds((prevSec) => {
        if (prevSec === 59) {
          setMinutes((prevMin) => prevMin + 1);
          return 0;
        }
        return prevSec + 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, isCompleted]);

  // Stage transition sequencer mimicking blockchain block validations
  useEffect(() => {
    if (!isOpen) return;

    // Transition 1 -> 2 (Sent transaction from Source Chain)
    const t1 = setTimeout(() => {
      setStage1('done');
      setStage2('loading');
    }, 3200);

    // Transition 2 -> 3 (Sent transaction to Target Chain)
    const t2 = setTimeout(() => {
      setStage2('done');
      setStage3('loading');
    }, 6400);

    // Transition 3 -> Completed (Received USDT on BSC/Bohr Address)
    const t3 = setTimeout(() => {
      setStage3('done');
      setIsCompleted(true);
    }, 9600);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  // Render Stopwatch time: e.g. "14m:48s" or "00m:04s"
  const formattedTime = `${minutes.toString().padStart(2, '0')}m:${seconds.toString().padStart(2, '0')}s`;

  // Helper mapping chains to simplified screenshot designations
  const normChain = (ch: string) => {
    if (ch.toLowerCase().includes('bot')) return 'BOT Chain';
    if (ch.toLowerCase().includes('bnb') || ch.toLowerCase().includes('bsc') || ch.toLowerCase().includes('binance')) return 'BNB Chain';
    return ch;
  };

  const truncatedAddress = recipientAddress && recipientAddress.length > 15
    ? `${recipientAddress.slice(0, 8)}...${recipientAddress.slice(-6)}`
    : recipientAddress;

  const displayHash = txHash ? `${txHash.slice(0, 10)}...${txHash.slice(-8)}` : 'simulating_pipeline';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#010C1B]/95 backdrop-blur-md animate-fade-in font-sans text-white">
      <div 
        id="realtime_bridge_tracker"
        className="bg-[#030E1A] border border-white/10 text-[#F0F7F3] rounded-[28px] w-full max-w-[360px] p-6 shadow-2xl relative flex flex-col space-y-6 animate-scale-up"
      >
        {/* Top Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 hover:bg-white/5 rounded-xl text-[#C5C1B9] hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Action - Tracking Header */}
        <div className="text-center pt-2">
          <h2 className="text-xl font-bold font-mono tracking-tight text-white mb-1">
            Track your transaction
          </h2>
        </div>

        {/* Central Graphic Ring Overlay - Matches Page 1 and Page 2 Diagrams */}
        <div className="relative flex justify-center py-6 h-[180px]">
          {/* Radial Glowing Ambient Circles */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-[170px] h-[170px] bg-gradient-to-r from-teal-500/10 to-[#32FF8B]/10 rounded-full blur-2xl animate-[pulse_4s_infinite]" />
            <div className="absolute w-[140px] h-[140px] border border-slate-700/30 rounded-full" />
            <div className="absolute w-[100px] h-[100px] border border-dashed border-teal-500/10 rounded-full animate-spin duration-[20s]" />
          </div>

          <div className="relative flex items-center justify-center gap-10">
            {/* Left Source Token Representation */}
            <div className="flex flex-col items-center z-10 space-y-2">
              <div className="relative p-1 bg-[#010C1B] rounded-2xl border border-white/5 shadow-lg group">
                <TokenIcon symbol={symbol} size={48} className="translate-y-0.5" />
                <span className="absolute -bottom-1 -right-1 bg-yellow-500/20 border border-yellow-500/40 rounded-full p-0.5">
                  <div className="w-4 h-4 rounded-full bg-yellow-500 flex items-center justify-center text-[8px] font-black text-[#010C1B]">B</div>
                </span>
              </div>
              <div className="text-center">
                <span className="text-[12px] font-bold block">{symbol}</span>
                <span className="text-[10px] font-black text-white/50 block tracking-wider font-mono">{parseFloat(amount || '0').toFixed(0)}</span>
                <span className="text-[10px] font-bold text-amber-500 uppercase font-mono tracking-widest">{normChain(fromChain)}</span>
              </div>
            </div>

            {/* Overlapping Central Exchange Arrows - Rotating loops */}
            <div className="absolute flex flex-col items-center justify-center gap-1">
              <div className="flex flex-col gap-1 items-center justify-center text-[#32FF8B]">
                <span className="font-mono text-[10.5px] font-bold text-[#32FF8B]/70 uppercase animate-pulse">
                  Relaying
                </span>
                <div className="flex gap-1">
                  <span className="text-sm font-black animate-ping text-teal-400">↔</span>
                </div>
              </div>
            </div>

            {/* Right Destination Token Representation */}
            <div className="flex flex-col items-center z-10 space-y-2">
              <div className="relative p-1 bg-[#010C1B] rounded-2xl border border-white/5 shadow-lg">
                <TokenIcon symbol={symbol} size={48} />
                <span className="absolute -bottom-1 -right-1 bg-teal-500/20 border border-teal-500/40 rounded-full p-0.5">
                  <div className="w-4 h-4 rounded-full bg-teal-500 flex items-center justify-center text-[8px] font-black text-[#010C1B]">₮</div>
                </span>
              </div>
              <div className="text-center">
                <span className="text-[12px] font-bold block">{symbol}</span>
                <span className="text-[10px] font-black text-white/50 block tracking-wider font-mono">{parseFloat(amount || '0').toFixed(0)}</span>
                <span className="text-[10px] font-bold text-teal-400 uppercase font-mono tracking-widest">{normChain(toChain)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Countdown Timer or Completed Status badge in the center */}
        <div className="flex justify-center flex-col items-center">
          {isCompleted ? (
            <div className="px-6 py-2.5 bg-[#32FF8B]/10 hover:bg-[#32FF8B]/15 border border-[#32FF8B]/35 rounded-full flex items-center gap-2 shadow-[0_0_12px_rgba(50,255,139,0.15)] animate-bounce-slow">
              <span className="w-2 h-2 rounded-full bg-[#32FF8B] animate-ping" />
              <span className="text-xs font-black uppercase text-[#32FF8B] tracking-widest font-mono">Completed</span>
            </div>
          ) : (
            <div className="px-6 py-2.5 bg-white/5 border border-white/10 rounded-full text-center">
              <div className="text-sm font-black text-white font-mono tracking-widest">
                {formattedTime}
              </div>
            </div>
          )}
        </div>

        {/* Milestone Steps Timeline - Matching Screenshots Exactly with spinning loader/checkmarks */}
        <div className="bg-[#010C1B]/80 border border-white/10 rounded-[20px] p-5 space-y-4">
          {/* Milestone 1 */}
          <div className="flex items-center justify-between text-left">
            <span className="text-[11px] font-semibold text-[#F0F7F3]/90 font-mono tracking-normal leading-normal">
              Sent transaction from <strong className="text-amber-300 font-bold">{normChain(fromChain)}</strong>
            </span>
            <div className="shrink-0 ml-3">
              {stage1 === 'loading' && <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />}
              {stage1 === 'done' && <Check className="w-4.5 h-4.5 text-[#32FF8B] font-bold bg-[#32FF8B]/15 border border-[#32FF8B]/30 rounded p-0.5" />}
              {stage1 === 'pending' && <div className="w-3.5 h-3.5 rounded-full border border-dashed border-white/25" />}
            </div>
          </div>

          {/* Milestone 2 */}
          <div className="flex items-center justify-between text-left">
            <span className="text-[11px] font-semibold text-[#F0F7F3]/90 font-mono tracking-normal leading-normal">
              Sent transaction to <strong className="text-teal-400 font-bold">{normChain(toChain)}</strong>
            </span>
            <div className="shrink-0 ml-3">
              {stage2 === 'loading' && <Loader2 className="w-4 h-4 text-teal-400 animate-spin" />}
              {stage2 === 'done' && <Check className="w-4.5 h-4.5 text-[#32FF8B] font-bold bg-[#32FF8B]/15 border border-[#32FF8B]/30 rounded p-0.5" />}
              {stage2 === 'pending' && <div className="w-3.5 h-3.5 rounded-full border border-dashed border-white/25" />}
            </div>
          </div>

          {/* Milestone 3 */}
          <div className="flex items-center justify-between text-left">
            <span className="text-[11px] font-semibold text-[#F0F7F3]/90 font-mono tracking-normal leading-normal">
              Received {symbol} on <strong className="text-teal-400 font-mono font-black">{truncatedAddress}</strong>
            </span>
            <div className="shrink-0 ml-3">
              {stage3 === 'loading' && <Loader2 className="w-4 h-4 text-[#32FF8B] animate-spin" />}
              {stage3 === 'done' && <Check className="w-4.5 h-4.5 text-[#32FF8B] font-bold bg-[#32FF8B]/15 border border-[#32FF8B]/30 rounded p-0.5" />}
              {stage3 === 'pending' && <div className="w-3.5 h-3.5 rounded-full border border-dashed border-white/25" />}
            </div>
          </div>
        </div>

        {/* Support CTA box */}
        {onDonateClick && (
          <div className="bg-[#122A26] border border-[#32FF8B]/15 rounded-xl p-3 text-left w-full relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-12 h-12 bg-gradient-to-br from-[#32FF8B]/10 to-transparent blur-md pointer-events-none" />
            <p className="text-[10px] leading-relaxed font-semibold text-[#32FF8B] mb-1 flex items-center gap-1">
              <Heart className="w-3 h-3 fill-[#32FF8B]" />
              <span>FlowBridge is free and charges 0% fees!</span>
            </p>
            <p className="text-[10px] text-[#C5C1B9] leading-tight mb-2.5">
              Support original open-source builders to bring you new cross-chain analytics & earnings trackers.
            </p>
            <button
              onClick={() => {
                onClose();
                onDonateClick();
              }}
              className="w-full py-1.5 bg-[#32FF8B]/10 hover:bg-[#32FF8B]/20 border border-[#32FF8B]/35 text-[#32FF8B] font-mono font-black text-[9px] uppercase tracking-widest rounded-lg transition-all duration-150 cursor-pointer text-center"
            >
              💖 Donate / Support
            </button>
          </div>
        )}

        {/* Detail action and close paths */}
        <div className="flex flex-col gap-2 pt-2">
          {/* View Detail on Explorer */}
          <a
            href={txHash ? `${txUrlPrefix}${txHash}` : '#'}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "w-full py-3.5 rounded-xl border font-mono text-xs tracking-widest font-bold uppercase transition-all duration-150 flex items-center justify-center gap-2",
              isCompleted 
                ? "bg-[#32FF8B] border-[#32FF8B] text-[#010C1B] hover:bg-[#1FFF7D] cursor-pointer shadow-[0_0_12px_rgba(50,255,139,0.25)]" 
                : "bg-white/5 border-white/5 text-[#C5C1B9]/60 hover:text-white cursor-pointer"
            )}
          >
            <span>View Detail</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          {/* Transfer Again - Restart Swap block */}
          <button
            onClick={() => {
              onReset();
              onClose();
            }}
            className="w-full py-3 px-4 bg-[#0D1C2A] text-white hover:bg-[#112335] active:scale-98 font-mono text-[10.5px] tracking-widest uppercase font-black rounded-xl transition border border-white/10 cursor-pointer shadow-inner text-center"
          >
            Transfer again
          </button>
        </div>
      </div>
    </div>
  );
}
