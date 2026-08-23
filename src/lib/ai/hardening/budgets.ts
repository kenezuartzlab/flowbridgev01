/**
 * FlowBridge V24 §8 — bounded reliability/latency budgets per intelligence
 * surface, plus a stage timer so a slow external provider, a slow canonical RPC
 * read and slow model synthesis are distinguishable in telemetry.
 *
 * Budgets bound work; they never bypass safety revalidation. A surface that runs
 * out of budget degrades (fewer sources, honest status) — it never guesses.
 */
export const INTELLIGENCE_SURFACES = [
  "DECISION",
  "DELIBERATION",
  "SCENARIO",
  "FEDERATED_INSIGHT",
  "ASSISTANT",
] as const;

export type IntelligenceSurface = (typeof INTELLIGENCE_SURFACES)[number];

export interface SurfaceBudget {
  /** Hard server budget for the whole request. */
  serverTimeoutMs: number;
  /** Max parallel external skill calls. */
  maxExternalFanOut: number;
  /** Network-class retries per external call. */
  maxRetriesPerCall: number;
  /** How far the surface may fall back before it reports a status instead. */
  maxDegradedFallback: "CANONICAL_ONLY" | "READ_ONLY_EXPLANATION" | "NONE";
}

export const SURFACE_BUDGETS: Record<IntelligenceSurface, SurfaceBudget> = {
  DECISION: {
    serverTimeoutMs: 8_000,
    maxExternalFanOut: 0,
    maxRetriesPerCall: 0,
    maxDegradedFallback: "CANONICAL_ONLY",
  },
  DELIBERATION: {
    serverTimeoutMs: 6_000,
    maxExternalFanOut: 3,
    maxRetriesPerCall: 1,
    maxDegradedFallback: "CANONICAL_ONLY",
  },
  SCENARIO: {
    serverTimeoutMs: 8_000,
    maxExternalFanOut: 0,
    maxRetriesPerCall: 0,
    maxDegradedFallback: "READ_ONLY_EXPLANATION",
  },
  FEDERATED_INSIGHT: {
    serverTimeoutMs: 6_000,
    maxExternalFanOut: 2,
    maxRetriesPerCall: 1,
    maxDegradedFallback: "CANONICAL_ONLY",
  },
  ASSISTANT: {
    serverTimeoutMs: 20_000,
    maxExternalFanOut: 2,
    maxRetriesPerCall: 1,
    maxDegradedFallback: "READ_ONLY_EXPLANATION",
  },
};

export type LatencyStage =
  | "AUTH"
  | "CANONICAL_READ"
  | "CHAIN_READ"
  | "EXTERNAL_SKILL"
  | "MODEL_SYNTHESIS"
  | "ENGINE"
  | "TOTAL";

export interface StageTimer {
  start(stage: LatencyStage): () => void;
  /** Wrap a promise and record its stage duration even when it rejects. */
  measure<T>(stage: LatencyStage, run: () => Promise<T>): Promise<T>;
  stages(): Record<string, number>;
  overBudget(): boolean;
  elapsedMs(): number;
}

export function createStageTimer(
  surface: IntelligenceSurface,
  now: () => number = () => Date.now(),
): StageTimer {
  const startedAt = now();
  const budget = SURFACE_BUDGETS[surface].serverTimeoutMs;
  const totals: Record<string, number> = {};

  const record = (stage: LatencyStage, ms: number) => {
    totals[stage] = (totals[stage] ?? 0) + Math.max(0, Math.round(ms));
  };

  return {
    start(stage) {
      const t0 = now();
      return () => record(stage, now() - t0);
    },
    async measure(stage, run) {
      const t0 = now();
      try {
        return await run();
      } finally {
        record(stage, now() - t0);
      }
    },
    stages() {
      return { ...totals, TOTAL: Math.max(0, Math.round(now() - startedAt)) };
    },
    overBudget() {
      return now() - startedAt > budget;
    },
    elapsedMs() {
      return Math.max(0, Math.round(now() - startedAt));
    },
  };
}
