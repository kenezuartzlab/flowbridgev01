/**
 * V8.1 — read-only decoding of the NATIVE FlowBridgeRouterV4 `SwapActivity`
 * event, which is the canonical amount evidence for SWAP_EXECUTED.
 *
 * Exact deployed signature (frozen):
 *   SwapActivity(address indexed sender, address indexed recipient,
 *                uint256 indexed routerId, address tokenIn, address tokenOut,
 *                uint256 amountIn, uint256 amountOut, uint256 protocolFee)
 *
 * `amountIn` is the SEMANTIC swap input (it excludes protocolFee) and is the
 * only value that may become `amountRaw`. This module never sends a
 * transaction and fails closed when the match is missing or ambiguous.
 */
import { decodeEventLog, parseAbi } from 'viem';
import type { Hex } from './activityIntent';
import type { RawLog, SourceReceipt } from './officialBridgeEvent';

export const SWAP_ACTIVITY_EVENT_ABI = parseAbi([
  'event SwapActivity(address indexed sender, address indexed recipient, uint256 indexed routerId, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 protocolFee)',
]);

export interface DecodedSwapActivityEvent {
  logIndex: number;
  /** Emitting contract — must be the configured FlowBridgeRouterV4. */
  emitter: Hex;
  sender: Hex;
  recipient: Hex;
  routerId: bigint;
  tokenIn: Hex;
  tokenOut: Hex;
  amountIn: bigint;
  amountOut: bigint;
  protocolFee: bigint;
}

export type SwapActivityLogDecoder = (log: RawLog) => DecodedSwapActivityEvent | null;

export const decodeSwapActivityLog: SwapActivityLogDecoder = (log) => {
  try {
    const decoded = decodeEventLog({
      abi: SWAP_ACTIVITY_EVENT_ABI,
      topics: log.topics as [Hex, ...Hex[]],
      data: log.data,
    }) as { eventName: string; args: Record<string, unknown> };
    if (decoded.eventName !== 'SwapActivity') return null;
    const a = decoded.args;
    return {
      logIndex: log.logIndex,
      emitter: log.address.toLowerCase() as Hex,
      sender: String(a['sender']).toLowerCase() as Hex,
      recipient: String(a['recipient']).toLowerCase() as Hex,
      routerId: BigInt(a['routerId'] as bigint),
      tokenIn: String(a['tokenIn']).toLowerCase() as Hex,
      tokenOut: String(a['tokenOut']).toLowerCase() as Hex,
      amountIn: BigInt(a['amountIn'] as bigint),
      amountOut: BigInt(a['amountOut'] as bigint),
      protocolFee: BigInt(a['protocolFee'] as bigint),
    };
  } catch {
    return null;
  }
};

export function decodeSwapActivityEvents(
  receipt: SourceReceipt,
  decoder: SwapActivityLogDecoder = decodeSwapActivityLog,
): DecodedSwapActivityEvent[] {
  return receipt.logs
    .map((l) => decoder(l))
    .filter((e): e is DecodedSwapActivityEvent => e !== null);
}

export interface ExpectedSwapActivity {
  /** Configured FlowBridgeRouterV4 address (server truth). */
  router: Hex;
  /** Signed intent user — must equal tx.from and event.sender. */
  sender: Hex;
  /** Approved recipient semantics (single-wallet path: the signer). */
  recipient: Hex;
  /** Live Lens-derived routerId required by the frozen config. */
  routerId: bigint;
  /** Frozen supported token-in. */
  tokenIn: Hex;
  /** Frozen supported token-out for the single approved route. */
  tokenOut: Hex;
  /** Decoded calldata swapAmount == signed intent amount. */
  amountIn: bigint;
}

export type CanonicalSwapActivitySelection =
  | { ok: true; event: DecodedSwapActivityEvent }
  | { ok: false; kind: 'none' | 'ambiguous'; reason: string };

const eq = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Exact-match every trusted predicate; 2+ candidates fail closed. */
export function selectCanonicalSwapActivityLog(
  candidates: readonly DecodedSwapActivityEvent[],
  expected: ExpectedSwapActivity,
): CanonicalSwapActivitySelection {
  const matches = candidates.filter(
    (c) =>
      eq(c.emitter, expected.router) &&
      eq(c.sender, expected.sender) &&
      eq(c.recipient, expected.recipient) &&
      c.routerId === expected.routerId &&
      eq(c.tokenIn, expected.tokenIn) &&
      eq(c.tokenOut, expected.tokenOut) &&
      c.amountIn === expected.amountIn,
  );
  if (matches.length === 0) {
    return {
      ok: false,
      kind: 'none',
      reason: 'no FlowBridgeRouterV4 SwapActivity log matched the approved path and signed intent',
    };
  }
  const unique = new Set(matches.map((m) => m.logIndex));
  if (matches.length > 1 || unique.size > 1) {
    return {
      ok: false,
      kind: 'ambiguous',
      reason: 'multiple matching SwapActivity logs — no deterministic unique match',
    };
  }
  return { ok: true, event: matches[0]! };
}
