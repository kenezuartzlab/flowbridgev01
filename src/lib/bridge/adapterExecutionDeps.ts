/**
 * Phase 4B: builds the AdapterExecutionDeps for the real (testnet-only) wiring.
 * Constructed lazily and ONLY inside the dormant Adapter branch, so no RPC
 * client or wallet write is ever created while the execution flag is off.
 */
import { createPublicClient, erc20Abi, http, type Hex as ViemHex } from 'viem';
import { botTestnet, bscTestnet } from '../wagmi';
import { BRIDGE_ADAPTER_ABI } from './adapterAbi';
import { ADAPTER_CHAIN_IDS } from './adapterConfig';
import {
  parseBridgeRequestedNonce,
  type AdapterBridgeCall,
  type AdapterExecutionDeps,
} from './adapterExecution';
import type { PreviewSourceTuple } from './adapterPreview';

const chainFor = (chainId: number) =>
  chainId === ADAPTER_CHAIN_IDS.botTestnet ? botTestnet : bscTestnet;

const clientFor = (chainId: number) =>
  createPublicClient({ chain: chainFor(chainId), transport: http() });

const bridgeArgs = (call: AdapterBridgeCall) =>
  [
    call.destinationRecipient,
    call.refundRecipient,
    call.amount,
    call.minRefundableAmount,
    call.deadline,
  ] as const;

export function createAdapterExecutionDeps(args: {
  account: ViemHex;
  writeContractAsync: (config: unknown) => Promise<ViemHex>;
}): AdapterExecutionDeps {
  const { account, writeContractAsync } = args;

  return {
    readPreviewSource: async ({ adapter, chainId, amountWei }) =>
      (await clientFor(chainId).readContract({
        address: adapter,
        abi: BRIDGE_ADAPTER_ABI,
        functionName: 'previewSource',
        args: [amountWei],
      })) as unknown as PreviewSourceTuple,

    readBlockTimestamp: async ({ chainId }) => (await clientFor(chainId).getBlock()).timestamp,

    readAllowance: async ({ token, owner, spender, chainId }) =>
      (await clientFor(chainId).readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [owner, spender],
      })) as bigint,

    writeApprove: ({ token, spender, amount, chainId }) =>
      writeContractAsync({
        address: token,
        abi: erc20Abi,
        functionName: 'approve',
        args: [spender, amount],
        chainId,
      }),

    waitForReceipt: async ({ hash, chainId }) =>
      await clientFor(chainId).waitForTransactionReceipt({ hash }),

    simulateBridge: async (call) =>
      await clientFor(call.chainId).simulateContract({
        address: call.adapter,
        abi: BRIDGE_ADAPTER_ABI,
        functionName: 'bridge',
        args: bridgeArgs(call),
        account,
      }),

    writeBridge: (call) =>
      writeContractAsync({
        address: call.adapter,
        abi: BRIDGE_ADAPTER_ABI,
        functionName: 'bridge',
        args: bridgeArgs(call),
        chainId: call.chainId,
      }),

    parseBridgeRequested: parseBridgeRequestedNonce,
  };
}
