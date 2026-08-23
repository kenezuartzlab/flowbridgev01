/**
 * FlowBridge V23 §7 — bounded planning-input sanitization (PURE).
 *
 * The client may express a comparison preference. It may NEVER supply canonical
 * economics: contract targets, calldata, fees, balances, allowances, chain facts
 * or reward entitlements. Anything of that shape is dropped and reported.
 *
 * A planning input is not transaction authorization: it can only change preview
 * outputs. V17/V18 re-resolve every executable value from canonical state.
 */
import { EMPTY_PLANNING_INPUTS, type ScenarioPlanningInputs } from "./scenarioTypes";

/** Only these keys are ever read from client input. */
const ALLOWED_KEYS = new Set(["stakePercent", "previewStakeFlow"]);

const ALLOWED_PERCENTS = [25, 50, 100] as const;

/** Upper bound so a preview input cannot be used to smuggle absurd values. */
const MAX_PREVIEW_FLOW = 1_000_000;

export function sanitizePlanningInputs(
  raw: Record<string, unknown> | null | undefined,
  options?: { memoryPrefersHalf?: boolean; memoryOptedIn?: boolean },
): ScenarioPlanningInputs {
  const rejected: string[] = [];
  let stakePercent: 25 | 50 | 100 | null = null;
  let previewStakeFlow: number | null = null;

  for (const [key, value] of Object.entries(raw ?? {})) {
    if (!ALLOWED_KEYS.has(key)) {
      rejected.push(key);
      continue;
    }
    if (key === "stakePercent") {
      const n = Number(value);
      if ((ALLOWED_PERCENTS as readonly number[]).includes(n)) {
        stakePercent = n as 25 | 50 | 100;
      } else {
        rejected.push(key);
      }
      continue;
    }
    const n = Number(value);
    if (Number.isFinite(n) && n > 0 && n <= MAX_PREVIEW_FLOW) {
      previewStakeFlow = Math.floor(n);
    } else {
      rejected.push(key);
    }
  }

  /**
   * §7 — a remembered "stake half" may PRE-SELECT a comparison option only when
   * memory is opted in, and only when the user did not choose a percent. It is
   * still never an authorization and never an amount.
   */
  let preSelectedFromMemory = false;
  if (stakePercent === null && options?.memoryOptedIn && options?.memoryPrefersHalf) {
    stakePercent = 50;
    preSelectedFromMemory = true;
  }

  if (stakePercent === null && previewStakeFlow === null && rejected.length === 0) {
    return EMPTY_PLANNING_INPUTS;
  }

  return {
    stakePercent,
    previewStakeFlow,
    preSelectedFromMemory,
    rejectedClientFields: rejected,
  };
}

/** Memory shape signal only: "stake half" / "half of my rewards". No amounts. */
export function memoryPrefersHalf(
  entries: readonly { key: string; value: string }[],
): boolean {
  return entries.some((e) => /\bhalf\b/i.test(`${e.key ?? ""} ${e.value ?? ""}`));
}
