import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { useAccount, WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";
import { getIdToken } from "@/lib/auth";
import type { OpsReport } from "@/lib/ops/opsReport.server";

export const Route = createFileRoute("/ops")({
  head: () => ({
    meta: [
      { title: "Operations — FlowBridge (internal)" },
      { name: "description", content: "Internal FlowBridge production operations and growth intelligence." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Operations — FlowBridge (internal)" },
      { property: "og:description", content: "Internal FlowBridge production operations dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OpsRoute,
});

type PeriodKey = "today" | "7d" | "30d";
const TABS = ["Overview", "Router V4", "Trade", "Liquidity Gaps", "Token Demand", "DEX Health", "Journey", "Engagement", "BOT Chain", "Indexing", "Errors", "Alerts", "Growth"] as const;
type Tab = (typeof TABS)[number];

async function fetchReport(period: PeriodKey, wallet: string | undefined): Promise<{ status: number; report: OpsReport | null; reason?: string }> {
  const token = await getIdToken();
  const h: Record<string, string> = {};
  if (token) h.authorization = `Bearer ${token}`;
  if (wallet) h["x-wallet-address"] = wallet;
  const res = await fetch(`/api/admin/ops?period=${period}`, { headers: h });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { status: res.status, report: null, reason: j.error };
  }
  return { status: 200, report: (await res.json()) as OpsReport };
}

function tone(v: string | null | undefined) {
  const s = (v ?? "UNKNOWN").toUpperCase();
  if (["LIVE", "OPERATIONAL", "ACTIVE", "MATCHES EXPECTED", "PASS", "AVAILABLE", "AVAILABLE (READ-ONLY)"].includes(s)) return "border-primary/40 bg-primary/10 text-primary";
  if (s.startsWith("UNAVAILABLE") || ["OFFLINE", "INACTIVE", "CONFIGURATION DRIFT", "FAIL"].includes(s)) return "border-danger/40 bg-danger/10 text-danger";
  if (s === "UNKNOWN" || s === "NO DATA") return "border-hairline-strong bg-foreground/5 text-muted";
  return "border-warning/40 bg-warning/10 text-warning";
}

function Badge({ value }: { value: string | null | undefined }) {
  return <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-black uppercase tracking-wider ${tone(value)}`}>{value ?? "UNKNOWN"}</span>;
}

function Card({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="min-w-0 rounded-2xl border border-hairline bg-card p-3.5 sm:p-4">
      <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.14em] text-muted">{title}</h2>
      {note && <p className="mt-1 text-[11px] leading-snug text-muted-soft">{note}</p>}
      <div className="mt-3 min-w-0">{children}</div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border-b border-hairline py-1.5 text-[12.5px] last:border-0">
      <span className="min-w-0 truncate text-muted">{k}</span>
      <span className="min-w-0 truncate text-right font-mono font-bold text-foreground">{v}</span>
    </div>
  );
}

function Table({ cols, rows }: { cols: string[]; rows: (string | number | null | ReactNode)[][] }) {
  if (rows.length === 0) return <p className="text-[12px] text-muted">No data recorded in this period.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] text-left text-[12px]">
        <thead><tr>{cols.map((c) => <th key={c} className="border-b border-hairline px-2 py-1.5 font-mono text-[10px] font-black uppercase tracking-wider text-muted">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-hairline last:border-0">{r.map((c, j) => <td key={j} className="px-2 py-1.5 font-mono text-foreground">{c ?? "—"}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

const pct = (v: number | null) => (v == null ? "—" : `${v}%`);
const ts = (v: string | null | undefined) => (v ? new Date(v).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "—");
const short = (a: string | null | undefined) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

function Funnel({ stages }: { stages: { key: string; label: string; count: number; conversionFromPrev: number | null }[] }) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  return (
    <ol className="space-y-1.5">
      {stages.map((s) => (
        <li key={s.key} className="min-w-0">
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className="min-w-0 truncate text-foreground">{s.label}</span>
            <span className="shrink-0 font-mono text-muted">{s.count}{s.conversionFromPrev != null && <> · {pct(s.conversionFromPrev)}</>}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-foreground/5"><div className="h-full rounded-full bg-primary" style={{ width: `${(s.count / max) * 100}%` }} /></div>
        </li>
      ))}
    </ol>
  );
}

// Wallet hooks below need a WagmiProvider in this route's tree; providers are
// per-route in this app, so without it the page throws WagmiProviderNotFoundError.
function OpsRoute() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <OpsPage />
    </WagmiProvider>
  );
}

function OpsPage() {
  const [period, setPeriod] = useState<PeriodKey>("7d");
  const [tab, setTab] = useState<Tab>("Overview");
  const { address } = useAccount();
  const q = useQuery({ queryKey: ["ops-report", period, address], queryFn: () => fetchReport(period, address), refetchInterval: 60_000, retry: 1 });

  if (q.data && q.data.status !== 200) {
    return (
      <main className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-4 text-center">
        <div className="space-y-3">
          <ShieldAlert className="mx-auto h-8 w-8 text-muted" />
          <h1 className="text-lg font-black">Internal operations</h1>
          <p className="text-[13px] text-muted">This page is restricted to FlowBridge operators. Sign in with an approved admin account and connect its bound wallet.</p>
          {q.data.reason && <p className="text-[12px] font-bold text-warning">{q.data.reason}</p>}
          <Link to="/account" className="inline-block rounded-xl bg-primary px-4 py-2 text-[12px] font-black uppercase tracking-wider text-primary-foreground">Go to account</Link>
        </div>
      </main>
    );
  }

  const r = q.data?.report;
  return (
    <main className="mx-auto max-w-6xl space-y-3 px-3 py-4 sm:px-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-black uppercase tracking-[0.16em] text-muted">Internal · read-only</p>
          <h1 className="text-xl font-black sm:text-2xl">Production Operations</h1>
          {r && (
            <p className="mt-1 text-[11.5px] text-muted">
              {r.period.label} {r.period.partial && <span className="ml-1"><Badge value="PARTIAL DATA" /></span>}
              <span className="block sm:inline sm:ml-2">Telemetry since {ts(r.period.dataStartedAt)} · generated {ts(r.generatedAt)}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {(["today", "7d", "30d"] as PeriodKey[]).map((p) => (
            <button key={p} type="button" onClick={() => setPeriod(p)} className={`rounded-xl border px-3 py-1.5 font-mono text-[11px] font-black uppercase ${period === p ? "border-primary/50 bg-primary/12 text-primary" : "border-hairline bg-card text-muted"}`}>{p === "today" ? "Today" : p}</button>
          ))}
          <button type="button" onClick={() => q.refetch()} aria-label="Refresh" className="grid h-8 w-8 place-items-center rounded-xl border border-hairline bg-card text-muted"><RefreshCw className={`h-3.5 w-3.5 ${q.isFetching ? "animate-spin" : ""}`} /></button>
        </div>
      </header>

      <nav className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {TABS.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`shrink-0 rounded-full border px-3 py-1 text-[11.5px] font-bold ${tab === t ? "border-primary/50 bg-primary/12 text-primary" : "border-hairline bg-card text-muted"}`}>{t}</button>
        ))}
      </nav>

      {q.isLoading && <p className="text-[13px] text-muted">Running live read-only checks…</p>}
      {q.isError && <p className="text-[13px] text-danger">Operations report is temporarily unavailable. Status is UNKNOWN until it loads.</p>}
      {r && <TabBody tab={tab} r={r} />}
    </main>
  );
}

function TabBody({ tab, r }: { tab: Tab; r: OpsReport }) {
  const grid = "grid gap-3 md:grid-cols-2";
  switch (tab) {
    case "Overview":
      return (
        <div className={grid}>
          <Card title="Production">
            <Row k="Production status" v={<Badge value={r.overview.productionStatus} />} />
            <Row k="Active networks" v={r.overview.activeNetworks.join(", ")} />
            <Row k="Router V4" v={<Badge value={r.overview.routerV4} />} />
            <Row k="Router V3" v={<Badge value={r.overview.routerV3} />} />
            <Row k="BDEX V3" v={<Badge value={r.overview.bdexV3} />} />
            <Row k="FlowBridge fee (BDEX V3)" v={r.overview.flowbridgeFeeBps == null ? "UNKNOWN" : `${r.overview.flowbridgeFeeBps} bp`} />
            <Row k="Global fee" v={r.overview.globalFeeBps == null ? "UNKNOWN" : `${r.overview.globalFeeBps} bp`} />
            <Row k="Router V4 owner" v={short(r.overview.owner)} />
            <Row k="Treasury" v={short(r.overview.treasury)} />
          </Card>
          <Card title="Live signals">
            <Row k="Quote service" v={<Badge value={r.overview.quoteService} />} />
            <Row k="BOT RPC" v={<span className="inline-flex items-center gap-2"><Badge value={r.overview.rpc.bot} />{r.overview.rpc.botLatencyMs} ms</span>} />
            <Row k="BNB RPC" v={<span className="inline-flex items-center gap-2"><Badge value={r.overview.rpc.bnb} />{r.overview.rpc.bnbLatencyMs} ms</span>} />
            <Row k="Latest confirmed swap" v={ts(r.overview.latestConfirmedSwapAt)} />
            <Row k="Failures (24h)" v={r.overview.recentFailures24h} />
          </Card>
          <Card title="Status page" note="Each status derives from a live read-only check. UNKNOWN is never treated as healthy.">
            {Object.entries(r.services).map(([k, v]) => <Row key={k} k={k} v={<Badge value={v} />} />)}
          </Card>
          <Card title="Active alerts">
            {r.alerts.filter((a) => a.active).length === 0 ? <p className="text-[12px] text-muted">No active alerts.</p> : r.alerts.filter((a) => a.active).map((a) => <Row key={a.id} k={a.title} v={<Badge value={a.severity.toUpperCase()} />} />)}
          </Card>
        </div>
      );
    case "Router V4":
      return (
        <div className="space-y-3">
          <Card title="Router V4 configuration monitor" note={`Router ${r.routerV4.expected} · Lens ${r.routerV4.lens} · checked ${ts(r.routerV4.checkedAt)}. Read-only — nothing is repaired automatically. Registry delay: ${r.routerV4.registryDelaySeconds}s (unchanged).`}>
            <div className="mb-2"><Badge value={r.routerV4.state} /></div>
            <Table cols={["Check", "Expected", "Actual", "Status"]} rows={r.routerV4.items.map((i) => [i.label, i.expected, i.actual, <Badge key={i.key} value={i.ok == null ? "UNKNOWN" : i.ok ? "PASS" : "CONFIGURATION DRIFT"} />])} />
          </Card>
          <Card title="Atomic V4 performance" note="Approved family only: native BOT ↔ BDEX V3 multi-pool on BOT Mainnet.">
            <Row k="Quotes" v={r.trade.atomicV4.quotes} />
            <Row k="Simulations (passed / attempted)" v={`${r.trade.atomicV4.simulationsPassed} / ${r.trade.atomicV4.simulations}`} />
            <Row k="Confirmed (receipt)" v={r.trade.atomicV4.confirmed} />
            <Row k="Reverted" v={r.trade.atomicV4.reverted} />
            <Row k="Avg confirmation time" v={r.trade.atomicV4.avgConfirmationMs == null ? "—" : `${(r.trade.atomicV4.avgConfirmationMs / 1000).toFixed(1)} s`} />
            <Row k="Fee-once validation" v={<Badge value={r.trade.atomicV4.feeOnce} />} />
            <Row k="Indexed BOT swap activities" v={r.trade.atomicV4.activityIndexedSwaps} />
          </Card>
        </div>
      );
    case "Trade": {
      const m = r.trade.metrics;
      const br = (rows: OpsReport["trade"]["byDex"]) => rows.map((x) => [x.key, x.quoteRequests, x.executableQuotes, x.noRoute, x.submitted, x.confirmed, x.reverted]);
      const cols = ["Key", "Quotes", "Routes", "No route", "Submitted", "Confirmed", "Reverted"];
      return (
        <div className={grid}>
          <Card title="Route success funnel" note="Confirmed = successful chain receipt only. Quotes are never counted as trades."><Funnel stages={r.trade.funnel} /></Card>
          <Card title="Outcomes" note="Cancellation is a user choice, not a technical failure.">
            {r.trade.outcomes.map((o) => <Row key={o.key} k={o.label} v={o.count} />)}
          </Card>
          <Card title="Trade metrics">
            <Row k="Quote requests" v={m.quoteRequests} /><Row k="Executable quotes" v={m.executableQuotes} /><Row k="No-route results" v={m.noRoute} />
            <Row k="Simulations passed / attempted" v={`${m.simulationsPassed} / ${m.simulationsAttempted}`} />
            <Row k="Signature requested" v={m.signatureRequested} /><Row k="User rejected" v={m.userRejected} />
            <Row k="Submitted" v={m.submitted} /><Row k="Confirmed" v={m.confirmed} /><Row k="Reverted" v={m.reverted} />
            <Row k="Atomic V4 / Staged / Single" v={`${m.atomicV4} / ${m.staged} / ${m.single}`} /><Row k="CaSwap (confirmed)" v={m.caswap} />
          </Card>
          <Card title="Route quality (confirmed trades)">
            {Object.entries(r.trade.quality).map(([k, v]) => <Row key={k} k={k.replace(/([A-Z])/g, " $1").toLowerCase()} v={v ?? "—"} />)}
          </Card>
          <div className="md:col-span-2 space-y-3">
            <Card title="By network"><Table cols={cols} rows={br(r.trade.byNetwork)} /></Card>
            <Card title="By pair"><Table cols={cols} rows={br(r.trade.byPair)} /></Card>
            <Card title="By DEX"><Table cols={cols} rows={br(r.trade.byDex)} /></Card>
            <Card title="By route type"><Table cols={cols} rows={br(r.trade.byRouteType)} /></Card>
            <Card title="By device"><Table cols={cols} rows={br(r.trade.byDevice)} /></Card>
          </div>
        </div>
      );
    }
    case "Liquidity Gaps":
      return (
        <Card title="Liquidity gaps" note="Aggregate demand for pairs that returned “No liquidity route yet”. Class reflects executable routes actually observed for the pair.">
          <Table cols={["Network", "Pair", "Requests", "DEXs checked", "Direct pool", "Multi-hop", "Missing connection", "Current class", "Last checked"]}
            rows={r.liquidityGaps.map((g) => [g.network, `${g.tokenIn} → ${g.tokenOut}`, g.requests, g.dexesChecked.join(", "), g.directPoolFound == null ? "unknown" : g.directPoolFound ? "found" : "not found", g.multihopFound == null ? "unknown" : g.multihopFound ? "found" : "not found", g.missingConnection ?? "not determined", <Badge key="c" value={g.currentClass} />, ts(g.lastCheckedAt)])} />
        </Card>
      );
    case "Token Demand": {
      const d = r.tokenDemand;
      const list = (rows: { key: string; count: number }[]) => <Table cols={["Token / pair", "Count"]} rows={rows.map((x) => [x.key, x.count])} />;
      return (
        <div className={grid}>
          <p className="md:col-span-2 text-[11.5px] text-muted">Usage counts only — not a recommendation or a measure of quality.</p>
          <Card title="Most selected input tokens">{list(d.inputTokens)}</Card>
          <Card title="Most selected output tokens">{list(d.outputTokens)}</Card>
          <Card title="Most requested unavailable pairs">{list(d.unavailablePairs)}</Card>
          <Card title="Most quoted pairs">{list(d.quotedPairs)}</Card>
          <Card title="Most completed pairs (confirmed)">{list(d.completedPairs)}</Card>
        </div>
      );
    }
    case "DEX Health":
      return (
        <div className="grid gap-3 lg:grid-cols-3">
          {r.dexHealth.map((d) => (
            <Card key={d.id} title={d.name}>
              <Row k="Chain" v={d.chain} /><Row k="Router" v={short(d.router)} /><Row k="Contract code" v={<Badge value={d.codeCheck} />} />
              <Row k="Quote status" v={<Badge value={d.quoteStatus} />} /><Row k="Last quote" v={ts(d.lastQuoteAt)} />
              <Row k="Recent confirmed use" v={ts(d.recentSuccessAt)} /><Row k="Failures (24h)" v={d.recentFailures24h} />
              <div className="mt-2 space-y-1">{Object.entries(d.capabilities).map(([k, v]) => <Row key={k} k={k} v={<Badge value={v} />} />)}</div>
            </Card>
          ))}
        </div>
      );
    case "Journey":
      return (
        <div className={grid}>
          <Card title="User journey (pseudonymous sessions)" note="Distinct random browser sessions per stage. Swap and Bridge stay open without an account."><Funnel stages={r.journey} /></Card>
          <Card title="Account states (all-time, verified records)">
            <Row k="Accounts" v={r.accounts.accounts ?? "UNKNOWN"} /><Row k="Email verified" v={r.accounts.emailVerified ?? "UNKNOWN"} /><Row k="Wallet bound" v={r.accounts.walletBound ?? "UNKNOWN"} />
          </Card>
          <Card title="Email verification funnel"><Funnel stages={r.verification.verification} /></Card>
          <Card title="Wallet binding funnel">
            <Funnel stages={r.verification.binding} />
            <div className="mt-2"><Row k="Prompt declined" v={r.verification.declined} /><Row k="Prompt snoozed" v={r.verification.snoozed} /></div>
          </Card>
        </div>
      );
    case "Engagement":
      return (
        <div className="space-y-3">
          <Card title="Earn intelligence" note="Each category is reported separately. No combined yield or APY is computed.">
            <Table cols={["Category", "Views", "Meaningful actions", "Sessions"]} rows={r.earn.map((e) => [e.area, e.views, e.meaningfulActions, e.sessions])} />
          </Card>
          <Card title="Discovery + education (meaningful actions)">
            <Table cols={["Area", "Views", "Actions", "Sessions", "Action breakdown"]} rows={r.engagement.map((e) => [e.area, e.views, e.meaningfulActions, e.sessions, Object.entries(e.actions).map(([k, v]) => `${k}:${v}`).join(" ") || "—"])} />
          </Card>
          <Card title="Smart AI observability" note="Category-level counts only; conversation content is never stored for analytics.">
            {Object.keys(r.ai).length === 0 ? <p className="text-[12px] text-muted">No AI events recorded in this period.</p> : Object.entries(r.ai).map(([k, v]) => <Row key={k} k={k} v={v} />)}
          </Card>
        </div>
      );
    case "BOT Chain":
      return (
        <div className={grid}>
          <Card title="FlowBridge-attributed" note="Receipt-confirmed FlowBridge trades and verified activity records only.">
            <Row k="Router V4 confirmed swaps" v={r.botChain.attributed.routerV4Confirmed} />
            <Row k="Other confirmed swaps (V3 / staged)" v={r.botChain.attributed.otherConfirmedSwaps} />
            {r.botChain.attributed.verifiedActivitiesByType.map((x) => <Row key={x.key} k={`Verified: ${x.key}`} v={x.count} />)}
            <Row k="Liquidity interactions" v={<Badge value={r.botChain.attributed.liquidityInteractions} />} />
          </Card>
          <Card title="General BOT Chain activity" note={r.botChain.general.note}>
            <Row k="Latest BOT block" v={r.botChain.general.latestBotBlock ?? "UNKNOWN"} />
          </Card>
        </div>
      );
    case "Indexing":
      return (
        <Card title="Activity indexing health" note="Rewards and achievements are only ever derived from confirmed, verified activity.">
          <Row k="Activities observed" v={r.indexing.observed} />
          {Object.entries(r.indexing.byStatus).map(([k, v]) => <Row key={k} k={`Status: ${k}`} v={v} />)}
          <Row k="Avg indexing delay" v={r.indexing.avgDelayMs == null ? "—" : `${Math.round(r.indexing.avgDelayMs / 1000)} s`} />
          <Row k="Delayed > 10 min" v={r.indexing.delayedOver10m} />
          <Row k="Unresolved" v={r.indexing.unresolved} />
          <Row k="Duplicates rejected" v={r.indexing.duplicateRejected} />
          <Row k="Confirmed trades (telemetry)" v={r.indexing.confirmedTradesInPeriod} />
        </Card>
      );
    case "Errors":
      return (
        <Card title="Error intelligence" note="Grouped operational errors. No stack traces or secrets are stored. User cancellations are excluded.">
          <Table cols={["Group", "Network", "Route class", "Count", "First seen", "Last seen", "State"]} rows={r.errors.map((e) => [e.group, e.network, e.routeClass, e.count, ts(e.firstSeen), ts(e.lastSeen), <Badge key="s" value={e.resolved ? "RESOLVED" : "UNRESOLVED"} />])} />
        </Card>
      );
    case "Alerts":
      return (
        <Card title="Internal alerts" note="Informational only. No blockchain repair transaction is ever broadcast.">
          <Table cols={["Alert", "Severity", "Detail", "Since", "State"]} rows={r.alerts.map((a) => [a.title, a.severity, a.detail, ts(a.since), <Badge key="s" value={a.active ? "ACTIVE" : "CLEAR"} />])} />
        </Card>
      );
    case "Growth":
      return (
        <Card title="Growth opportunities" note="Observed signals with possible product actions — not guaranteed conclusions. Signals require a minimum sample.">
          {r.growth.length === 0 ? <p className="text-[12px] text-muted">Not enough real data yet to raise a signal.</p> : (
            <ul className="space-y-2">{r.growth.map((g, i) => (
              <li key={i} className="rounded-xl border border-hairline bg-background p-3 text-[12.5px]">
                <p><span className="font-mono text-[10px] font-black uppercase text-muted">Observed signal</span><br />{g.observedSignal}</p>
                <p className="mt-1.5"><span className="font-mono text-[10px] font-black uppercase text-muted">Possible product action</span><br />{g.possibleAction}</p>
                <p className="mt-1 text-[11px] text-muted-soft">{g.evidence}</p>
              </li>
            ))}</ul>
          )}
        </Card>
      );
  }
}
