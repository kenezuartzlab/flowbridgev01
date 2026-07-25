import { useEffect, useState } from 'react';
import { X, RotateCcw } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  LOW_GAS_MIN_ETHER_DEFAULTS,
  getLowGasThreshold,
  setLowGasThreshold,
  resetLowGasThreshold,
} from '../lib/friendlyError';

interface LowGasSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const NETWORKS: { symbol: string; label: string }[] = [
  { symbol: 'BOT', label: 'Bot Chain (BOT)' },
  { symbol: 'BNB', label: 'BNB Smart Chain (BNB)' },
  { symbol: 'ETH', label: 'Ethereum (ETH)' },
  { symbol: 'TRX', label: 'Tron (TRX)' },
];

export function LowGasSettingsModal({ isOpen, onClose }: LowGasSettingsModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    const next: Record<string, string> = {};
    for (const n of NETWORKS) next[n.symbol] = String(getLowGasThreshold(n.symbol));
    setValues(next);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    for (const n of NETWORKS) {
      const v = parseFloat(values[n.symbol]);
      if (isFinite(v) && v > 0) setLowGasThreshold(n.symbol, v);
    }
    onClose();
  };

  const handleResetOne = (sym: string) => {
    resetLowGasThreshold(sym);
    setValues((prev) => ({ ...prev, [sym]: String(LOW_GAS_MIN_ETHER_DEFAULTS[sym] ?? 0.001) }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#010C1B]/95 backdrop-blur-md font-sans">
      <div className="bg-[#0B1521] border border-white/10 text-white rounded-[20px] sm:rounded-[24px] w-full max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain max-w-[420px] p-4 sm:p-6 shadow-2xl relative flex flex-col space-y-5">
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold text-white/95 font-mono uppercase tracking-wide">
            Low-Gas Warning Thresholds
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/5 rounded-xl text-[#C0C8D0] hover:text-white transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-[12px] text-[#C5C1B9] leading-relaxed">
          Set the balance below which we'll warn you that you may not have enough for network fees. Values are per network and saved on this device.
        </p>

        <div className="space-y-3">
          {NETWORKS.map((n) => (
            <div key={n.symbol} className="bg-[#010C1B]/70 border border-white/10 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-black uppercase tracking-widest text-white/80 font-mono">{n.label}</span>
                <button
                  type="button"
                  onClick={() => handleResetOne(n.symbol)}
                  className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider text-white/50 hover:text-[#32FF8B] transition-colors cursor-pointer"
                  title="Reset to default"
                >
                  <RotateCcw className="w-3 h-3" />
                  Default {LOW_GAS_MIN_ETHER_DEFAULTS[n.symbol]}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={values[n.symbol] ?? ''}
                  onChange={(e) => setValues((prev) => ({ ...prev, [n.symbol]: e.target.value }))}
                  className="flex-1 min-w-0 bg-[#0D1C2A] border border-white/15 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-[#32FF8B]/40"
                />
                <span className="text-[12px] font-black uppercase tracking-widest text-white/60 shrink-0">{n.symbol}</span>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={handleSave}
          className={cn(
            'w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest transition-all duration-150 active:scale-[0.98] shadow-md cursor-pointer',
            'bg-[#32FF8B] hover:bg-[#1FFF7D] text-[#010C1B] shadow-[0_0_16px_rgba(50,255,139,0.25)]',
          )}
        >
          Save Thresholds
        </button>
      </div>
    </div>
  );
}
