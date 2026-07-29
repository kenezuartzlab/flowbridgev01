import { useEffect, useState } from 'react';
import logo from '@/assets/flowbridge-logo.png';

interface SiteLoaderProps {
  onDone?: () => void;
  minDurationMs?: number;
}

/**
 * Full-screen splash loader with animated FlowBridge circuit logo.
 * Auto-fades out after `minDurationMs` and calls onDone.
 */
// Module-level flag: resets on a full page load (first visit / refresh) but
// persists across client-side navigation, so the splash only plays once per load.
let splashPlayed = false;

export function SiteLoader({ onDone, minDurationMs = 900 }: SiteLoaderProps) {
  // Starts hidden so SSR and hydration match, then plays on the first mount
  // of a fresh page load only.
  const [phase, setPhase] = useState<'in' | 'out' | 'gone'>('gone');

  useEffect(() => {
    if (splashPlayed) return;
    splashPlayed = true;
    setPhase('in');
    const t1 = setTimeout(() => setPhase('out'), minDurationMs);
    const t2 = setTimeout(() => {
      setPhase('gone');
      onDone?.();
    }, minDurationMs + 350);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minDurationMs, onDone]);

  if (phase === 'gone') return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#010C1B] transition-opacity duration-300 ${
        phase === 'out' ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      aria-hidden={phase !== 'in'}
      role="status"
      aria-label="Loading FlowBridge"
    >
      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] rounded-full bg-[#32FF8B]/10 blur-[120px] animate-pulse" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[260px] h-[260px] rounded-full bg-[#00D7B2]/10 blur-[80px] animate-pulse" style={{ animationDelay: '0.4s' }} />

      {/* Grid backdrop */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(50,255,139,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(50,255,139,0.04)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />

      {/* Logo mark */}
      <div className="relative z-10 flex flex-col items-center gap-6">
        <div className="relative">
          {/* Rotating ring */}
          <div className="absolute -inset-6 rounded-full border border-[#32FF8B]/25 border-t-[#32FF8B] animate-spin-slow" />
          <div className="absolute -inset-10 rounded-full border border-[#00D7B2]/15 border-b-[#00D7B2]/60 animate-spin-reverse" />

          {/* Logo — masked reveal + pulse */}
          <div className="relative w-[128px] h-[128px] rounded-2xl overflow-hidden bg-[#0D1C2A] border border-white/10 shadow-[0_0_40px_rgba(50,255,139,0.35)]">
            <img
              src={logo}
              alt="FlowBridge"
              width={128}
              height={128}
              fetchPriority="high"
              decoding="async"
              className="w-full h-full object-contain animate-logo-pulse"
              draggable={false}
            />
            {/* Scanline sweep */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <div className="absolute inset-x-0 h-[40%] bg-gradient-to-b from-transparent via-[#32FF8B]/25 to-transparent animate-scan" />
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <h1 className="font-mono text-white text-lg tracking-[0.35em] font-black uppercase">
            Flow<span className="text-[#32FF8B]">Bridge</span>
          </h1>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#32FF8B] animate-dot-bounce" />
            <span className="w-1.5 h-1.5 rounded-full bg-[#32FF8B] animate-dot-bounce" style={{ animationDelay: '0.15s' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-[#32FF8B] animate-dot-bounce" style={{ animationDelay: '0.3s' }} />
          </div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-[#C5C1B9]/70 uppercase mt-1">
            Routing liquidity…
          </p>
        </div>
      </div>
    </div>
  );
}
