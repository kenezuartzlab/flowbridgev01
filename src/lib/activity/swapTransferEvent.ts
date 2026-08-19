/**
 * V8 — read-only decoding of the canonical ERC-20 Transfer evidence for a
 * verified swap.
 *
 * FlowBridgeRouter v3 emits no dedicated Swap event, so the deterministic,
 * on-chain provable fact for a swap execution is the token-in Transfer log
 * `token-in: user -> router`. This module never sends a transaction and fails
 * closed when the match is missing or ambiguous.
 */
import { decodeEventLog, parseAbi } from 'viem';
import type { Hex } from './activityIntent';
import type { RawLog, SourceReceipt } from './officialBridgeEvent';

export const ERC20_TRANSFER_EVENT_ABI = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

export interface DecodedTransferEvent {
  logIndex: number;
  /** Emitting ERC-20 contract — must be the configured token-in. */
  emitter: Hex;
  from: Hex;
  to: Hex;
  value: bigint;
}

export type TransferLogDecoder = (log: RawLog) => DecodedTransferEvent | null;

export const decodeErc20TransferLog: TransferLogDecoder = (log) => {
  try {
    const decoded = decodeEventLog({
      abi: ERC20_TRANSFER_EVENT_ABI,
      topics: log.topics as [Hex, ...Hex[]],
      data: log.data,
    }) as { eventName: string; args: Record<string, unknown> };
    if (decoded.eventName !== 'Transfer') return null;
    const a = decoded.args;
    return {
      logIndex: log.logIndex,
      emitter: log.address.toLowerCase() as Hex,
      from: String(a['from']).toLowerCase() as Hex,
      to: String(a['to']).toLowerCase() as Hex,
      value: BigInt(a['value'] as bigint),
    };
  } catch {
    return null;
  }
};

export interface ExpectedSwapTransfer {
  /** Configured token-in contract (server truth). */
  token: Hex;
  /** Signed intent user — must be the token-in sender. */
  from: Hex;
  /** Configured swap execution target (FlowBridgeRouter v3). */
  to: Hex;
  /** Signed intent amount (token-in base units). */
  value: bigint;
}

export type CanonicalTransferSelection =
  | { ok: true; event: DecodedTransferEvent }
  | { ok: false; kind: 'none' | 'ambiguous'; reason: string };

const eq = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function decodeTransferEvents(
  receipt: SourceReceipt,
  decoder: TransferLogDecoder = decodeErc20TransferLog,
): DecodedTransferEvent[] {
  return receipt.logs
    .map((l) => decoder(l))
    .filter((e): e is DecodedTransferEvent => e !== null);
}

/** Exact-match every field; 2+ identical matches fail closed as ambiguous. */
export function selectCanonicalSwapTransferLog(
  candidates: readonly DecodedTransferEvent[],
  expected: ExpectedSwapTransfer,
): CanonicalTransferSelection {
  const matches = candidates.filter(
    (c) =>
      eq(c.emitter, expected.token) &&
      eq(c.from, expected.from) &&
      eq(c.to, expected.to) &&
      c.value === expected.value,
  );
  if (matches.length === 0) {
    return {
      ok: false,
      kind: 'none',
      reason: 'no token-in transfer to the configured swap router matched the signed intent',
    };
  }
  const unique = new Set(matches.map((m) => m.logIndex));
  if (matches.length > 1 || unique.size > 1) {
    return {
      ok: false,
      kind: 'ambiguous',
      reason: 'multiple matching token-in transfer logs — no deterministic unique match',
    };
  }
  return { ok: true, event: matches[0]! };
}
