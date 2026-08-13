/**
 * FlowBridge BridgeAdapter — Phase 5A status/finality logic (READ-ONLY).
 *
 * The Adapter's on-chain `requestState(gatewayNonce)` is the ONLY finality
 * authority. Source receipt confirmations, elapsed time, destination balance
 * heuristics and predicted nonces can never produce Adapter success here.
 *
 * This module is pure + dependency-injected: it constructs no RPC client,
 * and contains ZERO contract writes.
 */
import { isAddress } from 'viem';
import type { PendingAdapterBridge } from '../../store/routeSession';
import { ADAPTER_CHAIN_IDS, type Hex } from './adapterConfig';

export const ADAPTER_STATUS_POLL_MS = 7000;

export type AdapterRequestStateKey =
  | 'none'
  | 'pending'
  | 'executed'
  | 'refund_available'
  | 'refund_claimed'
  | 'inconsistent';

export const ADAPTER_REQUEST_STATE: Record<number, AdapterRequestStateKey> = {
  0: 'none',
  1: 'pending',
  2: 'executed',
  3: 'refund_available',
  4: 'refund_claimed',
  5: 'inconsistent',
};

export interface AdapterStatusView {
  code: number;
  key: AdapterRequestStateKey;
  /** true only for requestState == 2 (Executed). Never derived from receipts. */
  isSuccess: boolean;
  /** true when polling must stop. */
  terminal: boolean;
  severity: 'info' | 'warning' | 'critical' | 'success';
  title: string;
  description: string;
  /** Phase 5A displays this; claimRefund() is Phase 5B and never called here. */
  refundClaimable: boolean;
}

/** Source chains supported by the active testnet Adapter routes. */
export const ADAPTER_STATUS_SOURCE_CHAINS: readonly number[] = [
  ADAPTER_CHAIN_IDS.bnbTestnet,
  ADAPTER_CHAIN_IDS.botTestnet,
];

/**
 * Gate: only a valid recorded Adapter session may cause an Adapter read.
 * Ordinary/direct gateway sessions return false → no Adapter RPC client.
 */
export function shouldPollAdapterStatus(
  pending: PendingAdapterBridge | undefined | null,
): pending is PendingAdapterBridge {
  if (!pending) return false;
  if (typeof pending.tx_hash !== 'string' || !pending.tx_hash.startsWith('0x')) return false;
  if (typeof pending.adapter_address !== 'string' || !isAddress(pending.adapter_address)) return false;
  // gatewayNonce must come from the stored BridgeRequested result — never predicted.
  if (typeof pending.gateway_nonce !== 'string' || pending.gateway_nonce.length === 0) return false;
  if (!/^\d+$/.test(pending.gateway_nonce)) return false;
  if (!ADAPTER_STATUS_SOURCE_CHAINS.includes(pending.source_chain_id)) return false;
  return true;
}

export function mapAdapterRequestState(code: number): AdapterStatusView {
  const key = ADAPTER_REQUEST_STATE[code];
  switch (key) {
    case 'executed':
      return {
        code,
        key,
        isSuccess: true,
        terminal: true,
        severity: 'success',
        title: 'Bridge executed',
        description: 'The bridge request was executed on-chain and recorded by the Adapter.',
        refundClaimable: false,
      };
    case 'pending':
      return {
        code,
        key,
        isSuccess: false,
        terminal: false,
        severity: 'info',
        title: 'Awaiting settlement',
        description:
          'Your source transaction was accepted. The cross-chain outcome is not final yet.',
        refundClaimable: false,
      };
    case 'refund_available':
      return {
        code,
        key,
        isSuccess: false,
        terminal: true,
        severity: 'warning',
        title: 'Refund available',
        description:
          'The bridge returned the funds to the Adapter. Your refund is ready to claim (claiming arrives in a later release).',
        refundClaimable: true,
      };
    case 'refund_claimed':
      return {
        code,
        key,
        isSuccess: false,
        terminal: true,
        severity: 'info',
        title: 'Refund completed',
        description: 'The Adapter paid the recorded refund recipient.',
        refundClaimable: false,
      };
    case 'inconsistent':
      return {
        code,
        key,
        isSuccess: false,
        terminal: true,
        severity: 'critical',
        title: 'Inconsistent state — manual review required',
        description:
          'The Adapter reported an inconsistent state. No automatic claim or retry will run. Keep the transaction hash, Adapter address and nonce for review.',
        refundClaimable: false,
      };
    default:
      return {
        code,
        key: 'none',
        isSuccess: false,
        terminal: false,
        severity: 'warning',
        title: 'Unresolved bridge request',
        description:
          'The Adapter has no record for this request yet. If this persists, the request needs manual review — it is never treated as a success.',
        refundClaimable: false,
      };
  }
}

export interface AdapterStatusDeps {
  /** Read-only requestState(gatewayNonce) on the SOURCE chain. */
  readRequestState: (args: { adapter: Hex; chainId: number; gatewayNonce: bigint }) => Promise<number>;
}

/** Single read. Throws on RPC failure so callers keep the last non-terminal state. */
export async function readAdapterStatus(
  deps: AdapterStatusDeps,
  pending: PendingAdapterBridge,
): Promise<AdapterStatusView> {
  if (!shouldPollAdapterStatus(pending)) {
    throw new Error('ADAPTER_STATUS_NOT_APPLICABLE');
  }
  const code = await deps.readRequestState({
    adapter: pending.adapter_address as Hex,
    chainId: pending.source_chain_id,
    gatewayNonce: BigInt(pending.gateway_nonce as string),
  });
  return mapAdapterRequestState(Number(code));
}

/** Maps a status view onto the persisted session status field. */
export function sessionStatusFor(view: AdapterStatusView): PendingAdapterBridge['status'] {
  return view.key === 'none' ? 'pending' : view.key;
}
