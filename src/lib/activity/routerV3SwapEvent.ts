/**
 * V30.2B P2B — read-only decoding of the LIVE BOT Mainnet FlowBridgeRouter v3
 * `SwapExecuted` event. This is evidence verification only: nothing here
 * promotes a route, changes execution configuration or sends a transaction.
 *
 * Exact deployed signature (taken from the publicly verified Router v3 source
 * at 0x986962de6F00D0eC571b1a34Fa70AEeB445b5445, NOT from Router V4):
 *
 *   SwapExecuted(uint256 indexed routerId, address indexed tokenIn,
 *                address indexed tokenOut, address sender, address recipient,
 *                uint256 swapAmount, uint256 amountOut, uint256 fee)
 *
 * `swapAmount` is the canonical on-chain input amount and the only value that
 * may become `amountRaw`. Selection fails closed when no log matches or when
 * more than one candidate log matches.
 */
import { decodeEventLog, parseAbi, keccak256, toBytes } from 'viem';
import type { Hex } from './activityIntent';
import type { RawLog, SourceReceipt } from './officialBridgeEvent';

export const ROUTER_V3_SWAP_EXECUTED_ABI = parseAbi([
  'event SwapExecuted(uint256 indexed routerId, address indexed tokenIn, address indexed tokenOut, address sender, address recipient, uint256 swapAmount, uint256 amountOut, uint256 fee)',
]);

/** topic0 of the frozen deployed signature. */
export const ROUTER_V3_SWAP_EXECUTED_SIGNATURE =
  'SwapExecuted(uint256,address,address,address,address,uint256,uint256,uint256)' as const;
export const ROUTER_V3_SWAP_EXECUTED_TOPIC: Hex = keccak256(
  toBytes(ROUTER_V3_SWAP_EXECUTED_SIGNATURE),
);

export interface DecodedRouterV3Swap {
  logIndex: number;
  /** Emitting contract — must be the configured live Router v3. */
  emitter: Hex;
  routerId: bigint;
  tokenIn: Hex;
  tokenOut: Hex;
  sender: Hex;
  recipient: Hex;
  swapAmount: bigint;
  amountOut: bigint;
  fee: bigint;
}

export type RouterV3SwapDecoder = (log: RawLog) => DecodedRouterV3Swap | null;

export const decodeRouterV3SwapLog: RouterV3SwapDecoder = (log) => {
  try {
    if ((log.topics?.[0] ?? '').toLowerCase() !== ROUTER_V3_SWAP_EXECUTED_TOPIC.toLowerCase()) {
      return null;
    }
    const decoded = decodeEventLog({
      abi: ROUTER_V3_SWAP_EXECUTED_ABI,
      topics: log.topics as [Hex, ...Hex[]],
      data: log.data,
    }) as { eventName: string; args: Record<string, unknown> };
    if (decoded.eventName !== 'SwapExecuted') return null;
    const a = decoded.args;
    return {
      logIndex: log.logIndex,
      emitter: log.address.toLowerCase() as Hex,
      routerId: BigInt(a['routerId'] as bigint),
      tokenIn: String(a['tokenIn']).toLowerCase() as Hex,
      tokenOut: String(a['tokenOut']).toLowerCase() as Hex,
      sender: String(a['sender']).toLowerCase() as Hex,
      recipient: String(a['recipient']).toLowerCase() as Hex,
      swapAmount: BigInt(a['swapAmount'] as bigint),
      amountOut: BigInt(a['amountOut'] as bigint),
      fee: BigInt(a['fee'] as bigint),
    };
  } catch {
    return null;
  }
};

export function decodeRouterV3Swaps(
  receipt: SourceReceipt,
  decoder: RouterV3SwapDecoder = decodeRouterV3SwapLog,
): DecodedRouterV3Swap[] {
  return receipt.logs
    .map((l) => decoder(l))
    .filter((e): e is DecodedRouterV3Swap => e !== null);
}

export interface ExpectedRouterV3Swap {
  /** Server-owned live Router v3 address. */
  router: Hex;
  /** Actor proven by the transaction sender. */
  sender: Hex;
  /** Approved recipient semantics (single-wallet path: the actor). */
  recipient: Hex;
}

export type RouterV3SwapSelection =
  | { ok: true; event: DecodedRouterV3Swap }
  | { ok: false; kind: 'missing' | 'ambiguous'; reason: string };

/**
 * Selects the ONE canonical Router v3 swap log. Wrong emitter, wrong actor,
 * zero amount, no match or multiple matches all fail closed.
 */
export function selectCanonicalRouterV3Swap(
  events: readonly DecodedRouterV3Swap[],
  expected: ExpectedRouterV3Swap,
): RouterV3SwapSelection {
  const eq = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
  const matches = events.filter(
    (e) =>
      eq(e.emitter, expected.router) &&
      eq(e.sender, expected.sender) &&
      eq(e.recipient, expected.recipient) &&
      e.swapAmount > 0n,
  );
  if (matches.length === 0) {
    return {
      ok: false,
      kind: 'missing',
      reason: 'no canonical Router v3 SwapExecuted log matches the expected actor and emitter',
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      kind: 'ambiguous',
      reason: `ambiguous evidence: ${matches.length} matching Router v3 SwapExecuted logs`,
    };
  }
  return { ok: true, event: matches[0]! };
}
