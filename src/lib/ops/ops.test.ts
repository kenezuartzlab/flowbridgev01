import { describe, expect, it } from "vitest";
import {
  atomicV4Performance, classifyPair, distinctSessionsBy, engagement, errorIntelligence, growthOpportunities, inPeriod,
  journeyFunnel, liquidityGaps, resolvePeriod, tokenDemand, tradeFunnel, tradeMetrics, tradeOutcomes, verificationFunnel,
  type GapRow, type ProductEventRow, type TradeEventRow,
} from "./aggregate";
import { buildAlerts, combineStatus, computeDrift, failureStreak, overviewLabel, statusFromProbe, type RouterV4Actual } from "./monitor";
import { amountBucket, sanitizeSymbol, sanitizeTradeEvent } from "@/lib/swap/operationalTelemetry";
import { areaForPath, PRODUCT_EVENT_NAMES } from "./productEvents";

const T = (event_name: string, extra: Partial<TradeEventRow> = {}): TradeEventRow => ({
  occurred_at: "2026-10-02T12:00:00.000Z", event_name, network: 677, route_type: "single", dex: "bdex-v3",
  transaction_count: 1, duration_ms: null, failure_reason: null, device_category: "mobile", token_in: "BOT", token_out: "FLOW", ...extra,
});
const P = (event_name: string, session_hash: string | null, area = "home"): ProductEventRow => ({
  occurred_at: "2026-10-02T12:00:00.000Z", event_name, area, session_hash, device_category: "mobile",
});
const G = (token_in: string, token_out: string, extra: Partial<GapRow> = {}): GapRow => ({
  observed_at: "2026-10-02T12:00:00.000Z", network: 677, token_in, token_out, dex_preference: "auto",
  dexes_checked: ["bdex-v3", "caswap"], direct_pool_found: false, multihop_found: false, missing_connection: null, ...extra,
});

const EXPECTED = {
  router: "0x79653140D84B78C19354ee984f236Ec92160fc61", owner: "0x524Db06954de917025180057BCBeB36eC96A98c5",
  treasury: "0xefc13d1a1dc30ba2da0bb005ba5a783c6b229ea4", globalFeeBps: 0, bdexV3FeeBps: 1,
  bdexV3Router: "0x07032d47A1b9f8460cBeE9dC17c1d3E438693929", wrappedNative: "0xd5452816194a3784dba983426cce7c122f4abd30",
};
const ACTUAL: RouterV4Actual = {
  routerCode: true, lensCode: true, owner: EXPECTED.owner.toLowerCase(), treasury: EXPECTED.treasury, globalFeeBps: 0, bdexV3FeeBps: 1,
  bdexV3Router: EXPECTED.bdexV3Router, bdexV3Active: true, paused: false, lensTarget: EXPECTED.router, wrappedNative: EXPECTED.wrappedNative,
};

describe("analytics correctness + receipt vs submission", () => {
  it("never counts quotes or submissions as confirmed trades", () => {
    const m = tradeMetrics([T("quote_requested"), T("quote_success"), T("tx_submitted"), T("tx_submitted")]);
    expect(m.quoteRequests).toBe(1);
    expect(m.executableQuotes).toBe(1);
    expect(m.submitted).toBe(2);
    expect(m.confirmed).toBe(0);
  });
  it("counts confirmed only from receipt-confirmed events and splits route classes", () => {
    const m = tradeMetrics([T("tx_confirmed", { route_type: "atomic_v4" }), T("tx_confirmed", { route_type: "staged", dex: "caswap+bdex-v3" }), T("tx_reverted")]);
    expect(m.confirmed).toBe(2);
    expect(m.atomicV4).toBe(1);
    expect(m.staged).toBe(1);
    expect(m.caswap).toBe(1);
    expect(m.reverted).toBe(1);
  });
});

describe("route funnel", () => {
  it("computes stage conversion from the previous stage", () => {
    const f = tradeFunnel([...Array(10)].map(() => T("quote_requested")).concat([...Array(5)].map(() => T("quote_success")), [T("review_opened"), T("review_opened")], [T("signature_requested")], [T("tx_submitted")], [T("tx_confirmed")]));
    expect(f.map((s) => s.count)).toEqual([10, 5, 2, 1, 1, 1]);
    expect(f[0].conversionFromPrev).toBeNull();
    expect(f[1].conversionFromPrev).toBe(50);
    expect(f[2].conversionFromPrev).toBe(40);
  });
  it("treats cancellation as a user choice, not a technical failure", () => {
    const o = tradeOutcomes([T("wallet_rejected"), T("tx_reverted"), T("review_invalidated"), T("quote_stale"), T("x", { failure_reason: "wrong_network" })]);
    const get = (k: string) => o.find((x) => x.key === k)!;
    expect(get("user_cancelled")).toMatchObject({ count: 1, technicalFailure: false });
    expect(get("onchain_revert").count).toBe(1);
    expect(get("quote_expired").count).toBe(2);
    expect(get("wrong_network").count).toBe(1);
  });
  it("keeps user rejection out of error intelligence", () => {
    const e = errorIntelligence([T("wallet_rejected"), T("rpc_failure"), T("rpc_failure")], new Date("2026-10-02T12:30:00Z"));
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ group: "RPC", count: 2, resolved: false });
  });
});

describe("no-route aggregation", () => {
  it("aggregates demand per pair and classifies only from observed executable routes", () => {
    const gaps = liquidityGaps(
      [G("CA", "FLOW"), G("CA", "FLOW", { observed_at: "2026-10-02T13:00:00.000Z", missing_connection: "CA↔USDT" }), G("MONEY", "CA")],
      [T("quote_success", { token_in: "CA", token_out: "FLOW", route_type: "staged" })],
    );
    expect(gaps[0]).toMatchObject({ tokenIn: "CA", tokenOut: "FLOW", requests: 2, currentClass: "STAGED", missingConnection: "CA↔USDT", lastCheckedAt: "2026-10-02T13:00:00.000Z" });
    expect(gaps[1].currentClass).toBe("NO ROUTE");
  });
  it("prefers DIRECT > ATOMIC > STAGED and never invents a route", () => {
    expect(classifyPair(["staged", "single"])).toBe("DIRECT");
    expect(classifyPair(["staged", "atomic_v4"])).toBe("ATOMIC");
    expect(classifyPair([])).toBe("NO ROUTE");
  });
  it("token demand is usage counts only", () => {
    const d = tokenDemand([T("quote_requested"), T("quote_requested", { token_in: "CA" }), T("quote_requested")], [G("CA", "FLOW")]);
    expect(d.inputTokens[0]).toEqual({ key: "BOT", count: 2 });
    expect(d.unavailablePairs[0]).toEqual({ key: "CA → FLOW", count: 1 });
    expect(Object.keys(d)).not.toContain("recommended");
  });
});

describe("configuration drift", () => {
  it("matches expected when all values equal (case-insensitive addresses)", () => {
    expect(computeDrift(EXPECTED, ACTUAL).state).toBe("MATCHES EXPECTED");
  });
  it("reports CONFIGURATION DRIFT with expected and actual", () => {
    const d = computeDrift(EXPECTED, { ...ACTUAL, paused: true, bdexV3FeeBps: 5 });
    expect(d.state).toBe("CONFIGURATION DRIFT");
    expect(d.drift.map((x) => x.key).sort()).toEqual(["bdex_v3_fee", "paused"]);
    expect(d.drift.find((x) => x.key === "bdex_v3_fee")).toMatchObject({ expected: "1", actual: "5" });
  });
  it("unreadable state is UNKNOWN, never healthy", () => {
    expect(computeDrift(EXPECTED, null).state).toBe("UNKNOWN");
    expect(statusFromProbe({ ok: null })).toBe("UNKNOWN");
    expect(overviewLabel("UNKNOWN")).toBe("UNKNOWN");
    expect(combineStatus(["OPERATIONAL", "UNKNOWN"])).toBe("UNKNOWN");
  });
  it("drift raises a critical alert without any repair action", () => {
    const alerts = buildAlerts({ now: new Date(), drift: computeDrift(EXPECTED, { ...ACTUAL, owner: "0x0000000000000000000000000000000000000001" }), recentQuoteEvents: [], recentRpcEvents: [], revertsLastHour: 0, confirmedLastHour: 0, revertsPrevDay: 0, confirmedPrevDay: 0, indexingFailures: 0, services: {} });
    const a = alerts.find((x) => x.id === "drift_owner")!;
    expect(a.severity).toBe("critical");
    expect(a.detail).toMatch(/No automatic repair/);
  });
});

describe("RPC alert recovery", () => {
  const base = { now: new Date(), drift: computeDrift(EXPECTED, ACTUAL), recentQuoteEvents: [], revertsLastHour: 0, confirmedLastHour: 0, revertsPrevDay: 0, confirmedPrevDay: 0, indexingFailures: 0, services: {} };
  const ev = (n: string) => ({ event_name: n, occurred_at: "2026-10-02T12:00:00Z" });
  it("activates after repeated failures", () => {
    const a = buildAlerts({ ...base, recentRpcEvents: [...Array(6)].map(() => ev("rpc_failure")) });
    expect(a.find((x) => x.id === "rpc_failures")!.active).toBe(true);
  });
  it("clears once the newest event succeeds", () => {
    const a = buildAlerts({ ...base, recentRpcEvents: [ev("quote_success"), ...[...Array(6)].map(() => ev("rpc_failure"))] });
    expect(a.find((x) => x.id === "rpc_failures")!.active).toBe(false);
    expect(failureStreak([ev("quote_success"), ev("rpc_failure")], (n) => n === "rpc_failure")).toBe(0);
  });
  it("unavailable services raise critical alerts", () => {
    const a = buildAlerts({ ...base, recentRpcEvents: [], services: { "BOT RPC": "UNAVAILABLE" } });
    expect(a.some((x) => x.id === "svc_BOT RPC" && x.severity === "critical")).toBe(true);
  });
});

describe("onboarding + verification funnels", () => {
  it("counts distinct pseudonymous sessions and ignores missing ids", () => {
    const rows = [P("visit", "a"), P("visit", "a"), P("visit", "b"), P("visit", null), P("wallet_connected", "a")];
    expect(distinctSessionsBy(rows)).toEqual({ visit: 2, wallet_connected: 1 });
    const j = journeyFunnel(rows, 0, 0, null);
    expect(j[0]).toMatchObject({ label: "Public Visitor", count: 2 });
    expect(j.find((s) => s.key === "wallet_connected")!.count).toBe(1);
  });
  it("verification and binding completion only from observed completion events", () => {
    const v = verificationFunnel([P("ACTIVATION_CARD_SHOWN", "a"), P("VERIFY_STARTED", "a"), P("WALLET_BINDING_STARTED", "a"), P("ACTIVATION_PROMPT_DECLINED", "b")]);
    expect(v.verification.at(-1)!.count).toBe(0);
    expect(v.binding.at(-1)!.count).toBe(0);
    expect(v.declined).toBe(1);
  });
  it("engagement separates views from meaningful actions per area", () => {
    const e = engagement([P("page_view", "a", "earn"), P("earn_category_viewed", "a", "earn"), P("page_view", "b", "staking")]);
    expect(e.find((x) => x.area === "earn")).toMatchObject({ views: 1, meaningfulActions: 1 });
  });
});

describe("DEX capability state + atomic V4", () => {
  it("fee-once validation fails if an atomic trade used more than one call", () => {
    expect(atomicV4Performance([T("tx_confirmed", { route_type: "atomic_v4", flowbridge_fee_bps: 1 })]).feeOnce).toBe("PASS");
    expect(atomicV4Performance([T("tx_confirmed", { route_type: "atomic_v4", transaction_count: 2 })]).feeOnce).toBe("FAIL");
    expect(atomicV4Performance([]).feeOnce).toBe("NO DATA");
  });
  it("only counts the approved BOT Mainnet atomic family", () => {
    expect(atomicV4Performance([T("tx_confirmed", { route_type: "atomic_v4", network: 968 })]).confirmed).toBe(0);
  });
});

describe("stale / incomplete data", () => {
  const now = new Date("2026-10-03T02:00:00Z");
  it("labels periods that start before telemetry existed as PARTIAL DATA", () => {
    expect(resolvePeriod("30d", now, new Date("2026-10-02T00:00:00Z")).partial).toBe(true);
    expect(resolvePeriod("today", now, new Date("2026-09-01T00:00:00Z")).partial).toBe(false);
    expect(resolvePeriod("7d", now, null).partial).toBe(true);
  });
  it("filters to the explicit range without extrapolation", () => {
    const p = resolvePeriod("today", now, null);
    expect(inPeriod([T("x", { occurred_at: "2026-10-02T23:00:00Z" }), T("x", { occurred_at: "2026-10-03T01:00:00Z" })], p)).toHaveLength(1);
    expect(p.label).toContain("2026-10-03 00:00 UTC");
  });
  it("growth signals require a minimum real sample", () => {
    const g = growthOpportunities({ trade: tradeMetrics([]), gaps: [], journey: journeyFunnel([P("visit", "a")], 0, 0, null), mobileQuotes: 1, mobileConfirmed: 0, desktopQuotes: 1, desktopConfirmed: 1, learnViews: 2, learnActions: 0 });
    expect(g).toEqual([]);
  });
});

describe("privacy / redaction", () => {
  it("drops non-symbol token identifiers such as addresses", () => {
    expect(sanitizeSymbol("0x524Db06954de917025180057BCBeB36eC96A98c5")).toBeUndefined();
    expect(sanitizeSymbol("flow")).toBe("FLOW");
  });
  it("sanitizes free-text failure reasons and invalid session ids", () => {
    const e = sanitizeTradeEvent({ eventName: "rpc_failure", network: 677, routeType: "unknown", dex: "auto", transactionCount: 0, failureReason: "timeout at https://secret.rpc/key=abc", sessionHash: "user@example.com" });
    expect(e.failureReason).toBe("rpc_failure");
    expect(e.sessionHash).toBeUndefined();
  });
  it("buckets amounts instead of storing them", () => {
    expect(amountBucket(0.5)).toBe("lt_1");
    expect(amountBucket(250)).toBe("100_1k");
    expect(amountBucket(null)).toBe("unknown");
  });
  it("product events carry no identity fields", () => {
    expect(PRODUCT_EVENT_NAMES.some((n) => /wallet_address|^email$|signature/i.test(n))).toBe(false);
    expect(areaForPath("/trade")).toBe("trade");
    expect(areaForPath("/stake")).toBe("staking");
  });
});
