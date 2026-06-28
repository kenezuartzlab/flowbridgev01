import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface SlippagePopoverProps {
  value: number; // percent, e.g. 0.5
  onChange: (v: number) => void;
}

const PRESETS = [0.1, 0.5, 1];

export function SlippagePopover({ value, onChange }: SlippagePopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  return (
    <div ref={ref} className="relative font-mono">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#010C1B] border border-white/15 text-[12px] font-black uppercase tracking-wider text-[#C5C1B9] hover:text-[#32FF8B] hover:border-[#32FF8B]/30 cursor-pointer transition-colors"
        title="Slippage tolerance"
      >
        <SlidersHorizontal className="w-3 h-3" />
        <span>Auto: {value}%</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 z-40 w-[240px] bg-[#010C1B] border border-white/15 rounded-xl p-3 shadow-2xl space-y-2.5">
          <div className="text-[11px] font-black uppercase tracking-widest text-[#C5C1B9]">
            Slippage tolerance
          </div>
          <div className="flex gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  onChange(p);
                  setOpen(false);
                }}
                className={cn(
                  "flex-1 py-1.5 rounded-md text-[12px] font-black uppercase tracking-wider border transition-colors cursor-pointer",
                  value === p
                    ? "bg-[#32FF8B]/15 text-[#32FF8B] border-[#32FF8B]/40"
                    : "bg-transparent text-white border-white/10 hover:border-white/25",
                )}
              >
                {p}%
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.1"
              min="0.05"
              max="50"
              value={value}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v > 0 && v <= 50) onChange(v);
              }}
              className="w-full bg-[#0D1C2A] border border-white/15 rounded-md px-2 py-1.5 text-[13px] text-white font-mono focus:outline-none focus:border-[#32FF8B]/50"
            />
            <span className="text-[12px] text-[#C5C1B9] font-black">%</span>
          </div>
          {value >= 5 && (
            <div className="text-[11px] text-amber-400 font-mono">
              ⚠ High slippage — trade may be front-run.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
