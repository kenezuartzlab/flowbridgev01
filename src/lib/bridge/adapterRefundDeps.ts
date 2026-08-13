/**
 * Phase 5B: live viem dependencies for the refund claim. Built lazily and ONLY
 * when the user explicitly triggers a claim, so no RPC client or wallet write
 * exists while the refund-claim flag is off.
 */
import { createPublicClient, http, type Hex as ViemHex } from 'viem';
import { botTestnet, bscTestnet } from '../wagmi';
import { BRIDGE_ADAPTER_ABI } from './adapterAbi';
import { ADAPTER_CHAIN_IDS } from './adapterConfig';
import type { AdapterRefundDeps } from './adapterRefund';

const chainFor = (chainId: number) =>
  chainId === ADAPTER_CHAIN_IDS.botTestnet ? botTestnet : bscTestnet;

const clientFor = (chainId: number) =>
  createPublicClient({ chain: chainFor(chainId), transport: http() });

export function createAdapterRefundDeps(args: {
  account: ViemHex;
  writeContractAsync: (config: unknown) => Promise<ViemHex>;
}): AdapterRefundDeps {
  const { account, writeContractAsync } = args;

  return {
    readRequestState: async ({ adapter, chainId, gatewayNonce }) =>
      Number(
        (await clientFor(chainId).readContract({
          address: adapter,
          abi: BRIDGE_ADAPTER_ABI,
          functionName: 'requestState',
          args: [gatewayNonce],
        })) as number | bigint,
      ),

    readCanClaimRefund: async ({ adapter, chainId, gatewayNonce }) =>
      (await clientFor(chainId).readContract({
        address: adapter,
        abi: BRIDGE_ADAPTER_ABI,
        functionName: 'canClaimRefund',
        args: [gatewayNonce],
      })) as boolean,

    simulateClaimRefund: async ({ adapter, chainId, gatewayNonce }) =>
      await clientFor(chainId).simulateContract({
        address: adapter,
        abi: BRIDGE_ADAPTER_ABI,
        functionName: 'claimRefund',
        args: [gatewayNonce],
        account,
      }),

    writeClaimRefund: ({ adapter, chainId, gatewayNonce }) =>
      writeContractAsync({
        address: adapter,
        abi: BRIDGE_ADAPTER_ABI,
        functionName: 'claimRefund',
        args: [gatewayNonce],
        chainId,
      }),

    waitForReceipt: async ({ hash, chainId }) =>
      (await clientFor(chainId).waitForTransactionReceipt({ hash })) as {
        status: 'success' | 'reverted';
      },
  };
}
