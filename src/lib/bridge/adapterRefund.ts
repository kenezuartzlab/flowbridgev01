/**
 * FlowBridge BridgeAdapter — Phase 5B refund claiming (explicit user action).
 *
 * Fail-closed, dependency-injected and pure apart from the injected calls.
 * The ONLY write it can ever perform is claimRefund(gatewayNonce); there is no
 * approve / deposit / depositWithBotGas / bridge path in this module.
 *
 * A refund is considered complete ONLY after a fresh post-receipt
 * requestState() read returns RefundClaimed (4). A mined transaction alone is
 * never treated as success.
 */
import { isAddress } from 'viem';
import type { PendingAdapterBridge } from '../../store/routeSession';
import {
  findActiveAdapterRouteUnflagged,
  isBridgeAdapterRefundClaimTestnetEnabled,
  type Hex,
} from './adapterConfig';
import { ADAPTER_STATUS_SOURCE_CHAINS } from './adapterStatus';

export const REFUND_AVAILABLE_STATE = 3;
export const REFUND_CLAIMED_STATE = 4;

export type RefundRejectReason =
  | 'FLAG_OFF'
  | 'NO_SESSION'
  | 'UNSUPPORTED_CHAIN'
  | 'ROUTE_NOT_ACTIVE'
  | 'ADAPTER_MISMATCH'
  | 'INVALID_NONCE'
  | 'STATE_NOT_REFUND_AVAILABLE'
  | 'NOT_CLAIMABLE'
  | 'SIMULATION_FAILED';

export class RefundClaimRejected extends Error {
  constructor(
    public readonly reason: RefundRejectReason,
    public readonly state?: number,
  ) {
    super(`REFUND_CLAIM_REJECTED:${reason}`);
    this.name = 'RefundClaimRejected';
  }
}

export interface RefundClaimGate {
  claimable: boolean;
  reason?: RefundRejectReason;
}

/** Static (no RPC) gate. Returning claimable=true still requires fresh reads. */
export function refundClaimGate(
  session: PendingAdapterBridge | undefined | null,
  flagEnabled: boolean = isBridgeAdapterRefundClaimTestnetEnabled(),
): RefundClaimGate {
  if (!flagEnabled) return { claimable: false, reason: 'FLAG_OFF' };
  if (!session) return { claimable: false, reason: 'NO_SESSION' };
  if (!ADAPTER_STATUS_SOURCE_CHAINS.includes(session.source_chain_id)) {
    return { claimable: false, reason: 'UNSUPPORTED_CHAIN' };
  }
  const route = findActiveAdapterRouteUnflagged(
    session.source_chain_id,
    session.destination_chain_id,
  );
  if (!route) return { claimable: false, reason: 'ROUTE_NOT_ACTIVE' };
  if (
    typeof session.adapter_address !== 'string' ||
    !isAddress(session.adapter_address) ||
    session.adapter_address.toLowerCase() !== route.adapter.toLowerCase()
  ) {
    return { claimable: false, reason: 'ADAPTER_MISMATCH' };
  }
  if (typeof session.gateway_nonce !== 'string' || !/^\d+$/.test(session.gateway_nonce)) {
    return { claimable: false, reason: 'INVALID_NONCE' };
  }
  return { claimable: true };
}

export interface AdapterRefundDeps {
  readRequestState: (a: { adapter: Hex; chainId: number; gatewayNonce: bigint }) => Promise<number>;
  readCanClaimRefund: (a: { adapter: Hex; chainId: number; gatewayNonce: bigint }) => Promise<boolean>;
  simulateClaimRefund: (a: { adapter: Hex; chainId: number; gatewayNonce: bigint }) => Promise<unknown>;
  writeClaimRefund: (a: { adapter: Hex; chainId: number; gatewayNonce: bigint }) => Promise<Hex>;
  waitForReceipt: (a: { hash: Hex; chainId: number }) => Promise<{ status: 'success' | 'reverted' }>;
}

export interface RefundClaimResult {
  txHash: Hex;
  /** Fresh post-receipt on-chain state. Only 4 means refund complete. */
  finalState: number;
  /** true ONLY when finalState === 4. */
  refundCompleted: boolean;
  receiptStatus: 'success' | 'reverted';
  gatewayNonce: string;
  adapterAddress: string;
  sourceChainId: number;
  refundRecipient: string;
}

export async function claimAdapterRefund(
  deps: AdapterRefundDeps,
  session: PendingAdapterBridge,
  flagEnabled: boolean = isBridgeAdapterRefundClaimTestnetEnabled(),
): Promise<RefundClaimResult> {
  const gate = refundClaimGate(session, flagEnabled);
  if (!gate.claimable) throw new RefundClaimRejected(gate.reason ?? 'NO_SESSION');

  const adapter = session.adapter_address as Hex;
  const chainId = session.source_chain_id;
  const gatewayNonce = BigInt(session.gateway_nonce as string);
  const args = { adapter, chainId, gatewayNonce };

  const state = Number(await deps.readRequestState(args));
  if (state !== REFUND_AVAILABLE_STATE) {
    throw new RefundClaimRejected('STATE_NOT_REFUND_AVAILABLE', state);
  }

  const canClaim = await deps.readCanClaimRefund(args);
  if (canClaim !== true) throw new RefundClaimRejected('NOT_CLAIMABLE', state);

  try {
    await deps.simulateClaimRefund(args);
  } catch {
    throw new RefundClaimRejected('SIMULATION_FAILED', state);
  }

  const txHash = await deps.writeClaimRefund(args);
  const receipt = await deps.waitForReceipt({ hash: txHash, chainId });
  const finalState = Number(await deps.readRequestState(args));

  return {
    txHash,
    finalState,
    refundCompleted: finalState === REFUND_CLAIMED_STATE,
    receiptStatus: receipt.status,
    gatewayNonce: session.gateway_nonce as string,
    adapterAddress: session.adapter_address,
    sourceChainId: chainId,
    refundRecipient: session.refund_recipient,
  };
}
