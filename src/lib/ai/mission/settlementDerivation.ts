/**
 * FlowBridge V17.1 §4 — deterministic derivation of a later step's economics
 * from the CANONICAL settlement of an earlier step.
 *
 * Rules encoded here:
 *  - Integer base-unit arithmetic only. No floats, no rounding surprises:
 *    derivedWei = floor(actualWei * ratioPercent / 100).
 *  - Every derived amount carries provenance back to the exact settlement
 *    identity it came from (verified activity id or on-chain claim identity).
 *  - A prepared (pre-settlement) estimate may NEVER be used as the source.
 *
 * Pure module: no network, no DB, no authority.
 */

export const DERIVATION_VERSION = "flowbridge.mission.derivation/1" as const;

/** Exact decimal string → base units. Throws on anything non-numeric. */
export function parseUnitsExact(amount: string, decimals: number): bigint {
  const trimmed = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error("INVALID_AMOUNT");
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > decimals) {
    // Excess precision is truncated, never rounded up.
    return BigInt(whole + frac.slice(0, decimals));
  }
  return BigInt(whole + frac.padEnd(decimals, "0"));
}

/** Base units → exact decimal string (no trailing zeros, no exponent form). */
export function formatUnitsExact(raw: bigint, decimals: number): string {
  const neg = raw < 0n;
  const digits = (neg ? -raw : raw).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const frac = decimals > 0 ? digits.slice(digits.length - decimals).replace(/0+$/, "") : "";
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

export type SettlementSourceKind = "VERIFIED_ACTIVITY" | "ON_CHAIN_CLAIM" | "ON_CHAIN_POSITION";

/** §4 — provenance persisted alongside every derived economic input. */
export interface DerivationProvenance {
  calculationVersion: typeof DERIVATION_VERSION;
  /** The step whose canonical settlement produced the source amount. */
  sourceStepId: string;
  sourceKind: SettlementSourceKind;
  /** Canonical settlement identity (activity id, or `claimed:<addr>@<block>`). */
  sourceIdentity: string;
  /** Actual settled amount in base units, exactly as read from canon. */
  actualWei: string;
  decimals: number;
  ratioPercent: number;
  derivedWei: string;
  derivedAmount: string;
  derivedAt: string;
}

export interface DeriveInput {
  actualWei: bigint;
  decimals: number;
  /** 1..100. Absent/nullish means "all of it" (100). */
  ratioPercent?: number | null;
  sourceStepId: string;
  sourceKind: SettlementSourceKind;
  sourceIdentity: string;
  now?: Date;
}

export interface Derivation {
  derivedWei: bigint;
  /** Exact decimal string, safe to hand to the ActionIntent pipeline. */
  derivedAmount: string;
  provenance: DerivationProvenance;
}

/**
 * floor(actualWei * ratio / 100) with integer arithmetic, plus provenance.
 * If the actual claim is 50 FLOW and ratio is 50, the result is exactly 25 FLOW.
 */
export function deriveFromSettlement(input: DeriveInput): Derivation {
  if (input.actualWei < 0n) throw new Error("INVALID_SETTLEMENT_AMOUNT");
  const ratio =
    input.ratioPercent == null ? 100 : Math.floor(Number(input.ratioPercent));
  if (!Number.isInteger(ratio) || ratio <= 0 || ratio > 100) throw new Error("INVALID_RATIO");
  const derivedWei = (input.actualWei * BigInt(ratio)) / 100n;
  const derivedAmount = formatUnitsExact(derivedWei, input.decimals);
  return {
    derivedWei,
    derivedAmount,
    provenance: {
      calculationVersion: DERIVATION_VERSION,
      sourceStepId: input.sourceStepId,
      sourceKind: input.sourceKind,
      sourceIdentity: input.sourceIdentity,
      actualWei: input.actualWei.toString(),
      decimals: input.decimals,
      ratioPercent: ratio,
      derivedWei: derivedWei.toString(),
      derivedAmount,
      derivedAt: (input.now ?? new Date()).toISOString(),
    },
  };
}

/** §4 — a derived stake must still clear the vault minimum. */
export function meetsMinimum(derivedWei: bigint, minStakeWei: bigint | null): boolean {
  if (minStakeWei == null) return true;
  return derivedWei >= minStakeWei;
}
