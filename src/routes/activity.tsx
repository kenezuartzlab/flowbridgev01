import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, RefreshCw, ArrowUpRight, Repeat, Waypoints, Users } from "lucide-react";
import { BottomNav } from "@/components/nav/BottomNav";
import { useAccountData } from "@/lib/app/useAccountData";
import { TabBanner } from "@/components/banners/TabBanner";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Activity — Swap & Bridge History | FlowBridge" },
      {
        name: "description",
        content:
          "Every FlowBridge swap and bridge recorded against your verified email and bound wallet, with status, amounts and FLOW earned.",
      },
      { property: "og:title", content: "FlowBridge Activity" },
      { property: "og:description", content: "Your recorded swap and bridge history on FlowBridge." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ActivityPage,
});

type Filter = "ALL" | "EARNINGS" | "SWAPS" | "BRIDGES";

const isBridgeTx = (t: any) => String(t.tx_type ?? t.txType ?? "").toUpperCase().includes("BRIDGE");
const pointsOf = (t: any) => Number(t.points_earned ?? t.pointsEarned ?? 0) || 0;

function dayLabel(value: any) {
  const d = new Date(value ?? 0);
  if (Number.isNaN(d.getTime())) return "Earlier";
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (startOf(today) - startOf(d)) / 86400000;
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function ActivityPage() {
  const { user, transactions, loading, refresh } = useAccountData();
  const [filter, setFilter] = useState<Filter>("ALL");

  const groups = useMemo(() => {
    const rows = transactions.filter((t: any) => {
      if (filter === "BRIDGES") return isBridgeTx(t);
      if (filter === "SWAPS") return !isBridgeTx(t);
      if (filter === "EARNINGS") return pointsOf(t) > 0;
      return true;
    });

    const ordered = [...rows].sort(
      (a: any, b: any) =>
        new Date(b.created_at ?? b.createdAt ?? 0).getTime() -
        new Date(a.created_at ?? a.createdAt ?? 0).getTime(),
    );

    const out: { label: string; items: any[] }[] = [];
    for (const t of ordered) {
      const label = dayLabel(t.created_at ?? t.createdAt);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(t);
      else out.push({ label, items: [t] });
    }
    return out;
  }, [transactions, filter]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-hairline bg-card-alt px-4 py-3 backdrop-blur-xl">
        <Link
          to="/"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-hairline text-muted hover:text-foreground"
          aria-label="Back to swap"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="font-mono text-[13px] font-black uppercase tracking-[0.12em]">Activity</h1>
        <button
          onClick={() => void refresh()}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg border border-hairline text-muted hover:text-foreground"
          aria-label="Refresh activity"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </header>

      <main className="mx-auto max-w-lg px-4 py-4 pb-24 sm:py-5">
        {!user ? (
          <div className="space-y-4">
            <TabBanner variant="activity" />
            <div className="rounded-2xl border border-hairline bg-card p-6 text-center">
              <h2 className="text-base font-black text-foreground">Sign in to see your history</h2>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                Activity is recorded only for a verified email and the wallet bound to it.
              </p>
              <Link
                to="/"
                className="mt-4 inline-block rounded-xl bg-primary px-5 py-2.5 font-mono text-[11px] font-black uppercase tracking-[0.1em] text-primary-foreground"
              >
                Go to Swap
              </Link>
            </div>
          </div>
        ) : (
          <>
            <EarningsSummary transactions={transactions} />

            <nav className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
              {(["ALL", "EARNINGS", "SWAPS", "BRIDGES"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 font-mono text-[10px] font-black uppercase tracking-[0.1em] transition-colors ${
                    filter === f
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-hairline bg-card text-muted"
                  }`}
                >
                  {f}
                </button>
              ))}
            </nav>

            {groups.length === 0 ? (
              <p className="rounded-2xl border border-hairline bg-card p-6 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                {loading ? "Loading activity…" : "No recorded activity yet"}
              </p>
            ) : (
              <div className="space-y-5">
                {groups.map((g) => (
                  <section key={g.label}>
                    <h2 className="mb-2 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-muted-soft">
                      {g.label}
                    </h2>
                    <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-card">
                      {g.items.map((t: any, i: number) => (
                        <ActivityRow key={t.id ?? t.tx_hash ?? `${g.label}-${i}`} tx={t} />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}

            <p className="mt-4 pb-2 text-center font-mono text-[10px] uppercase tracking-[0.08em] text-muted-soft">
              Bridges are recorded for history only · points come from swaps
            </p>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

function EarningsSummary({ transactions }: { transactions: any[] }) {
  const totals = transactions.reduce(
    (acc, t: any) => {
      if (isBridgeTx(t)) acc.bridges += 1;
      else acc.swaps += 1;
      acc.points += pointsOf(t);
      return acc;
    },
    { swaps: 0, bridges: 0, points: 0 },
  );

  return (
    <section className="relative mb-4 overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/20 via-primary/10 to-accent/15 p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary/20 blur-3xl"
      />
      <h2 className="relative font-mono text-[11px] font-black uppercase tracking-[0.12em] text-muted">
        Earnings Activity
      </h2>
      <div className="relative mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-2xl font-black tabular-nums text-primary">{totals.points.toLocaleString()}</p>
          <p className="font-mono text-[9px] font-black uppercase tracking-[0.1em] text-muted-soft">
            FLOW earned
          </p>
        </div>
        <div>
          <p className="text-2xl font-black tabular-nums text-foreground">{totals.swaps}</p>
          <p className="font-mono text-[9px] font-black uppercase tracking-[0.1em] text-muted-soft">Swaps</p>
        </div>
        <div>
          <p className="text-2xl font-black tabular-nums text-foreground">{totals.bridges}</p>
          <p className="font-mono text-[9px] font-black uppercase tracking-[0.1em] text-muted-soft">Bridges</p>
        </div>
      </div>
    </section>
  );
}

function ActivityRow({ tx }: { tx: any }) {
  const type = String(tx.tx_type ?? tx.txType ?? "TX").toUpperCase();
  const bridge = isBridgeTx(tx);
  const status = String(tx.status ?? "").toUpperCase();
  const points = pointsOf(tx);
  const hash = tx.tx_hash ?? tx.txHash ?? "";
  const created = tx.created_at ?? tx.createdAt;
  const Icon = bridge ? Waypoints : type.includes("REFERRAL") ? Users : Repeat;

  return (
    <li className="flex items-start gap-3 p-3.5">
      <span
        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
          bridge ? "border-accent/30 bg-accent/10 text-accent" : "border-primary/30 bg-primary/10 text-primary"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold text-foreground">
          {bridge ? "Bridge Transaction" : "Swap Reward"}
        </p>
        <p className="mt-0.5 truncate font-mono text-[10.5px] text-muted">
          {tx.direction ?? type} · {tx.from_amount ?? tx.fromAmount ?? "—"} →{" "}
          {tx.to_amount ?? tx.toAmount ?? "—"}
        </p>
        {hash ? (
          <a
            href={`https://scan.botchain.ai/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] text-muted-soft hover:text-primary"
          >
            {String(hash).slice(0, 10)}…{String(hash).slice(-6)}
            <ArrowUpRight className="h-3 w-3" />
          </a>
        ) : null}
      </div>

      <div className="shrink-0 text-right">
        <p
          className={`font-mono text-[12px] font-black tabular-nums ${
            points > 0 ? "text-primary" : "text-muted-soft"
          }`}
        >
          {points > 0 ? `+${points.toLocaleString()} FLOW` : "—"}
        </p>
        <p className="font-mono text-[10px] text-muted">
          {created ? new Date(created).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : ""}
        </p>
        <p
          className={`font-mono text-[9px] font-black uppercase tracking-[0.08em] ${
            status === "SUCCESS" || status === "COMPLETED" ? "text-success" : "text-warning"
          }`}
        >
          {status || "PENDING"}
        </p>
      </div>
    </li>
  );
}

/** Presentational marker so unused-icon lint stays quiet if the roadmap rows land later. */
