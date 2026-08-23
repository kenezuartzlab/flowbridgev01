/**
 * FlowBridge V24 §2 — the one versioned intelligence evaluation harness.
 *
 * It covers V15 → V23 with deterministic fixtures and (in acceptance runs)
 * production read-only canaries. Two classes of check exist and they are NOT
 * interchangeable:
 *
 *  - AUTHORITY  : a security/authority invariant. A failure is a HARD BLOCK.
 *  - QUALITY    : a product-quality expectation. A failure may DEGRADE only.
 *
 * Every record keeps the input fixture/snapshot id, the expected invariant, the
 * actual result, the component versions and a pass/fail reason. Model
 * chain-of-thought is never stored — only typed reasons and observable output.
 */
import { EVAL_SUITE_VERSION, componentVersions } from "./foundationVersions";

export type EvalClass = "AUTHORITY" | "QUALITY";

export type EvalLayer =
  | "V15_EVIDENCE"
  | "V16_OPPORTUNITY"
  | "V17_MISSION"
  | "V18_COMPILER"
  | "V19_FEDERATION"
  | "V20_RECONCILIATION"
  | "V21_DELIBERATION"
  | "V22_PERSONALIZATION"
  | "V23_SCENARIO"
  | "V24_HARDENING";

export interface EvalCase<T = unknown> {
  id: string;
  layer: EvalLayer;
  evalClass: EvalClass;
  /** Fixture or canonical snapshot identity the case ran against. */
  fixtureId: string;
  /** The invariant in one line, as it appears in the acceptance report. */
  expected: string;
  run: () => T | Promise<T>;
  /** Returns null when satisfied, or the failure reason. */
  check: (actual: T) => string | null;
}

export interface EvalRecord {
  id: string;
  layer: EvalLayer;
  evalClass: EvalClass;
  fixtureId: string;
  expected: string;
  actual: string;
  passed: boolean;
  reason: string | null;
  suiteVersion: string;
  versions: Record<string, string>;
  durationMs: number;
}

export interface EvalReport {
  suiteVersion: typeof EVAL_SUITE_VERSION;
  versions: Record<string, string>;
  records: readonly EvalRecord[];
  total: number;
  passed: number;
  failed: number;
  /** Any failed AUTHORITY case. A hard block on release (§15). */
  authorityViolations: readonly EvalRecord[];
  /** Failed QUALITY cases — may degrade, never a silent authority bypass. */
  qualityRegressions: readonly EvalRecord[];
  verdict: "PASS" | "DEGRADED" | "BLOCKED";
}

/** Compact, redaction-safe rendering of an observed value. */
function describe(actual: unknown): string {
  if (actual === null || actual === undefined) return String(actual);
  if (typeof actual === "object") {
    const json = JSON.stringify(actual);
    return json.length > 400 ? `${json.slice(0, 400)}…` : json;
  }
  return String(actual).slice(0, 400);
}

export async function runEvalSuite(cases: readonly EvalCase<any>[]): Promise<EvalReport> {
  const versions = { ...componentVersions() } as Record<string, string>;
  const records: EvalRecord[] = [];

  for (const c of cases) {
    const t0 = Date.now();
    let actual: unknown;
    let reason: string | null;
    try {
      actual = await c.run();
      reason = c.check(actual);
    } catch (e: any) {
      actual = `threw: ${e?.message ?? "unknown error"}`;
      reason = `case threw instead of returning a result: ${e?.message ?? "unknown error"}`;
    }
    records.push({
      id: c.id,
      layer: c.layer,
      evalClass: c.evalClass,
      fixtureId: c.fixtureId,
      expected: c.expected,
      actual: describe(actual),
      passed: reason === null,
      reason,
      suiteVersion: EVAL_SUITE_VERSION,
      versions,
      durationMs: Date.now() - t0,
    });
  }

  const failed = records.filter((r) => !r.passed);
  const authorityViolations = failed.filter((r) => r.evalClass === "AUTHORITY");
  const qualityRegressions = failed.filter((r) => r.evalClass === "QUALITY");

  return {
    suiteVersion: EVAL_SUITE_VERSION,
    versions,
    records,
    total: records.length,
    passed: records.length - failed.length,
    failed: failed.length,
    authorityViolations,
    qualityRegressions,
    verdict:
      authorityViolations.length > 0 ? "BLOCKED" : qualityRegressions.length > 0 ? "DEGRADED" : "PASS",
  };
}
