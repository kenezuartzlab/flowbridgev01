/**
 * Phase 5A: polls the Adapter's requestState() for a recorded Adapter session.
 *
 * - Constructs an RPC client ONLY when a valid pendingAdapterBridge exists.
 * - No overlapping reads, stale-response guard on session/nonce/chain change.
 * - Stops on Executed / RefundAvailable / RefundClaimed / Inconsistent.
 * - Transient RPC failures keep the last known non-terminal state and retry.
 * - Contains zero contract writes.
 */
import { useEffect, useRef, useState } from 'react';
import { createPublicClient, http } from 'viem';
import { botTestnet, bscTestnet } from '../wagmi';
import { BRIDGE_ADAPTER_ABI } from './adapterAbi';
import { ADAPTER_CHAIN_IDS, type Hex } from './adapterConfig';
import type { PendingAdapterBridge } from '../../store/routeSession';
import {
  ADAPTER_STATUS_POLL_MS,
  readAdapterStatus,
  shouldPollAdapterStatus,
  type AdapterStatusDeps,
  type AdapterStatusView,
} from './adapterStatus';

const chainFor = (chainId: number) =>
  chainId === ADAPTER_CHAIN_IDS.botTestnet ? botTestnet : bscTestnet;

export const liveAdapterStatusDeps: AdapterStatusDeps = {
  readRequestState: async ({ adapter, chainId, gatewayNonce }) => {
    const client = createPublicClient({ chain: chainFor(chainId), transport: http() });
    const state = (await client.readContract({
      address: adapter,
      abi: BRIDGE_ADAPTER_ABI,
      functionName: 'requestState',
      args: [gatewayNonce],
    })) as number | bigint;
    return Number(state);
  },
};

export interface UseAdapterStatusResult {
  status: AdapterStatusView | null;
  /** true while an RPC read failed and the last known state is being retried. */
  rpcError: boolean;
}

export function useAdapterStatus(
  pending: PendingAdapterBridge | undefined | null,
  deps: AdapterStatusDeps = liveAdapterStatusDeps,
): UseAdapterStatusResult {
  const [status, setStatus] = useState<AdapterStatusView | null>(null);
  const [rpcError, setRpcError] = useState(false);
  const seqRef = useRef(0);

  const applicable = shouldPollAdapterStatus(pending);
  const key = applicable
    ? `${pending!.tx_hash}:${pending!.gateway_nonce}:${pending!.source_chain_id}:${pending!.adapter_address}`
    : '';

  useEffect(() => {
    seqRef.current += 1;
    const seq = seqRef.current;
    setStatus(null);
    setRpcError(false);
    if (!applicable) return;

    let cancelled = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const view = await readAdapterStatus(deps, pending as PendingAdapterBridge);
        if (cancelled || seq !== seqRef.current) return;
        setRpcError(false);
        setStatus(view);
        if (view.terminal) return; // stop polling
      } catch {
        if (cancelled || seq !== seqRef.current) return;
        // Never turns into success/refund: last known non-terminal state stays.
        setRpcError(true);
      } finally {
        inFlight = false;
      }
      if (!cancelled) timer = setTimeout(tick, ADAPTER_STATUS_POLL_MS);
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, applicable]);

  return { status, rpcError };
}
