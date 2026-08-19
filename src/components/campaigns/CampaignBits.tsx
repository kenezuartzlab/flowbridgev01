/** Shared presentational primitives for the Growth Hub. UI only. */
import { CheckCircle2, Clock, Loader2, Lock, Target } from "lucide-react";
import type { TaskState } from "./campaignPresentation";

export function StatusPill({
  tone = "neutral",
  children,
}: {
  tone?: "live" | "done" | "ended" | "neutral";
  children: React.ReactNode;
}) {
  const styles: Record<string, string> = {
    live: "bg-primary/12 text-primary border-primary/35",
    done: "bg-success/15 text-success border-success/35",
    ended: "bg-foreground/8 text-muted border-hairline",
    neutral: "bg-foreground/6 text-muted border-hairline",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-[0.1em] ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

export function PointsChip({ value, label = "PTS" }: { value: number; label?: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-primary/12 px-2.5 py-1 font-mono text-[10px] font-black tabular-nums text-primary">
      {value.toLocaleString("en-US")} {label}
    </span>
  );
}

export function ProgressBar({
  value,
  tone = "primary",
  label,
}: {
  value: number;
  tone?: "primary" | "success";
  label?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label ?? "Progress"}
      className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10"
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ease-out ${
          tone === "success" ? "bg-success" : "bg-primary"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function ChainChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-lg border border-hairline px-2 py-0.5 font-mono text-[9px] font-black uppercase tracking-[0.08em] text-muted">
      {children}
    </span>
  );
}

export const TASK_STATE_META: Record<
  TaskState,
  { label: string; tone: "live" | "done" | "ended" | "neutral"; Icon: typeof Target }
> = {
  completed: { label: "Completed", tone: "done", Icon: CheckCircle2 },
  in_progress: { label: "In progress", tone: "live", Icon: Loader2 },
  available: { label: "Available", tone: "live", Icon: Target },
  sign_in: { label: "Sign in to track", tone: "neutral", Icon: Lock },
};

export function SkeletonCard() {
  return (
    <div className="fb-surface animate-pulse space-y-3 p-4">
      <div className="h-3 w-24 rounded bg-foreground/10" />
      <div className="h-4 w-2/3 rounded bg-foreground/10" />
      <div className="h-3 w-full rounded bg-foreground/8" />
      <div className="h-1.5 w-full rounded-full bg-foreground/10" />
      <div className="h-8 w-32 rounded-xl bg-foreground/10" />
    </div>
  );
}

export function DeadlineNote({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
      <Clock className="h-3 w-3" aria-hidden />
      {children}
    </span>
  );
}
