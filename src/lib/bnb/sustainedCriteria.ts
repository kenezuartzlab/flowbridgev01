/**
 * V1.3 sustained-observation and token-safety evaluation. Pure and browser-safe:
 * PROPOSED thresholds only — never execution approval, economics or fee policy.
 */
export const PROPOSED_SUSTAINED = {
  minDistinctBlocks: 5, minSpanSeconds: 30, maxMidDriftBps: 150, maxRoundTripLossBps: 100,
  maxMarginalImpactBps: 100, maxTicksCrossed: 10, maxGas: 1_000_000,
} as const;

export interface SustainedSample {
  blockNumber: number; blockHash: string; peerBlockHash: string | null; blockTime: string;
  codeHashes: Record<string, string>; liquidity: string; tick: number; unlocked: boolean;
  /** USDT per unit of the non-USDT token from the smallest buy quote. */
  smallRate: number; largeRate: number; roundTripLossBps: number; maxTicks: number; maxGas: number;
  finalHashRechecked: boolean;
}
export type CriterionState = "PASS" | "FAIL" | "UNKNOWN";
export interface Criterion { id: string; state: CriterionState; detail: string }

const bps = (a: number, b: number) => Math.abs(a / b - 1) * 10_000;

export function evaluateSustained(samples: readonly SustainedSample[]): { overall: CriterionState; criteria: Criterion[] } {
  const c: Criterion[] = [];
  const P = PROPOSED_SUSTAINED;
  const blocks = new Set(samples.map((s) => s.blockNumber));
  c.push({ id: "distinct-blocks", state: blocks.size >= P.minDistinctBlocks && blocks.size === samples.length ? "PASS" : samples.length ? "FAIL" : "UNKNOWN", detail: `${blocks.size} distinct of ${samples.length}` });
  const times = samples.map((s) => Date.parse(s.blockTime)).filter(Number.isFinite);
  const span = times.length ? (Math.max(...times) - Math.min(...times)) / 1000 : 0;
  c.push({ id: "time-span", state: !samples.length ? "UNKNOWN" : span >= P.minSpanSeconds ? "PASS" : "FAIL", detail: `${span}s` });
  const peer = samples.every((s) => s.peerBlockHash === s.blockHash && s.finalHashRechecked);
  c.push({ id: "peer-hash-and-reorg", state: !samples.length ? "UNKNOWN" : samples.some((s) => s.peerBlockHash === null) ? "UNKNOWN" : peer ? "PASS" : "FAIL", detail: "same-operator endpoints; not an independent quorum" });
  const first = samples[0];
  const codeStable = !!first && samples.every((s) => JSON.stringify(s.codeHashes) === JSON.stringify(first.codeHashes));
  c.push({ id: "code-identity-stable", state: !first ? "UNKNOWN" : codeStable ? "PASS" : "FAIL", detail: "bytecode hashes identical across samples" });
  c.push({ id: "liquidity-unlocked", state: !first ? "UNKNOWN" : samples.every((s) => s.unlocked && BigInt(s.liquidity) > 0n) ? "PASS" : "FAIL", detail: "active liquidity > 0 and unlocked" });
  const rates = samples.map((s) => s.smallRate).filter((r) => r > 0);
  const drift = rates.length > 1 ? bps(Math.max(...rates), Math.min(...rates)) : NaN;
  c.push({ id: "mid-drift", state: rates.length < 2 ? "UNKNOWN" : drift <= P.maxMidDriftBps ? "PASS" : "FAIL", detail: `${Number.isNaN(drift) ? "n/a" : drift.toFixed(2)} bps` });
  const worst = (f: (s: SustainedSample) => number) => (samples.length ? Math.max(...samples.map(f)) : NaN);
  const rt = worst((s) => s.roundTripLossBps), mi = worst((s) => bps(s.smallRate, s.largeRate)), tk = worst((s) => s.maxTicks), gas = worst((s) => s.maxGas);
  c.push({ id: "round-trip-loss", state: !samples.length ? "UNKNOWN" : rt >= 0 && rt <= P.maxRoundTripLossBps ? "PASS" : "FAIL", detail: `${rt.toFixed?.(2)} bps worst` });
  c.push({ id: "marginal-impact", state: !samples.length ? "UNKNOWN" : mi <= P.maxMarginalImpactBps ? "PASS" : "FAIL", detail: `${mi.toFixed?.(2)} bps small vs large` });
  c.push({ id: "ticks-gas", state: !samples.length ? "UNKNOWN" : tk <= P.maxTicksCrossed && gas <= P.maxGas ? "PASS" : "FAIL", detail: `ticks ${tk}, gas ${gas}` });
  const overall: CriterionState = c.some((x) => x.state === "FAIL") ? "FAIL" : c.some((x) => x.state === "UNKNOWN") ? "UNKNOWN" : "PASS";
  return { overall, criteria: c };
}

/** Token capability facts; `null` means not provable by the read-only collector. */
export interface TokenSafetyFacts {
  codePresent: boolean; eip1967Implementation: string | null; eip1967Admin: string | null;
  pausedNow: boolean | null; owner: string | null;
  /** Function selectors found in deployed bytecode (heuristic, not semantic proof). */
  capabilitySelectors: readonly string[]; verifiedSourceReviewed: boolean; legalReviewed: boolean;
}
export type TokenSafetyState = "BLOCKED" | "RESTRICTED_REVIEW_REQUIRED" | "UNKNOWN";

/** Never returns an "approved" state: the best outcome is review-required. */
export function classifyTokenSafety(f: TokenSafetyFacts): { state: TokenSafetyState; reasons: string[] } {
  const r: string[] = [];
  if (!f.codePresent) return { state: "BLOCKED", reasons: ["no-code"] };
  if (f.pausedNow === true) return { state: "BLOCKED", reasons: ["paused"] };
  const zero = /^0x0{40}$/i;
  if (f.eip1967Implementation && !zero.test(f.eip1967Implementation)) r.push("upgradeable-proxy");
  if (f.owner && !zero.test(f.owner)) r.push("privileged-owner");
  if (f.capabilitySelectors.length) r.push(`capability-selectors:${[...f.capabilitySelectors].sort().join(",")}`);
  if (f.pausedNow === null) r.push("pause-state-unknown");
  if (!f.verifiedSourceReviewed) r.push("verified-source-not-reviewed");
  if (!f.legalReviewed) r.push("legal-not-reviewed");
  return { state: !f.verifiedSourceReviewed ? "UNKNOWN" : "RESTRICTED_REVIEW_REQUIRED", reasons: r };
}
