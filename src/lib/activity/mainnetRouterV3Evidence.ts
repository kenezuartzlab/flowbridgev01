/**
 * V30.2B P2B — BOT Mainnet (677) Router v3 EVIDENCE verification configuration.
 *
 * This module adds chain 677 to the verifier's supported EVIDENCE paths only.
 * It deliberately does NOT:
 *   • promote Router V4 or change any execution/route configuration,
 *   • enable swap execution, claims, staking or any feature flag,
 *   • award, convert or recalculate FLOW Points.
 *
 * Verification is fail closed: wrong chain, wrong router, wrong wallet, wrong
 * event signature, ambiguous logs, zero amount or a missing receipt log index
 * can never produce a canonical verified activity.
 */
import { keccak256, toBytes } from 'viem';
import type { Hex } from './activityIntent';
import { canonicalActivityId, type CanonicalEventKey } from './activityCanonicalKey';
import type { SourceReceipt } from './officialBridgeEvent';
import {
  decodeRouterV3Swaps,
  selectCanonicalRouterV3Swap,
  type DecodedRouterV3Swap,
  type RouterV3SwapDecoder,
} from './routerV3SwapEvent';

export const BOT_MAINNET_CHAIN_ID = 677;

/** Live BOT Mainnet FlowBridgeRouter v3 (unchanged, still the live router). */
export const MAINNET_ROUTER_V3_ADDRESS: Hex =
  '0x986962de6f00d0ec571b1a34fa70aeeb445b5445';

/** Frozen evidence action tag: keccak256("MAINNET_ROUTER_V3_CORE_SWAP_V1"). */
export const MAINNET_ROUTER_V3_CORE_SWAP_ACTION_TYPE: Hex = keccak256(
  toBytes('MAINNET_ROUTER_V3_CORE_SWAP_V1'),
);

export const MAINNET_ROUTER_V3_EVIDENCE_SOURCE = 'ROUTER_V3_RECEIPT' as const;

export interface MainnetRouterV3EvidencePath {
  id: 'bot-mainnet-router-v3-core-swap';
  label: string;
  chainId: number;
  router: Hex;
  actionType: Hex;
  kind: 'SWAP_EXECUTED';
  evidenceSource: typeof MAINNET_ROUTER_V3_EVIDENCE_SOURCE;
  /** Evidence only — never an execution or route promotion path. */
  executionEnabled: false;
}

export const MAINNET_ROUTER_V3_EVIDENCE_PATH: MainnetRouterV3EvidencePath = {
  id: 'bot-mainnet-router-v3-core-swap',
  label: 'BOT Mainnet 677 · FlowBridgeRouter v3 · SwapExecuted evidence (verification only)',
  chainId: BOT_MAINNET_CHAIN_ID,
  router: MAINNET_ROUTER_V3_ADDRESS,
  actionType: MAINNET_ROUTER_V3_CORE_SWAP_ACTION_TYPE,
  kind: 'SWAP_EXECUTED',
  evidenceSource: MAINNET_ROUTER_V3_EVIDENCE_SOURCE,
  executionEnabled: false,
};

export function findMainnetRouterV3EvidencePath(
  chainId: number,
  router?: string,
): MainnetRouterV3EvidencePath | undefined {
  const p = MAINNET_ROUTER_V3_EVIDENCE_PATH;
  const routerOk =
    router === undefined || router.toLowerCase() === p.router.toLowerCase();
  return chainId === p.chainId && routerOk ? p : undefined;
}

export interface RouterV3CanonicalActivity {
  activityId: Hex;
  chainId: number;
  txHash: Hex;
  /** ACTUAL receipt log index of the canonical SwapExecuted log. */
  logIndex: number;
  blockNumber: number;
  transactionIndex: number;
  router: Hex;
  wallet: Hex;
  recipient: Hex;
  tokenIn: Hex;
  tokenOut: Hex;
  amountRaw: bigint;
  amountOut: bigint;
  fee: bigint;
  routerId: bigint;
  occurredAt: number;
  actionType: Hex;
  kind: 'SWAP_EXECUTED';
  evidenceSource: typeof MAINNET_ROUTER_V3_EVIDENCE_SOURCE;
  activityKey: string;
}

export type RouterV3VerificationResult =
  | { status: 'VERIFIED'; activity: RouterV3CanonicalActivity; event: DecodedRouterV3Swap }
  | { status: 'REJECTED'; reason: string };

export interface RouterV3ReceiptEvidence {
  chainId: number;
  txHash: string;
  /** Transaction sender proven from the canonical transaction. */
  from: string;
  /** Transaction target — must be the live Router v3. */
  to: string | null;
  status: 'success' | 'reverted';
  blockNumber: number;
  transactionIndex: number;
  blockTimestamp: number;
  logs: SourceReceipt['logs'];
}

const isHash = (v: unknown): v is string => typeof v === 'string' && /^0x[0-9a-f]{64}$/i.test(v);
const eq = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

/**
 * Reconstructs the canonical verified activity for one historical mainnet
 * Router v3 core swap, exclusively from canonical receipt evidence.
 */
export function verifyMainnetRouterV3CoreSwap(
  evidence: RouterV3ReceiptEvidence,
  options: { expectedWallet?: string; decodeLog?: RouterV3SwapDecoder } = {},
): RouterV3VerificationResult {
  const path = findMainnetRouterV3EvidencePath(evidence.chainId);
  if (!path) {
    return { status: 'REJECTED', reason: `chain ${evidence.chainId} is not BOT Mainnet 677` };
  }
  if (!isHash(evidence.txHash)) {
    return { status: 'REJECTED', reason: 'missing or malformed transaction hash' };
  }
  if (evidence.status !== 'success') {
    return { status: 'REJECTED', reason: 'source transaction did not succeed' };
  }
  if (!eq(evidence.to, path.router)) {
    return { status: 'REJECTED', reason: 'transaction target is not the live Router v3' };
  }
  if (options.expectedWallet && !eq(evidence.from, options.expectedWallet)) {
    return { status: 'REJECTED', reason: 'transaction sender does not match the expected wallet' };
  }
  if (!Number.isInteger(evidence.blockNumber) || evidence.blockNumber <= 0) {
    return { status: 'REJECTED', reason: 'unresolved canonical block number' };
  }
  if (!Number.isInteger(evidence.transactionIndex) || evidence.transactionIndex < 0) {
    return { status: 'REJECTED', reason: 'unresolved canonical transaction index' };
  }

  const receipt = {
    status: evidence.status,
    blockNumber: BigInt(evidence.blockNumber),
    blockTimestamp: evidence.blockTimestamp,
    logs: evidence.logs,
  } as unknown as SourceReceipt;

  const selection = selectCanonicalRouterV3Swap(
    decodeRouterV3Swaps(receipt, options.decodeLog),
    {
      router: path.router,
      sender: evidence.from.toLowerCase() as Hex,
      recipient: evidence.from.toLowerCase() as Hex,
    },
  );
  if (!selection.ok) return { status: 'REJECTED', reason: selection.reason };

  const event = selection.event;
  if (!Number.isInteger(event.logIndex) || event.logIndex < 0) {
    return { status: 'REJECTED', reason: 'missing actual receipt log index' };
  }

  const key: CanonicalEventKey = {
    chainId: path.chainId,
    txHash: evidence.txHash.toLowerCase() as Hex,
    logIndex: event.logIndex,
  };

  return {
    status: 'VERIFIED',
    event,
    activity: {
      activityId: canonicalActivityId(key, path.actionType),
      chainId: key.chainId,
      txHash: key.txHash,
      logIndex: key.logIndex,
      blockNumber: evidence.blockNumber,
      transactionIndex: evidence.transactionIndex,
      router: path.router,
      wallet: evidence.from.toLowerCase() as Hex,
      recipient: event.recipient,
      tokenIn: event.tokenIn,
      tokenOut: event.tokenOut,
      amountRaw: event.swapAmount,
      amountOut: event.amountOut,
      fee: event.fee,
      routerId: event.routerId,
      occurredAt: evidence.blockTimestamp,
      actionType: path.actionType,
      kind: 'SWAP_EXECUTED',
      evidenceSource: path.evidenceSource,
      activityKey: `${key.chainId}:${key.txHash}:${key.logIndex}`,
    },
  };
}

/**
 * Read-only collision scan: two ledger rows that collapse onto ONE canonical
 * activity identity must stop the repair instead of being merged.
 */
export function scanEvidenceCollisions(
  bindings: readonly { ledgerId: string; activityKey: string }[],
): { ok: boolean; collisions: readonly { activityKey: string; ledgerIds: string[] }[] } {
  const byKey = new Map<string, string[]>();
  for (const b of bindings) {
    const list = byKey.get(b.activityKey) ?? [];
    list.push(b.ledgerId);
    byKey.set(b.activityKey, list);
  }
  const collisions = [...byKey.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([activityKey, ledgerIds]) => ({ activityKey, ledgerIds }));
  return { ok: collisions.length === 0, collisions };
}
