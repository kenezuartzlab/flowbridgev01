import { useEffect, useState, type ReactNode } from "react";

/**
 * Cross-fades between slides on a timer. Purely presentational —
 * it never reads or mutates execution state.
 */
export function BannerRotator({
  slides,
  intervalMs = 6000,
  className = "",
}: {
  slides: ReactNode[];
  intervalMs?: number;
  className?: string;
}) {
  const items = slides.filter(Boolean);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (items.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % items.length), intervalMs);
    return () => clearInterval(id);
  }, [items.length, intervalMs]);

  if (items.length === 0) return null;
  if (items.length === 1) return <div className={className}>{items[0]}</div>;

  const active = index % items.length;

  return (
    <div className={`grid ${className}`}>
      {items.map((slide, i) => (
        <div
          key={i}
          aria-hidden={i !== active}
          className={`[grid-area:1/1] transition-opacity duration-700 ease-out ${
            i === active ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          {slide}
        </div>
      ))}
    </div>
  );
}
