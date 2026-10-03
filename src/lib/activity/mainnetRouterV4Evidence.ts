/**
 * Mainnet FLOW Points V2 — canonical BOT Mainnet 677 Router V4 swap evidence.
 *
 * Pure: reconstructs one canonical verified activity from receipt evidence
 * only. Wallet, tokens, amount, routerId and log index all come from the
 * frozen Router V4 `SwapActivity` log — never from the browser.
 */
import { keccak256, toBytes } from 'viem';
import type { Hex } from './activityIntent';
import { canonicalActivityId, type CanonicalEventKey } from './activityCanonicalKey';
import type { SourceReceipt } from './officialBridgeEvent';
import {
  decodeSwapActivityEvents,
  type DecodedSwapActivityEvent,
  type SwapActivityLogDecoder,
} from './swapActivityEvent';

export const MAINNET_CHAIN_ID = 677;
/** Canonical production FlowBridge Router V4 on BOT Mainnet (frozen). */
export const MAINNET_ROUTER_V4_ADDRESS: Hex = '0x79653140d84b78c19354ee984f236ec92160fc61';
export const MAINNET_ROUTER_V4_CORE_SWAP_ACTION_TYPE: Hex = keccak256(
  toBytes('MAINNET_ROUTER_V4_CORE_SWAP_V1'),
);
export const MAINNET_ROUTER_V4_EVIDENCE_SOURCE = 'ROUTER_V4_SWAP_ACTIVITY' as const;
/** Confirmations required before a Mainnet swap is economically final. */
export const MAINNET_FINALITY_CONFIRMATIONS = 3;

export interface RouterV4ReceiptEvidence {
  chainId: number;
  txHash: string;
  from: string;
  to: string | null;
  status: 'success' | 'reverted';
  blockNumber: number;
  /** Latest head observed by the server when evaluating finality. */
  headBlockNumber: number;
  blockTimestamp: number;
  logs: SourceReceipt['logs'];
}

export interface RouterV4CanonicalActivity {
  activityId: Hex;
  chainId: number;
  txHash: Hex;
  logIndex: number;
  wallet: Hex;
  recipient: Hex;
  tokenIn: Hex;
  tokenOut: Hex;
  amountRaw: bigint;
  routerId: bigint;
  occurredAt: number;
  actionType: Hex;
  evidenceSource: typeof MAINNET_ROUTER_V4_EVIDENCE_SOURCE;
  activityKey: string;
}

export type RouterV4VerificationResult =
  | { status: 'VERIFIED'; activity: RouterV4CanonicalActivity; event: DecodedSwapActivityEvent }
  | { status: 'NOT_FINAL'; reason: string }
  | { status: 'REJECTED'; reason: string };

const isHash = (v: unknown): v is string => typeof v === 'string' && /^0x[0-9a-f]{64}$/i.test(v);
const eq = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function verifyMainnetRouterV4CoreSwap(
  evidence: RouterV4ReceiptEvidence,
  options: { expectedWallet?: string; decodeLog?: SwapActivityLogDecoder } = {},
): RouterV4VerificationResult {
  if (evidence.chainId !== MAINNET_CHAIN_ID) {
    return { status: 'REJECTED', reason: `chain ${evidence.chainId} is not BOT Mainnet 677` };
  }
  if (!isHash(evidence.txHash)) return { status: 'REJECTED', reason: 'malformed transaction hash' };
  if (evidence.status !== 'success') {
    return { status: 'REJECTED', reason: 'source transaction did not succeed' };
  }
  if (!eq(evidence.to, MAINNET_ROUTER_V4_ADDRESS)) {
    return { status: 'REJECTED', reason: 'transaction target is not canonical Router V4' };
  }
  if (options.expectedWallet && !eq(evidence.from, options.expectedWallet)) {
    return { status: 'REJECTED', reason: 'transaction sender does not match the bound wallet' };
  }
  if (!Number.isInteger(evidence.blockNumber) || evidence.blockNumber <= 0) {
    return { status: 'NOT_FINAL', reason: 'transaction not yet mined' };
  }
  const confirmations = evidence.headBlockNumber - evidence.blockNumber + 1;
  if (!Number.isFinite(confirmations) || confirmations < MAINNET_FINALITY_CONFIRMATIONS) {
    return { status: 'NOT_FINAL', reason: `only ${Math.max(0, confirmations)} confirmations` };
  }

  const from = evidence.from.toLowerCase();
  const events = decodeSwapActivityEvents(
    { logs: evidence.logs } as unknown as SourceReceipt,
    options.decodeLog,
  ).filter(
    (e) =>
      eq(e.emitter, MAINNET_ROUTER_V4_ADDRESS) && eq(e.sender, from) && eq(e.recipient, from),
  );
  if (events.length === 0) {
    return { status: 'REJECTED', reason: 'no Router V4 SwapActivity for this wallet' };
  }
  if (events.length > 1) {
    return { status: 'REJECTED', reason: 'multiple SwapActivity logs — ambiguous' };
  }
  const event = events[0]!;
  if (!Number.isInteger(event.logIndex) || event.logIndex < 0) {
    return { status: 'REJECTED', reason: 'missing actual receipt log index' };
  }
  if (event.amountIn <= 0n) return { status: 'REJECTED', reason: 'zero amountIn' };

  const key: CanonicalEventKey = {
    chainId: MAINNET_CHAIN_ID,
    txHash: evidence.txHash.toLowerCase() as Hex,
    logIndex: event.logIndex,
  };
  return {
    status: 'VERIFIED',
    event,
    activity: {
      activityId: canonicalActivityId(key, MAINNET_ROUTER_V4_CORE_SWAP_ACTION_TYPE),
      chainId: key.chainId,
      txHash: key.txHash,
      logIndex: key.logIndex,
      wallet: from as Hex,
      recipient: event.recipient,
      tokenIn: event.tokenIn,
      tokenOut: event.tokenOut,
      amountRaw: event.amountIn,
      routerId: event.routerId,
      occurredAt: evidence.blockTimestamp,
      actionType: MAINNET_ROUTER_V4_CORE_SWAP_ACTION_TYPE,
      evidenceSource: MAINNET_ROUTER_V4_EVIDENCE_SOURCE,
      activityKey: `${key.chainId}:${key.txHash}:${key.logIndex}`,
    },
  };
}
