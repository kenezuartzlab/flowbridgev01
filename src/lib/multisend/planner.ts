/**
 * FlowBridge MultiSend V1 — planner and fee/MAX math.
 *
 * Ported from the audited V1 package planner and extended with the native gas
 * reserve rule. Every percentage / MAX expression must be resolved to exact
 * base-unit amounts here before Review and before any wallet confirmation.
 */
import type {
  MultiSendMode,
  MultiSendPlan,
  SourceExecutionPlan,
  TransferRow,
} from "./types";

const BPS_DENOMINATOR = 10_000n;
export const MAX_FEE_BPS = 100;
export const DEFAULT_FEE_BPS = 1;
export const HARD_MAX_RECIPIENTS = 500;

/** Native units kept back so a MAX send never drains the gas balance to zero. */
export const NATIVE_GAS_RESERVE_WEI = 2_000_000_000_000_000n; // 0.002 native

export function quoteFee(amount: bigint, feeBps: number): bigint {
  assertFeeBps(feeBps);
  if (amount < 0n) throw new Error("Amount cannot be negative");
  return (amount * BigInt(feeBps)) / BPS_DENOMINATOR;
}

export function quoteRequiredSpend(recipientsTotal: bigint, feeBps: number): bigint {
  return recipientsTotal + quoteFee(recipientsTotal, feeBps);
}

/**
 * Largest recipient total that fits inside a balance once the FlowBridge fee is
 * added. For native assets pass the balance already reduced by the gas reserve.
 */
export function quoteMaxRecipientsTotal(availableBalance: bigint, feeBps: number): bigint {
  assertFeeBps(feeBps);
  if (availableBalance <= 0n) return 0n;
  if (feeBps === 0) return availableBalance;

  const f = BigInt(feeBps);
  let candidate = (availableBalance * BPS_DENOMINATOR) / (BPS_DENOMINATOR + f);
  while (quoteRequiredSpend(candidate + 1n, feeBps) <= availableBalance) candidate += 1n;
  while (candidate > 0n && quoteRequiredSpend(candidate, feeBps) > availableBalance) candidate -= 1n;
  return candidate;
}

/** Spendable balance for MAX, honouring the protected native gas reserve. */
export function spendableBalance(args: {
  balance: bigint;
  isNative: boolean;
  gasReserve?: bigint;
}): bigint {
  if (!args.isNative) return args.balance > 0n ? args.balance : 0n;
  const reserve = args.gasReserve ?? NATIVE_GAS_RESERVE_WEI;
  const left = args.balance - reserve;
  return left > 0n ? left : 0n;
}

/** Exact recipient total for a percentage of a source balance (25/50/75/100). */
export function quotePercentRecipientsTotal(args: {
  balance: bigint;
  isNative: boolean;
  feeBps: number;
  percent: number;
  gasReserve?: bigint;
}): bigint {
  if (!Number.isFinite(args.percent) || args.percent <= 0 || args.percent > 100) {
    throw new Error("percent must be between 1 and 100");
  }
  const spendable = spendableBalance(args);
  const slice = (spendable * BigInt(Math.floor(args.percent))) / 100n;
  return quoteMaxRecipientsTotal(slice, args.feeBps);
}

/** Split a total into n exact parts; remainder base units go to the first rows. */
export function equalSplit(total: bigint, parts: number): bigint[] {
  if (!Number.isInteger(parts) || parts < 1) throw new Error("parts must be a positive integer");
  if (total <= 0n) throw new Error("Total must be greater than zero");
  const n = BigInt(parts);
  const base = total / n;
  let remainder = total - base * n;
  if (base === 0n) throw new Error("Total is too small to split across every recipient");
  return Array.from({ length: parts }, () => {
    if (remainder > 0n) {
      remainder -= 1n;
      return base + 1n;
    }
    return base;
  });
}

export function buildMultiSendPlan(args: {
  mode: MultiSendMode;
  clientBatchId: `0x${string}`;
  rows: TransferRow[];
  feeBps: number;
  maxRecipientsPerSource: number;
}): MultiSendPlan {
  const { mode, clientBatchId, rows, feeBps, maxRecipientsPerSource } = args;
  assertFeeBps(feeBps);
  if (!Number.isInteger(maxRecipientsPerSource) || maxRecipientsPerSource < 1) {
    throw new Error("maxRecipientsPerSource must be a positive integer");
  }
  if (rows.length === 0) throw new Error("At least one transfer is required");

  validateModeShape(mode, rows);

  const groups = new Map<string, TransferRow[]>();
  for (const row of rows) {
    if (row.amount <= 0n) throw new Error(`Transfer ${row.id} must be greater than zero`);
    if (row.source.toLowerCase() === row.recipient.toLowerCase()) {
      throw new Error(`Transfer ${row.id} sends back to its source wallet`);
    }
    const key = row.source.toLowerCase();
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const sources: SourceExecutionPlan[] = [];
  let recipientsTotal = 0n;
  let serviceFeeTotal = 0n;

  for (const group of groups.values()) {
    if (group.length > maxRecipientsPerSource) {
      throw new Error(`Source ${group[0].source} exceeds ${maxRecipientsPerSource} recipients`);
    }
    const sourceTotal = group.reduce((sum, row) => sum + row.amount, 0n);
    const fee = quoteFee(sourceTotal, feeBps);
    sources.push({
      source: group[0].source,
      recipients: group.map((row) => row.recipient),
      amounts: group.map((row) => row.amount),
      recipientsTotal: sourceTotal,
      serviceFee: fee,
      requiredAssetSpend: sourceTotal + fee,
      transactionCount: 1,
    });
    recipientsTotal += sourceTotal;
    serviceFeeTotal += fee;
  }

  return {
    mode,
    clientBatchId,
    feeBps,
    sources,
    recipientsTotal,
    serviceFeeTotal,
    sourceWalletCount: sources.length,
    transferRowCount: rows.length,
    destinationWalletCount: new Set(rows.map((r) => r.recipient.toLowerCase())).size,
  };
}

function validateModeShape(mode: MultiSendMode, rows: TransferRow[]): void {
  const sourceSet = new Set(rows.map((row) => row.source.toLowerCase()));
  const recipientSet = new Set(rows.map((row) => row.recipient.toLowerCase()));

  if (mode === "one-to-many" && sourceSet.size !== 1) {
    throw new Error("Distribute requires exactly one source wallet");
  }
  if (mode === "many-to-one" && recipientSet.size !== 1) {
    throw new Error("Consolidate requires exactly one destination wallet");
  }
  if (mode === "many-to-many" && (sourceSet.size < 1 || recipientSet.size < 1)) {
    throw new Error("Advanced requires source and destination wallets");
  }
}

function assertFeeBps(feeBps: number): void {
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > MAX_FEE_BPS) {
    throw new Error("feeBps must be an integer from 0 to 100");
  }
}

/** Blocking validation for one source group against its live balances. */
export function validateSourceAffordability(args: {
  plan: SourceExecutionPlan;
  isNative: boolean;
  assetBalance: bigint;
  nativeBalance: bigint;
  gasReserve?: bigint;
}): { ok: true } | { ok: false; reason: string } {
  const reserve = args.gasReserve ?? NATIVE_GAS_RESERVE_WEI;
  if (args.isNative) {
    if (args.plan.requiredAssetSpend + reserve > args.assetBalance) {
      return { ok: false, reason: "Not enough balance for the transfers, fee and protected gas reserve." };
    }
    return { ok: true };
  }
  if (args.plan.requiredAssetSpend > args.assetBalance) {
    return { ok: false, reason: "Not enough token balance for the transfers plus the FlowBridge fee." };
  }
  if (args.nativeBalance <= 0n) {
    return { ok: false, reason: "This wallet has no network gas to submit the transaction." };
  }
  return { ok: true };
}
