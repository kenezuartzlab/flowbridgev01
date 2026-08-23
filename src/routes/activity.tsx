/**
 * FlowBridge V10.1 — Activity on the shared consumer shell.
 *
 * The old dark/terminal treatment (sticky mono header, nested bordered cards,
 * monospace everywhere) is gone: this route now renders through the same
 * primitives as Home and Explore — `AppTopBar`, `SafeAreaPage`, `Surface`,
 * `MetricStrip`, `TimelineRow`, `StatusPill` — so all four surfaces read as one
 * product in both themes.
 *
 * Data semantics are untouched: verified server evidence and local submissions
 * stay two separately labelled sources and are never merged.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowUpRight, RefreshCw, Repeat, Users, Waypoints } from "lucide-react";
import { SignInButton } from "@/components/auth/SignInButton";
import { BottomNav } from "@/components/nav/BottomNav";
import { AppTopBar } from "@/components/layout/AppTopBar";
import { useAccountData } from "@/lib/app/useAccountData";
import { TabBanner } from "@/components/banners/TabBanner";
import { VerifiedActivityPanel } from "@/components/app/VerifiedActivityPanel";
import {
  MetricStrip,
  SafeAreaPage,
  SectionHeader,
  StatusPill,
  Surface,
  TimelineRow,
  toneForStatus,
} from "@/components/ui-kit/primitives";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Activity — FlowBridge" },
      {
        name: "description",
        content:
          "Every FlowBridge swap and bridge recorded against your verified email and bound wallet, with status, amounts and FLOW earned.",
      },
      { property: "og:title", content: "Activity — FlowBridge" },
      { property: "og:description", content: "Every FlowBridge swap and bridge recorded against your verified email and bound wallet, with status, amounts and FLOW earned." },
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

  const totals = useMemo(
    () =>
      transactions.reduce(
        (acc: { swaps: number; bridges: number; points: number }, t: any) => {
          if (isBridgeTx(t)) acc.bridges += 1;
          else acc.swaps += 1;
          acc.points += pointsOf(t);
          return acc;
        },
        { swaps: 0, bridges: 0, points: 0 },
      ),
    [transactions],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppTopBar
        eyebrow="Activity"
        title="Your evidence timeline"
        avatar={user?.photoURL ?? null}
        initial={(user?.displayName || user?.email || "G").slice(0, 1).toUpperCase()}
        actions={
          <button
            type="button"
            onClick={() => void refresh()}
            aria-label="Refresh activity"
            className="grid h-9 w-9 place-items-center rounded-2xl border border-hairline bg-card text-muted transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          </button>
        }
      />

      <SafeAreaPage width="wide">
        {!user ? (
          <>
            <TabBanner variant="activity" />
            <Surface padded className="text-center">
              <h2 className="text-[15px] font-black">Sign in to see your history</h2>
              <p className="mx-auto mt-1.5 max-w-sm text-[12px] leading-relaxed text-muted">
                Activity is recorded only for a verified email and the wallet bound to it.
              </p>
              <div className="mt-4 flex justify-center">
                <SignInButton label="Sign in" returnTo="/activity" />
              </div>
            </Surface>
          </>
        ) : (
          <>
            <MetricStrip
              items={[
                { label: "FLOW earned", value: totals.points.toLocaleString("en-US") },
                { label: "Swaps", value: String(totals.swaps) },
                { label: "Bridges", value: String(totals.bridges) },
              ]}
            />

            {/* Source 1 — server-verified evidence. */}
            <VerifiedActivityPanel />

            {/* Source 2 — local submissions from this device. */}
            <Surface>
              <SectionHeader
                title="Submissions"
                hint="Recorded by this device — not server-verified evidence."
                badge={<StatusPill tone="neutral">This device</StatusPill>}
              />

              <div className="border-t border-hairline px-4 py-2.5">
                <nav aria-label="Filter submissions" className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
                  {(
                    [
                      ["ALL", "All"],
                      ["SWAPS", "Swaps"],
                      ["BRIDGES", "Bridges"],
                      ["EARNINGS", "Earning"],
                    ] as [Filter, string][]
                  ).map(([f, label]) => (
                    <button
                      key={f}
                      onClick={() => setFilter(f)}
                      aria-pressed={filter === f}
                      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] font-bold transition-colors ${
                        filter === f
                          ? "border-primary/40 bg-primary/15 text-primary"
                          : "border-hairline bg-transparent text-muted hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
              </div>

              {groups.length === 0 ? (
                <p className="border-t border-hairline px-4 py-6 text-center text-[12px] text-muted">
                  {loading ? "Loading activity…" : "No recorded activity yet."}
                </p>
              ) : (
                groups.map((g) => (
                  <div key={g.label} className="border-t border-hairline">
                    <p className="px-4 pt-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-soft">
                      {g.label}
                    </p>
                    <ul>
                      {g.items.map((t: any, i: number) => (
                        <SubmissionRow key={t.id ?? t.tx_hash ?? `${g.label}-${i}`} tx={t} />
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </Surface>

            <p className="pb-1 text-center text-[11px] text-muted-soft">
              Bridges are recorded for history only · points come from swaps
            </p>
          </>
        )}
      </SafeAreaPage>

      <BottomNav />
    </div>
  );
}

function SubmissionRow({ tx }: { tx: any }) {
  const type = String(tx.tx_type ?? tx.txType ?? "TX").toUpperCase();
  const bridge = isBridgeTx(tx);
  const status = String(tx.status ?? "").toUpperCase() || "PENDING";
  const points = pointsOf(tx);
  const hash = tx.tx_hash ?? tx.txHash ?? "";
  const created = tx.created_at ?? tx.createdAt;
  const Icon = bridge ? Waypoints : type.includes("REFERRAL") ? Users : Repeat;

  return (
    <TimelineRow
      icon={<Icon className="h-4 w-4" aria-hidden />}
      title={bridge ? "Bridge transaction" : "Swap reward"}
      status={status}
      statusTone={toneForStatus(status)}
      meta={`${tx.direction ?? type} · ${tx.from_amount ?? tx.fromAmount ?? "—"} → ${
        tx.to_amount ?? tx.toAmount ?? "—"
      }`}
      timestamp={
        created
          ? new Date(created).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
          : undefined
      }
      points={points > 0 ? `+${points.toLocaleString("en-US")} FLOW` : undefined}
      action={
        hash ? (
          <a
            href={`https://scan.botchain.ai/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[10px] text-muted-soft hover:text-primary"
          >
            {String(hash).slice(0, 10)}…{String(hash).slice(-6)}
            <ArrowUpRight className="h-3 w-3" aria-hidden />
          </a>
        ) : undefined
      }
    />
  );
}
