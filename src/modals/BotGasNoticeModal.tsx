import { useState, useEffect } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

interface BotGasNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function BotGasNoticeModal({ isOpen, onClose, onConfirm }: BotGasNoticeModalProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    if (!isOpen) setAcknowledged(false);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#010C1B]/95 backdrop-blur-md animate-fade-in font-sans">
      <div className="bg-[#0B1521] border border-white/10 text-white rounded-[24px] w-full max-w-[380px] p-6 shadow-2xl relative flex flex-col space-y-5 animate-scale-up">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold text-white/95 font-mono uppercase tracking-wide flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#F6BA00]" />
            Bot Gas Pre-Funding
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/5 rounded-xl text-[#C0C8D0] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-[#122A26] border border-[#32FF8B]/15 rounded-xl p-3 space-y-2">
          <p className="text-[13px] leading-relaxed font-semibold text-[#32FF8B]">
            You will receive 0.1 BOT on the destination chain to cover future gas fees.
          </p>
          <p className="text-[12px] leading-relaxed text-[#C5C1B9]">
            The equivalent USDT value (at the current BDEX rate) will be deducted from your bridged amount. This is a one-way action for this transaction.
          </p>
        </div>

        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#32FF8B] cursor-pointer shrink-0"
          />
          <span className="text-[12px] text-white/90 leading-snug">
            I understand and approve the 0.1 BOT pre-funding deduction.
          </span>
        </label>

        <button
          onClick={() => { if (acknowledged) { onConfirm(); onClose(); } }}
          disabled={!acknowledged}
          className={cn(
            "w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all duration-150 active:scale-[0.98] shadow-md cursor-pointer",
            acknowledged
              ? "bg-[#32FF8B] hover:bg-[#1FFF7D] text-[#010C1B] shadow-[0_0_16px_rgba(50,255,139,0.25)]"
              : "bg-white/5 text-[#C5C1B9]/45 border border-white/10 cursor-not-allowed"
          )}
        >
          Confirm & Enable
        </button>
      </div>
    </div>
  );
}
