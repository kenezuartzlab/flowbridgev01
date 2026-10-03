/**
 * Ops V1 — read-only Router V4 drift, service status and informational alerts.
 * Nothing here can send a transaction or "repair" configuration.
 */
export type ServiceStatus = "OPERATIONAL" | "DEGRADED" | "UNAVAILABLE" | "UNKNOWN";

export interface ProbeResult { ok: boolean | null; latencyMs?: number | null; detail?: string; error?: boolean }

/** UNKNOWN is never upgraded to OPERATIONAL; slow responses are DEGRADED. */
export function statusFromProbe(p: ProbeResult | null | undefined, slowMs = 4000): ServiceStatus {
  if (!p || p.ok === null) return "UNKNOWN";
  if (p.error) return "UNAVAILABLE";
  if (p.ok === false) return "DEGRADED";
  if (p.latencyMs != null && p.latencyMs > slowMs) return "DEGRADED";
  return "OPERATIONAL";
}

export function combineStatus(statuses: ServiceStatus[]): ServiceStatus {
  if (statuses.length === 0 || statuses.includes("UNKNOWN")) return statuses.includes("UNAVAILABLE") ? "UNAVAILABLE" : "UNKNOWN";
  if (statuses.includes("UNAVAILABLE")) return "UNAVAILABLE";
  if (statuses.includes("DEGRADED")) return "DEGRADED";
  return "OPERATIONAL";
}

/** Map service statuses onto the overview labels. */
export function overviewLabel(s: ServiceStatus): "LIVE" | "DEGRADED" | "OFFLINE" | "UNKNOWN" {
  return s === "OPERATIONAL" ? "LIVE" : s === "DEGRADED" ? "DEGRADED" : s === "UNAVAILABLE" ? "OFFLINE" : "UNKNOWN";
}

export interface RouterV4Actual {
  routerCode: boolean | null;
  lensCode: boolean | null;
  owner: string | null;
  treasury: string | null;
  globalFeeBps: number | null;
  bdexV3FeeBps: number | null;
  bdexV3Router: string | null;
  bdexV3Active: boolean | null;
  paused: boolean | null;
  lensTarget: string | null;
  wrappedNative: string | null;
}

export interface RouterV4Expected {
  router: string; owner: string; treasury: string; globalFeeBps: number; bdexV3FeeBps: number;
  bdexV3Router: string; wrappedNative: string;
}

export interface DriftItem { key: string; label: string; expected: string; actual: string; ok: boolean | null }

const norm = (v: unknown) => (v == null ? null : String(v).toLowerCase());

export function computeDrift(expected: RouterV4Expected, actual: RouterV4Actual | null) {
  const a = actual;
  const item = (key: string, label: string, exp: unknown, act: unknown): DriftItem => ({
    key, label, expected: String(exp), actual: act == null ? "unavailable" : String(act),
    ok: act == null ? null : norm(exp) === norm(act),
  });
  const items: DriftItem[] = [
    item("router_code", "Router V4 bytecode present", true, a?.routerCode),
    item("lens_code", "Lens bytecode present", true, a?.lensCode),
    item("owner", "Router owner", expected.owner, a?.owner),
    item("treasury", "Treasury", expected.treasury, a?.treasury),
    item("global_fee", "Global fee (bp)", expected.globalFeeBps, a?.globalFeeBps),
    item("bdex_v3_fee", "BDEX V3 fee (bp)", expected.bdexV3FeeBps, a?.bdexV3FeeBps),
    item("bdex_v3_router", "BDEX V3 registered router", expected.bdexV3Router, a?.bdexV3Router),
    item("bdex_v3_active", "BDEX V3 active", true, a?.bdexV3Active),
    item("paused", "Router paused", false, a?.paused),
    item("lens_target", "Lens target", expected.router, a?.lensTarget),
    item("wrapped_native", "Wrapped native (WBOT)", expected.wrappedNative, a?.wrappedNative),
  ];
  const drift = items.filter((i) => i.ok === false);
  const unknown = items.filter((i) => i.ok === null);
  return {
    items,
    drift,
    state: drift.length ? "CONFIGURATION DRIFT" as const : unknown.length ? "UNKNOWN" as const : "MATCHES EXPECTED" as const,
  };
}

export type AlertSeverity = "critical" | "warning" | "info";
export interface OpsAlert { id: string; severity: AlertSeverity; title: string; detail: string; since: string | null; active: boolean }

interface AlertInput {
  now: Date;
  drift: ReturnType<typeof computeDrift>;
  /** Most recent first. */
  recentQuoteEvents: { event_name: string; occurred_at: string }[];
  recentRpcEvents: { event_name: string; occurred_at: string }[];
  revertsLastHour: number;
  confirmedLastHour: number;
  revertsPrevDay: number;
  confirmedPrevDay: number;
  indexingFailures: number;
  services: Record<string, ServiceStatus>;
}

/** Consecutive failures from the newest event backwards; a success ends the streak (recovery). */
export function failureStreak(events: { event_name: string }[], failure: (n: string) => boolean): number {
  let n = 0;
  for (const e of events) {
    if (failure(e.event_name)) n++;
    else break;
  }
  return n;
}

export function buildAlerts(i: AlertInput): OpsAlert[] {
  const t = i.now.toISOString();
  const alerts: OpsAlert[] = [];
  for (const d of i.drift.drift) {
    alerts.push({ id: `drift_${d.key}`, severity: "critical", title: `Router V4 configuration drift: ${d.label}`, detail: `Expected ${d.expected}, actual ${d.actual}. No automatic repair is performed.`, since: t, active: true });
  }
  const qStreak = failureStreak(i.recentQuoteEvents, (n) => n === "quote_failure" || n === "rpc_failure");
  alerts.push({ id: "quote_failures", severity: "warning", title: "Repeated quote failures", detail: `${qStreak} consecutive quote failures`, since: i.recentQuoteEvents[0]?.occurred_at ?? null, active: qStreak >= 5 });
  const rStreak = failureStreak(i.recentRpcEvents, (n) => n === "rpc_failure");
  alerts.push({ id: "rpc_failures", severity: "warning", title: "Repeated RPC failures", detail: rStreak >= 5 ? `${rStreak} consecutive RPC failures` : "Recovered — latest RPC-dependent event succeeded", since: i.recentRpcEvents[0]?.occurred_at ?? null, active: rStreak >= 5 });
  const hourRate = i.revertsLastHour / Math.max(1, i.revertsLastHour + i.confirmedLastHour);
  const dayRate = i.revertsPrevDay / Math.max(1, i.revertsPrevDay + i.confirmedPrevDay);
  alerts.push({ id: "revert_spike", severity: "warning", title: "Abnormal transaction revert increase", detail: `Last hour ${Math.round(hourRate * 100)}% vs prior day ${Math.round(dayRate * 100)}%`, since: t, active: i.revertsLastHour >= 3 && hourRate > Math.max(0.2, dayRate * 2) });
  alerts.push({ id: "indexing", severity: "warning", title: "Activity indexing failure", detail: `${i.indexingFailures} unresolved/failed activity records`, since: t, active: i.indexingFailures > 0 });
  for (const [name, s] of Object.entries(i.services)) {
    if (s === "UNAVAILABLE") alerts.push({ id: `svc_${name}`, severity: "critical", title: `${name} unavailable`, detail: "Live check failed.", since: t, active: true });
  }
  return alerts;
}
