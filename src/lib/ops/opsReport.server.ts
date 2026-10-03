/**
 * Ops V1 — server-side report builder. READ-ONLY: chain calls are eth_call /
 * eth_getCode / eth_blockNumber only; database access is SELECT only.
 */
import { createPublicClient, http, type Address, type PublicClient } from "viem";
import { botMainnet, bscMainnet } from "@/lib/wagmi";
import { MAINNET_CONTRACTS } from "@/lib/contracts";
import { FLOW_BRIDGE_ROUTER_LENS_ABI, FLOW_BRIDGE_ROUTER_V4_ABI } from "@/lib/flowbridge/routerV4Abi";
import { ROUTER_V4_MAINNET_EXPECTED } from "@/lib/swap/routerV4Health";
import { resolveCanonicalAddress } from "@/lib/deploy/v302bCanonicalRegistry";
import {
  aiObservability, atomicV4Performance, breakdown, EARN_AREAS, engagement, errorIntelligence, growthOpportunities,
  inPeriod, journeyFunnel, liquidityGaps, resolvePeriod, routeQuality, tokenDemand, tradeFunnel, tradeMetrics,
  tradeOutcomes, verificationFunnel, type GapRow, type PeriodKey, type ProductEventRow, type TradeEventRow,
} from "./aggregate";
import { buildAlerts, combineStatus, computeDrift, overviewLabel, statusFromProbe, type ProbeResult, type RouterV4Actual, type ServiceStatus } from "./monitor";

const MULTISEND_MAINNET = "0xc54CAcfd96330949db0eAEd72dE930a2d06d9778" as Address;

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T | null; ms: number; error: boolean }> {
  const t = Date.now();
  try {
    const value = await Promise.race([fn(), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 8000))]);
    return { value, ms: Date.now() - t, error: false };
  } catch {
    return { value: null, ms: Date.now() - t, error: true };
  }
}

async function codeProbe(client: PublicClient, address: Address | null): Promise<ProbeResult> {
  if (!address) return { ok: null, detail: "No canonical address recorded" };
  const r = await timed(() => client.getBytecode({ address }));
  if (r.error) return { ok: null, error: true, latencyMs: r.ms, detail: "RPC call failed" };
  const ok = !!r.value && r.value !== "0x";
  return { ok, latencyMs: r.ms, detail: ok ? "Contract code present" : "No contract code at address" };
}

async function readRouterV4Actual(client: PublicClient): Promise<RouterV4Actual | null> {
  const e = ROUTER_V4_MAINNET_EXPECTED;
  const r = await timed(async () => {
    const [routerCode, lensCode, owner, lensTarget, feeConfig, paused, routerFee, routerConfig] = await Promise.all([
      client.getBytecode({ address: e.router }),
      client.getBytecode({ address: e.lens }),
      client.readContract({ address: e.router, abi: FLOW_BRIDGE_ROUTER_V4_ABI, functionName: "owner" }),
      client.readContract({ address: e.lens, abi: FLOW_BRIDGE_ROUTER_LENS_ABI, functionName: "flowRouter" }),
      client.readContract({ address: e.router, abi: FLOW_BRIDGE_ROUTER_V4_ABI, functionName: "getFeeConfig" }),
      client.readContract({ address: e.router, abi: FLOW_BRIDGE_ROUTER_V4_ABI, functionName: "paused" }),
      client.readContract({ address: e.router, abi: FLOW_BRIDGE_ROUTER_V4_ABI, functionName: "routerFeeBps", args: [e.routerId] }),
      client.readContract({ address: e.router, abi: FLOW_BRIDGE_ROUTER_V4_ABI, functionName: "routers", args: [e.routerId] }),
    ]);
    const cfg = routerConfig as readonly [Address, number, Address, boolean, string, string];
    const fees = feeConfig as readonly [bigint, bigint, Address];
    return {
      routerCode: !!routerCode && routerCode !== "0x",
      lensCode: !!lensCode && lensCode !== "0x",
      owner: owner as string,
      treasury: fees[2],
      globalFeeBps: Number(fees[0]),
      bdexV3FeeBps: Number(routerFee as bigint),
      bdexV3Router: cfg[0],
      bdexV3Active: cfg[3],
      paused: paused as boolean,
      lensTarget: lensTarget as string,
      wrappedNative: cfg[2],
    } satisfies RouterV4Actual;
  });
  return r.value;
}

const PAGE = 1000;
async function selectAll<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, max = 20_000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await q(from, from + PAGE - 1);
    if (error || !data) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

export async function buildOpsReport(periodKey: PeriodKey) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date();
  const since = new Date(now.getTime() - 31 * 86_400_000).toISOString();

  const bot = createPublicClient({ chain: botMainnet, transport: http() }) as PublicClient;
  const bnb = createPublicClient({ chain: bscMainnet, transport: http() }) as PublicClient;

  const [trades, products, gaps, earliest, verified, profileStats, botBlock, bnbBlock, v4Actual, v3Code, bdexV3Code, bdexV2Code, caswapCode, multisendCode, stakingCode, rewardsCode] = await Promise.all([
    selectAll<TradeEventRow>((a, b) => supabaseAdmin.from("trade_operational_events").select("occurred_at,event_name,network,route_type,dex,transaction_count,duration_ms,failure_reason,device_category,token_in,token_out,price_impact_bps,slippage_bps,amount_out_ratio_bps,pool_fees_bps,flowbridge_fee_bps,gas_estimate,gas_used").gte("occurred_at", since).order("occurred_at", { ascending: false }).range(a, b)),
    selectAll<ProductEventRow>((a, b) => supabaseAdmin.from("product_events").select("occurred_at,event_name,area,session_hash,device_category").gte("occurred_at", since).order("occurred_at", { ascending: false }).range(a, b)),
    selectAll<GapRow>((a, b) => supabaseAdmin.from("liquidity_gap_observations").select("observed_at,network,token_in,token_out,dex_preference,dexes_checked,direct_pool_found,multihop_found,missing_connection").gte("observed_at", since).order("observed_at", { ascending: false }).range(a, b)),
    Promise.all([
      supabaseAdmin.from("trade_operational_events").select("occurred_at").order("occurred_at", { ascending: true }).limit(1),
      supabaseAdmin.from("product_events").select("occurred_at").order("occurred_at", { ascending: true }).limit(1),
    ]),
    selectAll<{ kind: string; action_type: string; status: string; source_chain_id: number; occurred_at: string; observed_at: string; evidence_source: string }>((a, b) =>
      supabaseAdmin.from("verified_activities").select("kind,action_type,status,source_chain_id,occurred_at,observed_at,evidence_source").gte("occurred_at", since).range(a, b)),
    Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }).not("wallet_address", "is", null),
    ]),
    timed(() => bot.getBlockNumber()),
    timed(() => bnb.getBlockNumber()),
    readRouterV4Actual(bot),
    codeProbe(bot, MAINNET_CONTRACTS.flowBridgeRouterV3 as Address),
    codeProbe(bot, MAINNET_CONTRACTS.bdexV3Router as Address),
    codeProbe(bot, MAINNET_CONTRACTS.bdexV2Router as Address),
    codeProbe(bot, MAINNET_CONTRACTS.caSwapRouter as Address),
    codeProbe(bot, MULTISEND_MAINNET),
    codeProbe(bot, resolveCanonicalAddress(677, "FlowStakingVaultV2") as Address | null),
    codeProbe(bot, resolveCanonicalAddress(677, "FlowRewardsMerkleDistributor") as Address | null),
  ]);

  // Email verification counts come from auth metadata (counts only, no emails returned).
  let emailVerified: number | null = null;
  let authUsers: number | null = null;
  try {
    let verifiedN = 0, total = 0;
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      total += data.users.length;
      verifiedN += data.users.filter((u) => !!u.email_confirmed_at).length;
      if (data.users.length < 1000) break;
    }
    emailVerified = verifiedN; authUsers = total;
  } catch { /* stays null => shown as UNKNOWN */ }

  const [firstTrade, firstProduct] = earliest;
  const startCandidates = [firstTrade.data?.[0]?.occurred_at, firstProduct.data?.[0]?.occurred_at].filter(Boolean) as string[];
  const dataStartedAt = startCandidates.length ? new Date(startCandidates.sort()[0]) : null;
  const period = resolvePeriod(periodKey, now, dataStartedAt);

  const t = inPeriod(trades, period);
  const p = inPeriod(products, period);
  const g = inPeriod(gaps, period);

  const drift = computeDrift({
    router: ROUTER_V4_MAINNET_EXPECTED.router, owner: ROUTER_V4_MAINNET_EXPECTED.owner, treasury: ROUTER_V4_MAINNET_EXPECTED.treasury,
    globalFeeBps: 0, bdexV3FeeBps: 1, bdexV3Router: ROUTER_V4_MAINNET_EXPECTED.bdexV3Router, wrappedNative: ROUTER_V4_MAINNET_EXPECTED.wrappedNative,
  }, v4Actual);

  const recentFailures = (dex: (d: string) => boolean) => trades.filter((r) => dex(r.dex.toLowerCase()) && (r.event_name === "tx_reverted" || r.event_name === "simulation_failure" || r.event_name === "rpc_failure") && Date.parse(r.occurred_at) > now.getTime() - 86_400_000).length;
  const lastSuccess = (dex: (d: string) => boolean) => trades.find((r) => r.event_name === "tx_confirmed" && dex(r.dex.toLowerCase()))?.occurred_at ?? null;
  const lastQuote = (dex: (d: string) => boolean) => trades.find((r) => (r.event_name === "quote_success" || r.event_name === "route_unavailable" || r.event_name === "rpc_failure") && dex(r.dex.toLowerCase()));

  const dexHealth = [
    { id: "bdex-v3", name: "BDEX V3", router: MAINNET_CONTRACTS.bdexV3Router, code: bdexV3Code, match: (d: string) => d.includes("v3"), caps: { SWAP: "AVAILABLE", "ADD LIQUIDITY": "TESTNET VERIFIED — MAINNET WRITES DISABLED", "REMOVE LIQUIDITY": "TESTNET VERIFIED — MAINNET WRITES DISABLED", "CREATE POOL": "TESTNET VERIFIED — MAINNET WRITES DISABLED", "POSITION DISCOVERY": "AVAILABLE (READ-ONLY)" } },
    { id: "bdex-v2", name: "BDEX V2", router: MAINNET_CONTRACTS.bdexV2Router, code: bdexV2Code, match: (d: string) => d.includes("v2") || d === "bdex", caps: { SWAP: "AVAILABLE", "ADD LIQUIDITY": "TESTNET VERIFIED — MAINNET WRITES DISABLED", "REMOVE LIQUIDITY": "TESTNET VERIFIED — MAINNET WRITES DISABLED", "CREATE POOL": "TESTNET VERIFIED — MAINNET WRITES DISABLED", "POSITION DISCOVERY": "AVAILABLE (READ-ONLY)" } },
    { id: "caswap", name: "CaSwap", router: MAINNET_CONTRACTS.caSwapRouter, code: caswapCode, match: (d: string) => d.includes("caswap"), caps: { SWAP: "AVAILABLE", "ADD LIQUIDITY": "UNAVAILABLE — LP_NOT_ALLOWED", "CREATE POOL": "UNAVAILABLE — LP_NOT_ALLOWED", "REMOVE LIQUIDITY": "SELECTOR PRESENT — NOT REHEARSED", "POSITION DISCOVERY": "AVAILABLE (READ-ONLY)" } },
  ].map((d) => {
    const q = lastQuote(d.match);
    return {
      id: d.id, name: d.name, chain: 677, router: d.router,
      codeCheck: statusFromProbe(d.code),
      quoteStatus: q ? (q.event_name === "quote_success" ? "OPERATIONAL" : q.event_name === "rpc_failure" ? "DEGRADED" : "NO ROUTE (last request)") : "UNKNOWN",
      lastQuoteAt: q?.occurred_at ?? null,
      recentSuccessAt: lastSuccess(d.match),
      recentFailures24h: recentFailures(d.match),
      capabilities: d.caps,
    };
  });

  const rpcProbe = (b: typeof botBlock): ProbeResult => ({ ok: b.error ? null : true, error: b.error, latencyMs: b.ms });
  const v4Status: ServiceStatus = v4Actual == null ? "UNKNOWN" : drift.drift.length ? "DEGRADED" : drift.items.some((i) => i.ok === null) ? "UNKNOWN" : "OPERATIONAL";
  const unresolvedActivities = verified.filter((v) => !["confirmed", "verified"].includes(v.status.toLowerCase())).length;
  const indexerStatus: ServiceStatus = verified.length === 0 ? "UNKNOWN" : unresolvedActivities > 0 ? "DEGRADED" : "OPERATIONAL";
  const services: Record<string, ServiceStatus> = {
    "Web App": "OPERATIONAL", // this report was served by the running app
    "BOT RPC": statusFromProbe(rpcProbe(botBlock)),
    "BNB RPC": statusFromProbe(rpcProbe(bnbBlock)),
    "Router V4": v4Status,
    "Router V3": statusFromProbe(v3Code),
    "BDEX V3": statusFromProbe(bdexV3Code),
    "BDEX V2": statusFromProbe(bdexV2Code),
    CaSwap: statusFromProbe(caswapCode),
    "Activity Indexer": indexerStatus,
    Rewards: statusFromProbe(rewardsCode),
    Staking: statusFromProbe(stakingCode),
    MultiSend: statusFromProbe(multisendCode),
  };

  const hour = now.getTime() - 3_600_000;
  const day = now.getTime() - 86_400_000;
  const within = (r: TradeEventRow, a: number, b = now.getTime()) => { const x = Date.parse(r.occurred_at); return x >= a && x <= b; };
  const alerts = buildAlerts({
    now, drift,
    recentQuoteEvents: trades.filter((r) => ["quote_success", "quote_failure", "rpc_failure", "route_unavailable"].includes(r.event_name)).slice(0, 50),
    recentRpcEvents: trades.filter((r) => r.event_name !== "wallet_rejected").slice(0, 50),
    revertsLastHour: trades.filter((r) => r.event_name === "tx_reverted" && within(r, hour)).length,
    confirmedLastHour: trades.filter((r) => r.event_name === "tx_confirmed" && within(r, hour)).length,
    revertsPrevDay: trades.filter((r) => r.event_name === "tx_reverted" && within(r, day, hour)).length,
    confirmedPrevDay: trades.filter((r) => r.event_name === "tx_confirmed" && within(r, day, hour)).length,
    indexingFailures: verified.filter((v) => ["failed", "rejected", "malformed"].includes(v.status.toLowerCase())).length,
    services,
  });

  const metrics = tradeMetrics(t);
  const swapSessions = 0; // trade events are not joined to journey sessions by design; see confirmed counts instead
  const earnSessions = new Set(p.filter((r) => (EARN_AREAS as readonly string[]).includes(r.area)).map((r) => r.session_hash).filter(Boolean)).size;
  const journey = journeyFunnel(p, swapSessions, earnSessions, null);
  const eng = engagement(p);
  const learn = eng.find((e) => e.area === "learn");
  const gapsView = liquidityGaps(g, t);
  const vInPeriod = verified.filter((v) => Date.parse(v.occurred_at) >= period.start.getTime());
  const indexingLatencies = vInPeriod.map((v) => Date.parse(v.observed_at) - Date.parse(v.occurred_at)).filter((x) => x >= 0);

  return {
    generatedAt: now.toISOString(),
    period: { key: period.key, label: period.label, partial: period.partial, dataStartedAt: dataStartedAt?.toISOString() ?? null },
    overview: {
      productionStatus: overviewLabel(combineStatus([services["Web App"], services["BOT RPC"], services["Router V3"]])),
      activeNetworks: [677, 968, 56, 97],
      routerV4: overviewLabel(services["Router V4"]),
      routerV3: overviewLabel(services["Router V3"]),
      bdexV3: v4Actual?.bdexV3Active == null ? "UNKNOWN" : v4Actual.bdexV3Active ? "ACTIVE" : "INACTIVE",
      flowbridgeFeeBps: v4Actual?.bdexV3FeeBps ?? null,
      globalFeeBps: v4Actual?.globalFeeBps ?? null,
      owner: v4Actual?.owner ?? null,
      treasury: v4Actual?.treasury ?? null,
      quoteService: overviewLabel(dexHealth.some((d) => d.quoteStatus === "OPERATIONAL") ? "OPERATIONAL" : dexHealth.some((d) => d.quoteStatus === "DEGRADED") ? "DEGRADED" : "UNKNOWN"),
      rpc: { bot: overviewLabel(services["BOT RPC"]), bnb: overviewLabel(services["BNB RPC"]), botLatencyMs: botBlock.ms, bnbLatencyMs: bnbBlock.ms, botBlock: botBlock.value?.toString() ?? null },
      latestConfirmedSwapAt: trades.find((r) => r.event_name === "tx_confirmed")?.occurred_at ?? null,
      recentFailures24h: trades.filter((r) => within(r, day) && ["tx_reverted", "simulation_failure", "rpc_failure", "quote_failure"].includes(r.event_name)).length,
    },
    services,
    routerV4: { expected: ROUTER_V4_MAINNET_EXPECTED.router, lens: ROUTER_V4_MAINNET_EXPECTED.lens, checkedAt: now.toISOString(), ...drift, registryDelaySeconds: 0 },
    trade: {
      metrics,
      funnel: tradeFunnel(t),
      outcomes: tradeOutcomes(t),
      byNetwork: breakdown(t, "network"),
      byPair: breakdown(t, "pair").slice(0, 25),
      byDex: breakdown(t, "dex"),
      byRouteType: breakdown(t, "route_type"),
      byDevice: breakdown(t, "device_category"),
      atomicV4: { ...atomicV4Performance(t), activityIndexedSwaps: vInPeriod.filter((v) => v.source_chain_id === 677 && /swap/i.test(v.kind + v.action_type)).length },
      quality: routeQuality(t),
    },
    liquidityGaps: gapsView,
    tokenDemand: tokenDemand(t, g),
    dexHealth,
    journey,
    accounts: {
      note: "All-time account states from verified records (counts only).",
      accounts: authUsers, emailVerified, walletBound: profileStats[1].count ?? null, profiles: profileStats[0].count ?? null,
    },
    verification: verificationFunnel(p),
    engagement: eng,
    earn: EARN_AREAS.map((a) => eng.find((e) => e.area === a) ?? { area: a, views: 0, meaningfulActions: 0, sessions: 0, actions: {} }),
    ai: aiObservability(p),
    botChain: {
      attributed: {
        routerV4Confirmed: t.filter((r) => r.network === 677 && r.route_type === "atomic_v4" && r.event_name === "tx_confirmed").length,
        otherConfirmedSwaps: t.filter((r) => r.network === 677 && r.route_type !== "atomic_v4" && r.event_name === "tx_confirmed").length,
        verifiedActivitiesByType: Object.entries(vInPeriod.filter((v) => v.source_chain_id === 677).reduce<Record<string, number>>((m, v) => { m[v.action_type] = (m[v.action_type] ?? 0) + 1; return m; }, {})).map(([key, count]) => ({ key, count })),
        liquidityInteractions: "DISABLED ON MAINNET",
      },
      general: { latestBotBlock: botBlock.value?.toString() ?? null, note: "General BOT Chain activity is not attributed to FlowBridge." },
    },
    indexing: {
      observed: vInPeriod.length,
      byStatus: vInPeriod.reduce<Record<string, number>>((m, v) => { m[v.status] = (m[v.status] ?? 0) + 1; return m; }, {}),
      avgDelayMs: indexingLatencies.length ? Math.round(indexingLatencies.reduce((s, x) => s + x, 0) / indexingLatencies.length) : null,
      delayedOver10m: indexingLatencies.filter((x) => x > 600_000).length,
      duplicateRejected: "NOT TRACKED — duplicates are rejected by unique keys and not counted",
      unresolved: unresolvedActivities,
      confirmedTradesInPeriod: metrics.confirmed,
    },
    errors: errorIntelligence(t, now),
    alerts,
    growth: growthOpportunities({
      trade: metrics, gaps: gapsView, journey,
      mobileQuotes: t.filter((r) => r.device_category === "mobile" && r.event_name === "quote_requested").length,
      mobileConfirmed: t.filter((r) => r.device_category === "mobile" && r.event_name === "tx_confirmed").length,
      desktopQuotes: t.filter((r) => r.device_category === "desktop" && r.event_name === "quote_requested").length,
      desktopConfirmed: t.filter((r) => r.device_category === "desktop" && r.event_name === "tx_confirmed").length,
      learnViews: learn?.views ?? 0, learnActions: learn?.meaningfulActions ?? 0,
    }),
  };
}

export type OpsReport = Awaited<ReturnType<typeof buildOpsReport>>;
