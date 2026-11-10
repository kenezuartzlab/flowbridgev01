import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from '@/components/ui/button';
import { Pause, Play } from 'lucide-react';

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
  delaysMs,
  className = "",
  showDots = true,
  slideKeys,
  onSlideVisible,
  reducedMotion,
  label = "Promotions",
}: {
  slides: ReactNode[];
  intervalMs?: number;
  delaysMs?: number[];
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
  const [manualPause, setManualPause] = useState(false);
  const startX = useRef<number | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prefersReduced = usePrefersReducedMotion();
  const reduce = reducedMotion ?? prefersReduced;

  const active = items.length ? index % items.length : 0;

  useEffect(() => {
    if (items.length < 2 || paused || manualPause || reduce) return;
    const id = setTimeout(
      () => setIndex((i) => (i + 1) % items.length),
      Math.max(1500, delaysMs?.[active] ?? intervalMs),
    );
    return () => clearTimeout(id);
  }, [items.length, intervalMs, delaysMs, active, paused, manualPause, reduce]);

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
        className="grid touch-pan-y rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        tabIndex={0}
        aria-live={paused || manualPause || reduce ? "polite" : "off"}
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
            inert={i !== active}
            className={`[grid-area:1/1] ${reduce ? "" : "transition-opacity duration-500 ease-out"} ${
              i === active ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            {slide}
          </div>
        ))}
      </div>

      {showDots && (
        <div className="banner-pagination absolute inset-x-0 bottom-0 flex items-center justify-center">
          {items.map((_, i) => (
            <Button
              key={i}
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Show banner ${i + 1} of ${items.length}`}
              aria-current={i === active}
              onClick={() => {
                setIndex(i);
                holdAutoplay();
              }}
              className="banner-dot h-6 w-6 shrink-0 rounded-full p-0 shadow-none focus-visible:ring-2"
            >
              <span aria-hidden="true" className="banner-dot-mark h-1.5 w-1.5 rounded-full" />
              <span className="sr-only">Banner {i + 1}</span>
            </Button>
          ))}
        </div>
      )}
      {!reduce && <Button type="button" variant="ghost" size="icon" className="banner-playback absolute right-1 top-1 h-6 w-6 rounded-full p-0 shadow-none [&_svg]:size-3" aria-label={manualPause?'Resume promotions':'Pause promotions'} title={manualPause?'Resume promotions':'Pause promotions'} onClick={()=>setManualPause(v=>!v)}>{manualPause?<Play/>:<Pause/>}</Button>}
    </div>
  );
}
