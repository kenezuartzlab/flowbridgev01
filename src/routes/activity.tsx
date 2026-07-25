import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, RefreshCw, ArrowUpRight } from "lucide-react";
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
          "Every FlowBridge swap and bridge recorded against your verified email and bound wallet, with status, amounts and transaction links.",
      },
      { property: "og:title", content: "FlowBridge Activity" },
      { property: "og:description", content: "Your recorded swap and bridge history on FlowBridge." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ActivityPage,
});

type Filter = "ALL" | "SWAP" | "BRIDGE";

function ActivityPage() {
  const { user, transactions, loading, refresh } = useAccountData();
  const [filter, setFilter] = useState<Filter>("ALL");

  const rows = useMemo(() => {
    if (filter === "ALL") return transactions;
    return transactions.filter((t: any) => {
      const type = String(t.tx_type ?? t.txType ?? "").toUpperCase();
      return filter === "BRIDGE" ? type.includes("BRIDGE") : !type.includes("BRIDGE");
    });
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

      <main className="mx-auto max-w-lg px-4 py-4 sm:py-5">
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

            <div className="mb-4 flex gap-2">

              {(["ALL", "SWAP", "BRIDGE"] as Filter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`flex-1 rounded-xl border py-2 font-mono text-[10px] font-black uppercase tracking-[0.1em] transition-colors ${
                    filter === f
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-hairline bg-card text-muted"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {rows.length === 0 ? (
              <p className="rounded-2xl border border-hairline bg-card p-6 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                {loading ? "Loading activity…" : "No recorded activity yet"}
              </p>
            ) : (
              <ul className="space-y-2">
                {rows.map((t: any, i: number) => (
                  <ActivityRow key={t.id ?? t.tx_hash ?? i} tx={t} />
                ))}
              </ul>
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
      const type = String(t.tx_type ?? t.txType ?? "").toUpperCase();
      const points = Number(t.points_earned ?? t.pointsEarned ?? 0) || 0;
      if (type.includes("BRIDGE")) acc.bridges += 1;
      else acc.swaps += 1;
      acc.points += points;
      return acc;
    },
    { swaps: 0, bridges: 0, points: 0 },
  );

  return (
    <section className="mb-4 rounded-2xl border border-primary/25 bg-primary/5 p-4">
      <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.1em] text-muted">
        Earnings Activity
      </h2>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xl font-black tabular-nums text-primary">
            {totals.points.toLocaleString()}
          </p>
          <p className="font-mono text-[9px] font-black uppercase tracking-[0.1em] text-muted-soft">
            FLOW earned
          </p>
        </div>
        <div>
          <p className="text-xl font-black tabular-nums text-foreground">{totals.swaps}</p>
          <p className="font-mono text-[9px] font-black uppercase tracking-[0.1em] text-muted-soft">
            Swaps
          </p>
        </div>
        <div>
          <p className="text-xl font-black tabular-nums text-foreground">{totals.bridges}</p>
          <p className="font-mono text-[9px] font-black uppercase tracking-[0.1em] text-muted-soft">
            Bridges
          </p>
        </div>
      </div>
    </section>
  );
}

function ActivityRow({ tx }: { tx: any }) {
  const type = String(tx.tx_type ?? tx.txType ?? "TX").toUpperCase();
  const isBridge = type.includes("BRIDGE");
  const status = String(tx.status ?? "").toUpperCase();
  const points = Number(tx.points_earned ?? tx.pointsEarned ?? 0);
  const hash = tx.tx_hash ?? tx.txHash ?? "";
  const created = tx.created_at ?? tx.createdAt;

  return (
    <li className="rounded-2xl border border-hairline bg-card p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-md px-1.5 py-0.5 font-mono text-[9px] font-black uppercase tracking-[0.08em] ${
                isBridge ? "bg-accent/15 text-accent" : "bg-primary/15 text-primary"
              }`}
            >
              {isBridge ? "Bridge" : "Swap"}
            </span>
            <span className="truncate font-mono text-[11px] font-bold text-foreground">
              {tx.direction ?? type}
            </span>
          </div>
          <p className="mt-1 truncate font-mono text-[10px] text-muted">
            {tx.from_amount ?? tx.fromAmount ?? "—"} → {tx.to_amount ?? tx.toAmount ?? "—"}
            {created ? ` · ${new Date(created).toLocaleString()}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={`font-mono text-[10px] font-black uppercase ${
              status === "SUCCESS" || status === "COMPLETED" ? "text-success" : "text-warning"
            }`}
          >
            {status || "PENDING"}
          </p>
          <p className="font-mono text-[10px] text-muted">
            {points > 0 ? `+${points} FLOW` : "0 FLOW"}
          </p>
        </div>
      </div>
      {hash ? (
        <a
          href={`https://scan.botchain.ai/tx/${hash}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 font-mono text-[10px] text-muted hover:text-primary"
        >
          {String(hash).slice(0, 10)}…{String(hash).slice(-6)}
          <ArrowUpRight className="h-3 w-3" />
        </a>
      ) : null}
    </li>
  );
}
