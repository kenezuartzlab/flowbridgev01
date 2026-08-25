/**
 * FlowBridge V27 §9 — the in-app notification centre.
 *
 * Every notice is a pointer into an existing journey or product screen. No notice
 * claims, converts, stakes, swaps, bridges or signs. No fear language, no fake
 * scarcity, no hidden countdown, no repeated nagging: dismiss, snooze and
 * cooldowns are respected, and growth notices can be switched off entirely.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, BellOff, Clock, X } from "lucide-react";
import { StatusChip } from "@/components/ai/StatusChip";
import { useNotifications } from "@/lib/growth/useNotifications";
import type { AppNotification } from "@/lib/growth/notifications";

export function NotificationCenter() {
  const { items, account, growth, unread, growthEnabled, dismiss, snooze, markSeen, setGrowthEnabled, loading } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open || unread === 0) return;
    markSeen(items.map((n) => n.id));
  }, [open, items, markSeen, unread]);

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        aria-expanded={open}
        data-testid="notification-bell"
        className="relative grid h-10 w-10 place-items-center rounded-2xl border border-hairline bg-card text-muted transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Bell className="h-4 w-4" />
        {!loading && unread > 0 && (
          <span
            data-testid="notification-unread"
            className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 font-mono text-[9px] font-black text-primary-foreground"
          >
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          data-testid="notification-panel"
          className="absolute right-0 z-[60] mt-2 w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-hairline bg-card/97 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.7)] backdrop-blur-xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-hairline px-3.5 py-2.5">
            <p className="fb-eyebrow">Notifications</p>
            <button
              type="button"
              onClick={() => setGrowthEnabled(!growthEnabled)}
              data-testid="notification-growth-toggle"
              className="inline-flex items-center gap-1 rounded-lg border border-hairline px-2 py-1 font-mono text-[9px] font-black uppercase tracking-[0.1em] text-muted transition-colors hover:text-foreground"
            >
              {growthEnabled ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
              Growth {growthEnabled ? "on" : "off"}
            </button>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3.5 py-4 text-[11.5px] leading-relaxed text-muted">
                Nothing needs you right now. When something real changes — FLOW ready to claim,
                points ready to convert, or a mission update — it will show up here.
              </p>
            ) : (
              <>
                <Group title="Account & rewards" items={account} dismiss={dismiss} snooze={snooze} onNavigate={() => setOpen(false)} />
                <Group title="Discover" items={growth} dismiss={dismiss} snooze={snooze} onNavigate={() => setOpen(false)} />
              </>
            )}
          </div>

          <p className="border-t border-hairline px-3.5 py-2.5 text-[10px] leading-relaxed text-muted-soft">
            Notifications only open a screen. They never claim, convert, stake or sign.
          </p>
        </div>
      )}
    </div>
  );
}

function Group({
  title,
  items,
  dismiss,
  snooze,
  onNavigate,
}: {
  title: string;
  items: readonly AppNotification[];
  dismiss: (id: string) => void;
  snooze: (id: string) => void;
  onNavigate: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="border-b border-hairline last:border-b-0">
      <p className="px-3.5 pt-2.5 font-mono text-[9px] font-black uppercase tracking-[0.12em] text-muted-soft">
        {title}
      </p>
      <ul className="divide-y divide-hairline/60">
        {items.map((n) => (
          <li key={n.id} className="px-3.5 py-3" data-testid={`notification-${n.kind}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <StatusChip status={n.status} />
                <p className="mt-1.5 text-[12px] font-black leading-snug">{n.title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">{n.body}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => snooze(n.id)}
                  aria-label="Snooze for a day"
                  className="grid h-6 w-6 place-items-center rounded-lg border border-hairline text-muted-soft transition-colors hover:text-foreground"
                >
                  <Clock className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => dismiss(n.id)}
                  aria-label="Dismiss"
                  className="grid h-6 w-6 place-items-center rounded-lg border border-hairline text-muted-soft transition-colors hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
            <Link
              to={n.href}
              onClick={onNavigate}
              className="mt-2 inline-block rounded-xl border border-primary/40 bg-primary/10 px-2.5 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-primary"
            >
              {n.ctaLabel}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
