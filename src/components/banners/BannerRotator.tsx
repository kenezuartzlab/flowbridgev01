import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Cross-fades between slides on a timer and supports horizontal swipe /
 * drag navigation plus dot indicators. Purely presentational — it never
 * reads or mutates execution state.
 */
export function BannerRotator({
  slides,
  intervalMs = 4000,
  className = "",
  showDots = true,
}: {
  slides: ReactNode[];
  intervalMs?: number;
  className?: string;
  showDots?: boolean;
}) {
  const items = slides.filter(Boolean);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const startX = useRef<number | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (items.length < 2 || paused) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % items.length),
      Math.max(1500, intervalMs),
    );
    return () => clearInterval(id);
  }, [items.length, intervalMs, paused]);

  useEffect(() => {
    return () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, []);


  const nudge = (dir: 1 | -1) => {
    setIndex((i) => (i + dir + items.length) % items.length);
    setPaused(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setPaused(false), 8000);
  };

  if (items.length === 0) return null;
  if (items.length === 1) return <div className={className}>{items[0]}</div>;

  const active = index % items.length;

  return (
    <div className={`relative ${className}`}>
      <div
        className="grid touch-pan-y"
        onPointerDown={(e) => {
          startX.current = e.clientX;
        }}
        onPointerUp={(e) => {
          const from = startX.current;
          startX.current = null;
          if (from === null) return;
          const dx = e.clientX - from;
          if (Math.abs(dx) > 40) nudge(dx < 0 ? 1 : -1);
        }}
        onPointerCancel={() => {
          startX.current = null;
        }}
      >
        {items.map((slide, i) => (
          <div
            key={i}
            aria-hidden={i !== active}
            className={`[grid-area:1/1] transition-opacity duration-500 ease-out ${
              i === active ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            {slide}
          </div>
        ))}
      </div>

      {showDots && (
        <div className="pointer-events-auto absolute inset-x-0 -bottom-2.5 flex items-center justify-center gap-1.5">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Show banner ${i + 1}`}
              aria-current={i === active}
              onClick={() => {
                setIndex(i);
                setPaused(true);
                if (resumeTimer.current) clearTimeout(resumeTimer.current);
                resumeTimer.current = setTimeout(() => setPaused(false), 8000);
              }}
              className={`h-1 rounded-full transition-all ${
                i === active ? "w-4 bg-[#32FF8B]" : "w-1.5 bg-white/30"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
