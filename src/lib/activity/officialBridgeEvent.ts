/**
 * Phase A2 — read-only decoding of the OFFICIAL source bridge deposit event.
 *
 * This module never sends a transaction. It only turns raw receipt logs into a
 * decoded candidate set and then selects ONE canonical event, failing closed
 * when the match is ambiguous.
 */
import { decodeEventLog, parseAbi } from 'viem';
import type { Hex } from './activityIntent';

/** Smallest read-only event ABI needed to verify an official source deposit. */
export const OFFICIAL_BRIDGE_EVENT_ABI = parseAbi([
  'event DepositEvent(address indexed depositer, address indexed recipient, uint256 indexed amount, uint256 receiveAmount, address tokenAddress, uint256 depositNonce, uint256 destinationChainId)',
]);

export interface RawLog {
  address: string;
  topics: readonly Hex[];
  data: Hex;
  logIndex: number;
}

export interface SourceReceipt {
  status: 'success' | 'reverted';
  /** Block timestamp of the source transaction, unix seconds. */
  blockTimestamp: number;
  logs: readonly RawLog[];
}

export interface DecodedDepositEvent {
  logIndex: number;
  /** Emitting contract — must be the official gateway. */
  emitter: Hex;
  depositor: Hex;
  recipient: Hex;
  destinationChainId: bigint;
  amount: bigint;
  /** Present only when the official event exposes the source token. */
  token?: Hex;
}

export type DepositLogDecoder = (log: RawLog) => DecodedDepositEvent | null;

/** Default decoder: viem-based, tolerant of unrelated logs in the receipt. */
export const decodeOfficialDepositLog: DepositLogDecoder = (log) => {
  try {
    const decoded = decodeEventLog({
      abi: OFFICIAL_BRIDGE_EVENT_ABI,
      topics: log.topics as [Hex, ...Hex[]],
      data: log.data,
    }) as { eventName: string; args: Record<string, unknown> };
    if (decoded.eventName !== 'Deposit') return null;
    const a = decoded.args;
    return {
      logIndex: log.logIndex,
      emitter: log.address.toLowerCase() as Hex,
      depositor: String(a['depositor']).toLowerCase() as Hex,
      recipient: String(a['recipient']).toLowerCase() as Hex,
      destinationChainId: BigInt(a['destinationChainId'] as bigint),
      amount: BigInt(a['amount'] as bigint),
      token: a['token'] ? (String(a['token']).toLowerCase() as Hex) : undefined,
    };
  } catch {
    return null;
  }
};

export interface ExpectedDeposit {
  gateway: Hex;
  depositor: Hex;
  recipient: Hex;
  destinationChainId: bigint;
  amount: bigint;
  /** Configured route source token; only compared when the event exposes it. */
  token: Hex;
}

export type CanonicalLogSelection =
  | { ok: true; event: DecodedDepositEvent }
  | { ok: false; kind: 'none' | 'ambiguous'; reason: string };

const eq = (a?: string, b?: string) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Exact-match every field; ambiguity (2+ identical matches) fails closed. */
export function selectCanonicalDepositLog(
  candidates: readonly DecodedDepositEvent[],
  expected: ExpectedDeposit,
): CanonicalLogSelection {
  const matches = candidates.filter(
    (c) =>
      eq(c.emitter, expected.gateway) &&
      eq(c.depositor, expected.depositor) &&
      eq(c.recipient, expected.recipient) &&
      c.destinationChainId === expected.destinationChainId &&
      c.amount === expected.amount &&
      (c.token === undefined || eq(c.token, expected.token)),
  );
  if (matches.length === 0) {
    return { ok: false, kind: 'none', reason: 'no official deposit event matched the signed intent' };
  }
  const unique = new Set(matches.map((m) => m.logIndex));
  if (matches.length > 1 || unique.size > 1) {
    return {
      ok: false,
      kind: 'ambiguous',
      reason: 'multiple matching official deposit logs — no deterministic unique match',
    };
  }
  return { ok: true, event: matches[0]! };
}

export function decodeDepositEvents(
  receipt: SourceReceipt,
  decoder: DepositLogDecoder = decodeOfficialDepositLog,
): DecodedDepositEvent[] {
  return receipt.logs
    .map((l) => decoder(l))
    .filter((e): e is DecodedDepositEvent => e !== null);
}
