/**
 * FlowBridge V10.1 — shared consumer primitives.
 *
 * Home, Explore, Activity and Profile all render through these so the four
 * surfaces stay one visual family in both light and dark mode. Every value is
 * a semantic token (`bg-card`, `border-hairline`, `text-muted`…), so theming is
 * a token swap and never a per-route override.
 *
 * Monospace is reserved for technical metadata (addresses, hashes, amounts,
 * timestamps) — all UI labels use the sans stack.
 */
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/* ---------------------------------------------------------------- page ---- */

/**
 * Page wrapper: background, width and the bottom safe-area padding that keeps
 * content clear of the fixed mobile nav (nav height + device inset).
 */
export function SafeAreaPage({
  children,
  width = "regular",
  className = "",
}: {
  children: ReactNode;
  width?: "regular" | "wide";
  className?: string;
}) {
  return (
    <main
      className={`mx-auto w-full space-y-4 px-3 pt-3 sm:px-4 sm:pt-4 md:pt-6 ${
        width === "wide" ? "max-w-2xl md:max-w-4xl lg:max-w-[1180px]" : "max-w-2xl md:max-w-3xl"
      } ${className}`}
      style={{ paddingBottom: "calc(84px + env(safe-area-inset-bottom, 0px))" }}
    >
      {children}
    </main>
  );
}

/* ------------------------------------------------------------- surfaces ---- */

/** One major surface per section — avoids card-on-card borders. */
export function Surface({
  children,
  className = "",
  padded = false,
  id,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  /** Anchor id so pages can deep-link to a section. */
  id?: string;
}) {
  return (
    <section id={id} className={`fb-surface overflow-hidden ${padded ? "p-4" : ""} ${className}`}>
      {children}
    </section>
  );
}

export function SectionHeader({
  title,
  hint,
  action,
  badge,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="truncate text-[14px] font-black tracking-[-0.01em]">{title}</h2>
          {badge}
        </div>
        {hint && <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{hint}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- pills ---- */

export type StatusTone = "ok" | "pending" | "warn" | "danger" | "neutral" | "info";

const TONES: Record<StatusTone, string> = {
  ok: "border-success/30 bg-success/10 text-success",
  pending: "border-warning/30 bg-warning/10 text-warning",
  warn: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-danger/30 bg-danger/10 text-danger",
  info: "border-primary/30 bg-primary/10 text-primary",
  neutral: "border-hairline bg-foreground/5 text-muted",
};

export function StatusPill({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function toneForStatus(status: string): StatusTone {
  const s = status.toUpperCase();
  if (["SUCCESS", "COMPLETED", "CONFIRMED", "SETTLED", "VERIFIED", "DELIVERED"].includes(s)) return "ok";
  if (["FAILED", "REVERTED", "REJECTED", "ERROR"].includes(s)) return "danger";
  if (!s) return "neutral";
  return "pending";
}

/* -------------------------------------------------------------- metrics ---- */

export type Metric = { label: string; value: string; hint?: string };

/** Up to three compact metrics on a single quiet surface. */
export function MetricStrip({ items, className = "" }: { items: Metric[]; className?: string }) {
  return (
    <dl
      className={`fb-surface grid gap-px overflow-hidden ${
        items.length >= 3 ? "grid-cols-3" : items.length === 2 ? "grid-cols-2" : "grid-cols-1"
      } ${className}`}
    >
      {items.map((m) => (
        <div key={m.label} className="px-3 py-3 text-center sm:px-4">
          <dd className="font-mono text-[18px] font-black leading-none tabular-nums sm:text-[20px]">
            {m.value}
          </dd>
          <dt className="mt-1 truncate text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted">
            {m.label}
          </dt>
          {m.hint && <p className="mt-0.5 truncate text-[10px] text-muted-soft">{m.hint}</p>}
        </div>
      ))}
    </dl>
  );
}

/* ----------------------------------------------------------------- rows ---- */

/** Settings / navigation row. Use inside a `Surface` with `divide-y`. */
export function ListRow({
  icon,
  label,
  description,
  value,
  to,
  hash,
  onClick,
  tone = "default",
  trailing,
}: {
  icon?: ReactNode;
  label: string;
  description?: string;
  value?: ReactNode;
  to?: string;
  hash?: string;
  onClick?: () => void;
  tone?: "default" | "danger";
  trailing?: ReactNode;
}) {
  const body = (
    <>
      {icon && (
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
            tone === "danger" ? "bg-danger/10 text-danger" : "bg-primary/10 text-primary"
          }`}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[13.5px] font-bold ${
            tone === "danger" ? "text-danger" : "text-foreground"
          }`}
        >
          {label}
        </span>
        {description && (
          <span className="mt-0.5 block truncate text-[11px] text-muted">{description}</span>
        )}
      </span>
      {value && (
        <span className="shrink-0 text-[11.5px] font-bold text-muted">{value}</span>
      )}
      {trailing ?? (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-soft" aria-hidden />
      )}
    </>
  );

  const cls =
    "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-foreground/5 min-h-[52px]";

  if (to) {
    return (
      <Link to={to} hash={hash} className={cls}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}

/**
 * Timeline row for evidence/history lists: status, type, route/amount,
 * timestamp, optional points and a details/explorer action.
 */
export function TimelineRow({
  icon,
  title,
  meta,
  timestamp,
  status,
  statusTone,
  points,
  action,
}: {
  icon?: ReactNode;
  title: string;
  meta?: ReactNode;
  timestamp?: string;
  status?: string;
  statusTone?: StatusTone;
  points?: string;
  action?: ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      {icon && (
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="truncate text-[13px] font-bold">{title}</p>
          {status && (
            <StatusPill tone={statusTone ?? toneForStatus(status)}>{status}</StatusPill>
          )}
        </div>
        {meta && (
          <p className="mt-0.5 truncate font-mono text-[10.5px] text-muted">{meta}</p>
        )}
        {action && <div className="mt-1">{action}</div>}
      </div>
      <div className="shrink-0 text-right">
        {points && (
          <p className="font-mono text-[12px] font-black tabular-nums text-primary">{points}</p>
        )}
        {timestamp && <p className="font-mono text-[10px] text-muted-soft">{timestamp}</p>}
      </div>
    </li>
  );
}
