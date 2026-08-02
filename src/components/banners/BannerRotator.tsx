import { useEffect, useRef, useState, type ReactNode } from "react";

/** True when the OS/browser asks for reduced motion. */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * Cross-fades between slides on a timer and supports horizontal swipe /
 * drag navigation, keyboard arrows and dot indicators. Honours
 * prefers-reduced-motion (no auto-advance, no fade). Purely presentational —
 * it never reads or mutates execution state.
 */
export function BannerRotator({
  slides,
  intervalMs = 4000,
  className = "",
  showDots = true,
  slideKeys,
  onSlideVisible,
  reducedMotion,
  label = "Promotions",
}: {
  slides: ReactNode[];
  intervalMs?: number;
  className?: string;
  showDots?: boolean;
  /** Stable identifiers aligned to `slides`, used for impression reporting. */
  slideKeys?: string[];
  onSlideVisible?: (key: string, index: number) => void;
  /** Force reduced motion on (defaults to the user's OS preference). */
  reducedMotion?: boolean;
  label?: string;
}) {
  const items = slides.filter(Boolean);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const startX = useRef<number | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefersReduced = usePrefersReducedMotion();
  const reduce = reducedMotion ?? prefersReduced;

  const active = items.length ? index % items.length : 0;

  useEffect(() => {
    if (items.length < 2 || paused || reduce) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % items.length),
      Math.max(1500, intervalMs),
    );
    return () => clearInterval(id);
  }, [items.length, intervalMs, paused, reduce]);

  useEffect(() => {
    return () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, []);

  useEffect(() => {
    const key = slideKeys?.[active];
    if (key && onSlideVisible) onSlideVisible(key, active);
  }, [active, slideKeys, onSlideVisible]);

  const holdAutoplay = () => {
    setPaused(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setPaused(false), 8000);
  };

  const nudge = (dir: 1 | -1) => {
    setIndex((i) => (i + dir + items.length) % items.length);
    holdAutoplay();
  };

  if (items.length === 0) return null;
  if (items.length === 1) return <div className={className}>{items[0]}</div>;

  return (
    <div
      className={`relative ${className}`}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        className="grid touch-pan-y rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#32FF8B]/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#010C1B]"
        tabIndex={0}
        aria-live="polite"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            nudge(1);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            nudge(-1);
          }
        }}
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
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${items.length}`}
            aria-hidden={i !== active}
            className={`[grid-area:1/1] ${reduce ? "" : "transition-opacity duration-500 ease-out"} ${
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
              aria-label={`Show banner ${i + 1} of ${items.length}`}
              aria-current={i === active}
              onClick={() => {
                setIndex(i);
                holdAutoplay();
              }}
              className={`h-2.5 min-w-[10px] rounded-full outline-none transition-all focus-visible:ring-2 focus-visible:ring-[#32FF8B]/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#010C1B] ${
                i === active
                  ? "w-4 bg-[#32FF8B]"
                  : "w-2.5 bg-white/30 hover:bg-white/50"
              }`}
            >
              <span className="sr-only">Banner {i + 1}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
