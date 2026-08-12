/**
 * Phase 3 read-only BridgeAdapter preview hook.
 *
 * - performs ZERO RPC calls unless every gate in `resolveAdapterPreviewRequest`
 *   passes (feature flag ON, testnet, BNB↔BOT, positive amount, active route)
 * - debounces keystrokes (400ms)
 * - drops stale responses via a monotonically increasing request id
 * - never throws; failures surface as `error` and are console-logged in dev only
 */
import { useEffect, useRef, useState } from 'react';
import { createPublicClient, http } from 'viem';
import { botTestnet, bscTestnet } from '../wagmi';
import { BRIDGE_ADAPTER_ABI } from './adapterAbi';
import {
  fetchAdapterPreview,
  resolveAdapterPreviewRequest,
  type AdapterPreview,
  type PreviewSourceTuple,
  type ReadPreviewSource,
} from './adapterPreview';

const DEBOUNCE_MS = 400;

const chainFor = (chainId: number) => (chainId === 968 ? botTestnet : bscTestnet);

const defaultRead: ReadPreviewSource = async ({ adapter, chainId, amountWei }) => {
  const client = createPublicClient({ chain: chainFor(chainId), transport: http() });
  const result = await client.readContract({
    address: adapter,
    abi: BRIDGE_ADAPTER_ABI,
    functionName: 'previewSource',
    args: [amountWei],
  });
  return result as unknown as PreviewSourceTuple;
};

export interface UseAdapterPreviewResult {
  preview: AdapterPreview | null;
  loading: boolean;
  error: string | null;
}

export function useAdapterPreview(args: {
  isMainnet: boolean;
  bridgeDirection: string;
  amount: string;
  /** test/storybook injection point */
  read?: ReadPreviewSource;
  flagEnabled?: boolean;
}): UseAdapterPreviewResult {
  const { isMainnet, bridgeDirection, amount, read, flagEnabled } = args;
  const [state, setState] = useState<UseAdapterPreviewResult>({
    preview: null,
    loading: false,
    error: null,
  });
  const seqRef = useRef(0);

  useEffect(() => {
    const request = resolveAdapterPreviewRequest({ isMainnet, bridgeDirection, amount, flagEnabled });
    const seq = ++seqRef.current;

    if (!request) {
      setState({ preview: null, loading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));
    const timer = setTimeout(async () => {
      const { preview, error } = await fetchAdapterPreview(read ?? defaultRead, request);
      // Stale guard: a newer amount/direction/network already superseded us.
      if (seq !== seqRef.current) return;
      if (error && import.meta.env.DEV) {
        console.warn('[BridgeAdapter] previewSource failed (non-blocking):', error);
      }
      setState({ preview, loading: false, error });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [isMainnet, bridgeDirection, amount, read, flagEnabled]);

  return state;
}
