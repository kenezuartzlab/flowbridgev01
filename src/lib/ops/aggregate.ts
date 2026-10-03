/**
 * Ops + Growth Intelligence V1 — pure aggregation over privacy-safe events.
 *
 * Rules enforced here (and tested):
 *  - A quote is never a completed trade; only `tx_confirmed` (emitted after a
 *    successful chain receipt) counts as confirmed. `tx_submitted` is separate.
 *  - User cancellation is an outcome, never a technical failure.
 *  - Periods that start before telemetry existed are labelled PARTIAL DATA and
 *    are never extrapolated.
 *  - Outputs contain counts only — no identifiers.
 */

export interface TradeEventRow {
  occurred_at: string;
  event_name: string;
  network: number;
  route_type: string;
  dex: string;
  transaction_count: number;
  duration_ms: number | null;
  failure_reason: string | null;
  device_category: string;
  token_in?: string | null;
  token_out?: string | null;
  price_impact_bps?: number | null;
  slippage_bps?: number | null;
  amount_out_ratio_bps?: number | null;
  pool_fees_bps?: number | null;
  flowbridge_fee_bps?: number | null;
  gas_estimate?: number | null;
  gas_used?: number | null;
}

export interface ProductEventRow {
  occurred_at: string;
  event_name: string;
  area: string;
  session_hash: string | null;
  device_category: string;
}

export interface GapRow {
  observed_at: string;
  network: number;
  token_in: string;
  token_out: string;
  dex_preference: string;
  dexes_checked: string[];
  direct_pool_found: boolean | null;
  multihop_found: boolean | null;
  missing_connection: string | null;
}

/* ---------------- periods ---------------- */

export type PeriodKey = "today" | "7d" | "30d";
export interface Period { key: PeriodKey; start: Date; end: Date; partial: boolean; label: string }

export function resolvePeriod(key: PeriodKey, now: Date, dataStartedAt: Date | null): Period {
  const end = now;
  const start = new Date(now);
  if (key === "today") start.setUTCHours(0, 0, 0, 0);
  else start.setTime(now.getTime() - (key === "7d" ? 7 : 30) * 86_400_000);
  const partial = dataStartedAt == null || dataStartedAt.getTime() > start.getTime();
  const fmt = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  return { key, start, end, partial, label: `${fmt(start)} → ${fmt(end)}` };
}

export function inPeriod<T extends { occurred_at?: string; observed_at?: string }>(rows: T[], p: Period): T[] {
  const a = p.start.getTime();
  const b = p.end.getTime();
  return rows.filter((r) => {
    const t = Date.parse((r.occurred_at ?? r.observed_at) as string);
    return t >= a && t <= b;
  });
}

/* ---------------- trade funnel ---------------- */

export const FUNNEL_STAGES = [
  { key: "quote_requested", label: "Quote Requested" },
  { key: "quote_success", label: "Route Found" },
  { key: "review_opened", label: "Review Opened" },
  { key: "signature_requested", label: "Signature Requested" },
  { key: "tx_submitted", label: "Submitted" },
  { key: "tx_confirmed", label: "Confirmed" },
] as const;

export interface FunnelStage { key: string; label: string; count: number; conversionFromPrev: number | null }

export function countBy<T>(rows: T[], key: (r: T) => string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = key(r);
    if (k == null || k === "") continue;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export function ratio(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : null;
}

export function buildFunnel(stages: readonly { key: string; label: string }[], counts: Record<string, number>): FunnelStage[] {
  return stages.map((s, i) => {
    const count = counts[s.key] ?? 0;
    const prev = i === 0 ? null : counts[stages[i - 1].key] ?? 0;
    return { key: s.key, label: s.label, count, conversionFromPrev: prev == null ? null : ratio(count, prev) };
  });
}

export function tradeFunnel(rows: TradeEventRow[]): FunnelStage[] {
  return buildFunnel(FUNNEL_STAGES, countBy(rows, (r) => r.event_name));
}

export type OutcomeKey =
  | "user_cancelled" | "quote_expired" | "insufficient_balance" | "wrong_network"
  | "simulation_failed" | "rpc_failure" | "minimum_output_failure" | "onchain_revert";

export const OUTCOME_LABELS: Record<OutcomeKey, string> = {
  user_cancelled: "User cancelled (user choice, not a failure)",
  quote_expired: "Quote expired / route changed",
  insufficient_balance: "Insufficient balance",
  wrong_network: "Wrong network",
  simulation_failed: "Simulation failed",
  rpc_failure: "RPC failure",
  minimum_output_failure: "Slippage / minimum-output failure",
  onchain_revert: "On-chain revert",
};

export function outcomeOf(r: TradeEventRow): OutcomeKey | null {
  switch (r.event_name) {
    case "wallet_rejected": return "user_cancelled";
    case "quote_stale":
    case "review_invalidated": return "quote_expired";
    case "insufficient_balance": return "insufficient_balance";
    case "simulation_failure": return "simulation_failed";
    case "rpc_failure": return "rpc_failure";
    case "minimum_output_failure": return "minimum_output_failure";
    case "tx_reverted": return "onchain_revert";
  }
  if (r.failure_reason === "wrong_network") return "wrong_network";
  return null;
}

export function tradeOutcomes(rows: TradeEventRow[]) {
  const c = countBy(rows, outcomeOf);
  return (Object.keys(OUTCOME_LABELS) as OutcomeKey[]).map((k) => ({
    key: k, label: OUTCOME_LABELS[k], count: c[k] ?? 0, technicalFailure: k !== "user_cancelled",
  }));
}

/* ---------------- route analytics ---------------- */

export interface TradeMetrics {
  quoteRequests: number; executableQuotes: number; noRoute: number;
  simulationsAttempted: number; simulationsPassed: number;
  signatureRequested: number; userRejected: number;
  submitted: number; confirmed: number; reverted: number;
  atomicV4: number; staged: number; single: number; caswap: number;
}

export function tradeMetrics(rows: TradeEventRow[]): TradeMetrics {
  const c = countBy(rows, (r) => r.event_name);
  const confirmed = rows.filter((r) => r.event_name === "tx_confirmed");
  return {
    quoteRequests: c.quote_requested ?? 0,
    executableQuotes: c.quote_success ?? 0,
    noRoute: c.route_unavailable ?? 0,
    simulationsAttempted: (c.simulation_success ?? 0) + (c.simulation_failure ?? 0),
    simulationsPassed: c.simulation_success ?? 0,
    signatureRequested: c.signature_requested ?? 0,
    userRejected: c.wallet_rejected ?? 0,
    submitted: c.tx_submitted ?? 0,
    confirmed: confirmed.length,
    reverted: c.tx_reverted ?? 0,
    atomicV4: confirmed.filter((r) => r.route_type === "atomic_v4").length,
    staged: confirmed.filter((r) => r.route_type === "staged").length,
    single: confirmed.filter((r) => r.route_type === "single").length,
    caswap: confirmed.filter((r) => r.dex.toLowerCase().includes("caswap")).length,
  };
}

export type Dimension = "network" | "pair" | "dex" | "route_type" | "device_category" | "token_in" | "token_out";

export function breakdown(rows: TradeEventRow[], dim: Dimension) {
  const key = (r: TradeEventRow) =>
    dim === "pair" ? (r.token_in && r.token_out ? `${r.token_in} → ${r.token_out}` : null)
    : dim === "network" ? String(r.network)
    : (r[dim] as string | null | undefined) ?? null;
  const groups = new Map<string, TradeEventRow[]>();
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.entries()]
    .map(([k, g]) => ({ key: k, ...tradeMetrics(g) }))
    .sort((a, b) => b.quoteRequests + b.confirmed - (a.quoteRequests + a.confirmed));
}

/* ---------------- atomic V4 ---------------- */

export function atomicV4Performance(rows: TradeEventRow[]) {
  const a = rows.filter((r) => r.route_type === "atomic_v4" && r.network === 677);
  const m = tradeMetrics(a);
  const confirmed = a.filter((r) => r.event_name === "tx_confirmed");
  const durations = confirmed.map((r) => r.duration_ms).filter((d): d is number => d != null);
  const quotes = a.filter((r) => r.event_name === "quote_success").length;
  // Fee-once: every confirmed atomic trade must be exactly one Router V4 call
  // charging the 1 bp BDEX V3 fee once.
  const feeViolations = confirmed.filter((r) => r.transaction_count !== 1 || (r.flowbridge_fee_bps != null && r.flowbridge_fee_bps !== 1)).length;
  return {
    quotes,
    simulations: m.simulationsAttempted,
    simulationsPassed: m.simulationsPassed,
    confirmed: m.confirmed,
    reverted: m.reverted,
    avgConfirmationMs: durations.length ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : null,
    feeOnce: confirmed.length === 0 ? "NO DATA" as const : feeViolations === 0 ? "PASS" as const : "FAIL" as const,
    feeViolations,
  };
}

/* ---------------- route quality ---------------- */

const avg = (xs: (number | null | undefined)[]) => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null;
};

export function routeQuality(rows: TradeEventRow[]) {
  const c = rows.filter((r) => r.event_name === "tx_confirmed");
  return {
    samples: c.length,
    avgPriceImpactBps: avg(c.map((r) => r.price_impact_bps)),
    avgSlippageBps: avg(c.map((r) => r.slippage_bps)),
    avgActualVsQuotedBps: avg(c.map((r) => r.amount_out_ratio_bps)),
    avgPoolFeesBps: avg(c.map((r) => r.pool_fees_bps)),
    avgFlowbridgeFeeBps: avg(c.map((r) => r.flowbridge_fee_bps)),
    avgGasEstimate: avg(c.map((r) => r.gas_estimate)),
    avgGasUsed: avg(c.map((r) => r.gas_used)),
    avgTransactions: avg(c.map((r) => r.transaction_count)),
  };
}

/* ---------------- liquidity gaps ---------------- */

export type RouteClass = "DIRECT" | "ATOMIC" | "STAGED" | "NO ROUTE";

/** Classify a pair only from executable routes actually observed. */
export function classifyPair(observedRouteTypes: string[]): RouteClass {
  if (observedRouteTypes.includes("single")) return "DIRECT";
  if (observedRouteTypes.includes("atomic_v4")) return "ATOMIC";
  if (observedRouteTypes.includes("staged")) return "STAGED";
  return "NO ROUTE";
}

export function liquidityGaps(gaps: GapRow[], trades: TradeEventRow[]) {
  const routeTypesByPair = new Map<string, Set<string>>();
  for (const t of trades) {
    if (t.event_name !== "quote_success" || !t.token_in || !t.token_out) continue;
    const k = `${t.network}:${t.token_in}:${t.token_out}`;
    if (!routeTypesByPair.has(k)) routeTypesByPair.set(k, new Set());
    routeTypesByPair.get(k)!.add(t.route_type);
  }
  const groups = new Map<string, GapRow[]>();
  for (const g of gaps) {
    const k = `${g.network}:${g.token_in}:${g.token_out}`;
    groups.set(k, [...(groups.get(k) ?? []), g]);
  }
  return [...groups.entries()].map(([k, g]) => {
    const last = g.reduce((m, r) => (r.observed_at > m.observed_at ? r : m), g[0]);
    const anyTrue = (f: (r: GapRow) => boolean | null) =>
      g.some((r) => f(r) === true) ? true : g.every((r) => f(r) === null) ? null : false;
    return {
      network: g[0].network,
      tokenIn: g[0].token_in,
      tokenOut: g[0].token_out,
      requests: g.length,
      dexesChecked: [...new Set(g.flatMap((r) => r.dexes_checked))].sort(),
      directPoolFound: anyTrue((r) => r.direct_pool_found),
      multihopFound: anyTrue((r) => r.multihop_found),
      missingConnection: last.missing_connection,
      lastCheckedAt: last.observed_at,
      currentClass: classifyPair([...(routeTypesByPair.get(k) ?? [])]),
    };
  }).sort((a, b) => b.requests - a.requests);
}

/* ---------------- token demand (usage counts only) ---------------- */

const top = (c: Record<string, number>, n = 10) =>
  Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, n).map(([key, count]) => ({ key, count }));

export function tokenDemand(trades: TradeEventRow[], gaps: GapRow[]) {
  const req = trades.filter((r) => r.event_name === "quote_requested");
  const pair = (r: TradeEventRow) => (r.token_in && r.token_out ? `${r.token_in} → ${r.token_out}` : null);
  return {
    inputTokens: top(countBy(req, (r) => r.token_in)),
    outputTokens: top(countBy(req, (r) => r.token_out)),
    unavailablePairs: top(countBy(gaps, (g) => `${g.token_in} → ${g.token_out}`)),
    quotedPairs: top(countBy(trades.filter((r) => r.event_name === "quote_success"), pair)),
    completedPairs: top(countBy(trades.filter((r) => r.event_name === "tx_confirmed"), pair)),
  };
}

/* ---------------- errors ---------------- */

export type ErrorGroup = "QUOTE" | "RPC" | "SIMULATION" | "WALLET" | "APPROVAL" | "SIGNATURE" | "ON-CHAIN REVERT" | "INDEXING" | "UI" | "UNKNOWN";

export function errorGroupOf(r: TradeEventRow): ErrorGroup | null {
  switch (r.event_name) {
    case "quote_failure":
    case "quote_stale":
    case "route_unavailable": return "QUOTE";
    case "rpc_failure": return "RPC";
    case "simulation_failure": return "SIMULATION";
    case "insufficient_balance": return "WALLET";
    case "allowance_failure": return "APPROVAL";
    case "tx_reverted":
    case "minimum_output_failure": return "ON-CHAIN REVERT";
  }
  // Note: wallet_rejected is a user choice and intentionally NOT an error.
  if (r.failure_reason === "wrong_network") return "WALLET";
  if (r.failure_reason === "unknown_failure") return "UNKNOWN";
  return null;
}

export function errorIntelligence(rows: TradeEventRow[], now: Date, resolvedAfterMs = 3_600_000) {
  const groups = new Map<string, TradeEventRow[]>();
  for (const r of rows) {
    const g = errorGroupOf(r);
    if (!g || (g === "QUOTE" && r.event_name === "route_unavailable")) continue;
    const k = `${g}|${r.network}|${r.route_type}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  return [...groups.entries()].map(([k, g]) => {
    const [group, network, routeClass] = k.split("|");
    const times = g.map((r) => r.occurred_at).sort();
    const lastSeen = times[times.length - 1];
    return {
      group, network: Number(network), routeClass, count: g.length, firstSeen: times[0], lastSeen,
      resolved: now.getTime() - Date.parse(lastSeen) > resolvedAfterMs,
    };
  }).sort((a, b) => b.count - a.count);
}

/* ---------------- journey / engagement ---------------- */

export const JOURNEY_STAGES = [
  { key: "visit", label: "Public Visitor" },
  { key: "explore_opened", label: "Explore" },
  { key: "wallet_connected", label: "Connect Wallet" },
  { key: "account_signed_in", label: "Create / Sign In Account" },
  { key: "EMAIL_VERIFIED_OBSERVED", label: "Verify Email" },
  { key: "WALLET_BOUND_OBSERVED", label: "Bind Wallet" },
] as const;

/** Distinct pseudonymous sessions per stage (no identity involved). */
export function distinctSessionsBy(rows: ProductEventRow[]): Record<string, number> {
  const sets: Record<string, Set<string>> = {};
  for (const r of rows) {
    if (!r.session_hash) continue;
    (sets[r.event_name] ??= new Set()).add(r.session_hash);
  }
  return Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, v.size]));
}

export function journeyFunnel(rows: ProductEventRow[], swapSessions: number, earnSessions: number, verifiedActivitySessions: number | null) {
  const c = { ...distinctSessionsBy(rows), first_swap: swapSessions, earn_explored: earnSessions, ...(verifiedActivitySessions == null ? {} : { verified_activity: verifiedActivitySessions }) };
  return buildFunnel([
    ...JOURNEY_STAGES,
    { key: "first_swap", label: "First Swap (confirmed)" },
    { key: "earn_explored", label: "Earn / Liquidity / Staking explored" },
  ], c);
}

export function verificationFunnel(rows: ProductEventRow[]) {
  const c = distinctSessionsBy(rows);
  return {
    verification: buildFunnel([
      { key: "ACTIVATION_CARD_SHOWN", label: "Shown verification benefits" },
      { key: "VERIFY_STARTED", label: "Verification CTA opened" },
      { key: "VERIFY_EMAIL_SENT", label: "Verification email sent" },
      { key: "EMAIL_VERIFIED_OBSERVED", label: "Email verification completed" },
    ], c),
    binding: buildFunnel([
      { key: "WALLET_BINDING_STARTED", label: "Wallet binding CTA opened" },
      { key: "WALLET_BOUND_OBSERVED", label: "Wallet binding completed" },
    ], c),
    declined: c.ACTIVATION_PROMPT_DECLINED ?? 0,
    snoozed: c.ACTIVATION_PROMPT_SNOOZED ?? 0,
  };
}

export const EARN_AREAS = ["liquidity", "positions", "earn", "staking", "campaigns", "flow_points"] as const;

export function engagement(rows: ProductEventRow[]) {
  const byArea = new Map<string, ProductEventRow[]>();
  for (const r of rows) byArea.set(r.area, [...(byArea.get(r.area) ?? []), r]);
  return [...byArea.entries()].map(([area, g]) => ({
    area,
    views: g.filter((r) => r.event_name === "page_view").length,
    meaningfulActions: g.filter((r) => r.event_name !== "page_view" && r.event_name !== "visit").length,
    sessions: new Set(g.map((r) => r.session_hash).filter(Boolean)).size,
    actions: countBy(g.filter((r) => r.event_name !== "page_view" && r.event_name !== "visit"), (r) => r.event_name),
  })).sort((a, b) => b.views - a.views);
}

export function aiObservability(rows: ProductEventRow[]) {
  return countBy(rows.filter((r) => r.event_name.startsWith("ai_")), (r) => r.event_name);
}

/* ---------------- growth opportunities ---------------- */

export interface GrowthSignal { observedSignal: string; possibleAction: string; evidence: string }

export function growthOpportunities(input: {
  trade: TradeMetrics; gaps: ReturnType<typeof liquidityGaps>; journey: FunnelStage[];
  mobileQuotes: number; mobileConfirmed: number; desktopQuotes: number; desktopConfirmed: number;
  learnViews: number; learnActions: number; minSample?: number;
}): GrowthSignal[] {
  const min = input.minSample ?? 20;
  const out: GrowthSignal[] = [];
  const topGap = input.gaps[0];
  if (topGap && topGap.requests >= 5) out.push({
    observedSignal: `High no-route demand: ${topGap.tokenIn} → ${topGap.tokenOut} (${topGap.requests} requests)`,
    possibleAction: "Possible liquidity or connectivity opportunity — investigate with the venue; no route is implied.",
    evidence: `Last checked ${topGap.lastCheckedAt}`,
  });
  const visit = input.journey.find((s) => s.key === "visit")?.count ?? 0;
  const wallet = input.journey.find((s) => s.key === "wallet_connected")?.count ?? 0;
  if (visit >= min && (ratio(wallet, visit) ?? 100) < 10) out.push({
    observedSignal: `Low wallet connection: ${wallet} of ${visit} sessions`,
    possibleAction: "Onboarding clarity opportunity — review how value is explained before connection.",
    evidence: `${ratio(wallet, visit)}% connected`,
  });
  const t = input.trade;
  if (t.executableQuotes >= min && (ratio(t.signatureRequested, t.executableQuotes) ?? 100) < 15) out.push({
    observedSignal: `High quote success but low review completion (${t.signatureRequested}/${t.executableQuotes})`,
    possibleAction: "Review UX investigation.",
    evidence: `${ratio(t.signatureRequested, t.executableQuotes)}% reached signature`,
  });
  const mr = ratio(input.mobileConfirmed, input.mobileQuotes);
  const dr = ratio(input.desktopConfirmed, input.desktopQuotes);
  if (input.mobileQuotes >= min && input.desktopQuotes >= min && mr != null && dr != null && mr < dr / 2) out.push({
    observedSignal: `Mobile completion ${mr}% vs desktop ${dr}%`,
    possibleAction: "Mobile UX investigation.",
    evidence: `${input.mobileQuotes} mobile / ${input.desktopQuotes} desktop quote requests`,
  });
  if (input.learnViews >= min && (ratio(input.learnActions, input.learnViews) ?? 100) < 5) out.push({
    observedSignal: `High Learn engagement (${input.learnViews} views) but low action (${input.learnActions})`,
    possibleAction: "Education-to-action UX opportunity.",
    evidence: "Learn page views vs meaningful actions",
  });
  return out;
}
