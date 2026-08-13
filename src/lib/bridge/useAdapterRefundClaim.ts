/**
 * Phase 5B: explicit, user-initiated Adapter refund claim.
 *
 * - Never auto-claims: `claim()` only runs from a user click.
 * - Concurrent/duplicate clicks are blocked by an in-flight ref.
 * - Session is marked refund_claimed ONLY after a fresh on-chain state 4.
 */
import { useCallback, useRef, useState } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import type { Hex as ViemHex } from 'viem';
import type { PendingAdapterBridge } from '../../store/routeSession';
import { getLocalSession, saveLocalSession } from '../../store/routeSession';
import { isBridgeAdapterRefundClaimTestnetEnabled } from './adapterConfig';
import {
  claimAdapterRefund,
  refundClaimGate,
  type RefundClaimResult,
} from './adapterRefund';
import { createAdapterRefundDeps } from './adapterRefundDeps';
import { toFriendlyError } from '../friendlyError';

const REJECT_MESSAGES: Record<string, string> = {
  FLAG_OFF: 'Refund claiming is not enabled in this build.',
  NO_SESSION: 'No refundable bridge request was found.',
  UNSUPPORTED_CHAIN: 'Refund claiming is only available for the supported testnet routes.',
  ROUTE_NOT_ACTIVE: 'This route is not active for refund claiming.',
  ADAPTER_MISMATCH: 'The stored Adapter does not match the configured route.',
  INVALID_NONCE: 'This request has no confirmed on-chain request id.',
  STATE_NOT_REFUND_AVAILABLE:
    'The request is no longer refundable — refreshing the on-chain status.',
  NOT_CLAIMABLE: 'The Adapter reports this refund as not claimable right now.',
  SIMULATION_FAILED: 'The refund claim would fail on-chain, so nothing was sent.',
};

export function useAdapterRefundClaim(session: PendingAdapterBridge | undefined | null) {
  const flagEnabled = isBridgeAdapterRefundClaimTestnetEnabled();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimResult, setClaimResult] = useState<RefundClaimResult | null>(null);
  const inFlight = useRef(false);

  const claim = useCallback(async () => {
    if (inFlight.current) return;
    if (!session || !refundClaimGate(session, flagEnabled).claimable) return;
    if (!address) {
      setClaimError('Connect a wallet to submit the refund claim.');
      return;
    }
    inFlight.current = true;
    setClaiming(true);
    setClaimError(null);
    try {
      const deps = createAdapterRefundDeps({
        account: address as ViemHex,
        writeContractAsync: (config) => writeContractAsync(config as never),
      });
      const result = await claimAdapterRefund(deps, session, flagEnabled);
      setClaimResult(result);
      if (result.refundCompleted) {
        const local = getLocalSession();
        if (local.pendingAdapterBridge?.tx_hash === session.tx_hash) {
          saveLocalSession({
            ...local,
            pendingAdapterBridge: { ...local.pendingAdapterBridge, status: 'refund_claimed' },
          });
        }
      }
    } catch (e) {
      const reason = (e as { reason?: string })?.reason;
      setClaimError(
        (reason && REJECT_MESSAGES[reason]) || toFriendlyError(e) || 'Refund claim failed.',
      );
    } finally {
      inFlight.current = false;
      setClaiming(false);
    }
  }, [address, flagEnabled, session, writeContractAsync]);

  return { flagEnabled, claiming, claimError, claimResult, claim };
}
