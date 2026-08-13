import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, decodeEventLog, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { executeAdapterBridge } from '../src/lib/bridge/adapterExecution';
import { BRIDGE_ADAPTER_ABI } from '../src/lib/bridge/adapterAbi';
import { BRIDGE_ADAPTER_ROUTES } from '../src/lib/bridge/adapterConfig';

const ERC20 = parseAbi([
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
]);
const route = BRIDGE_ADAPTER_ROUTES.find((r) => r.id === 'bnbTestnet->botTestnet')!;
const RPC: Record<number, string> = {
  97: 'https://bsc-testnet-rpc.publicnode.com',
  968: 'https://rpc-testnet.bit-origin.io',
};
let pk = process.env['DEPLOYER_PRIVATE_KEY']!.trim();
if (!pk.startsWith('0x')) pk = '0x' + pk;
const account = privateKeyToAccount(pk as `0x${string}`);
const pub = (chainId: number) => createPublicClient({ transport: http(RPC[chainId]) });
const wallet = createWalletClient({ account, transport: http(RPC[97]) });
const chain97 = { id: 97, name: 'bsc-testnet', nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 }, rpcUrls: { default: { http: [RPC[97]!] } } } as const;

const amountWei = parseUnits(process.argv[2] ?? '10.5', route.sourceDecimals);

const res = await executeAdapterBridge(
  {
    readPreviewSource: ({ adapter, chainId, amountWei }) =>
      pub(chainId).readContract({ address: adapter, abi: BRIDGE_ADAPTER_ABI, functionName: 'previewSource', args: [amountWei] }) as any,
    readBlockTimestamp: async ({ chainId }) => (await pub(chainId).getBlock()).timestamp,
    readAllowance: ({ token, owner, spender, chainId }) =>
      pub(chainId).readContract({ address: token, abi: ERC20, functionName: 'allowance', args: [owner, spender] }) as Promise<bigint>,
    writeApprove: ({ token, spender, amount }) =>
      wallet.writeContract({ chain: chain97 as any, address: token, abi: ERC20, functionName: 'approve', args: [spender, amount] }),
    waitForReceipt: async ({ hash, chainId }) => {
      const r = await pub(chainId).waitForTransactionReceipt({ hash, timeout: 180_000 });
      console.log('  receipt', hash, r.status);
      return r as any;
    },
    simulateBridge: (a) =>
      pub(a.chainId).simulateContract({
        account, address: a.adapter, abi: BRIDGE_ADAPTER_ABI, functionName: 'bridge',
        args: [a.destinationRecipient, a.refundRecipient, a.amount, a.minRefundableAmount, a.deadline],
      }),
    writeBridge: (a) =>
      wallet.writeContract({
        chain: chain97 as any, address: a.adapter, abi: BRIDGE_ADAPTER_ABI, functionName: 'bridge',
        args: [a.destinationRecipient, a.refundRecipient, a.amount, a.minRefundableAmount, a.deadline],
      }),
    parseBridgeRequested: (logs) => {
      for (const log of logs as any[]) {
        try {
          const d = decodeEventLog({ abi: BRIDGE_ADAPTER_ABI, data: log.data, topics: log.topics });
          if (d.eventName === 'BridgeRequested') return (d.args as any).gatewayNonce as bigint;
        } catch { /* not ours */ }
      }
      return null;
    },
  },
  {
    sourceChainId: route.sourceChainId,
    destinationChainId: route.destinationChainId,
    amountWei,
    destinationRecipient: account.address,
    refundRecipient: account.address,
    owner: account.address,
    flagEnabled: true,
    executionFlagEnabled: true,
  },
);

console.log(JSON.stringify({
  txHash: res.txHash,
  gatewayNonce: res.gatewayNonce?.toString() ?? null,
  amount: formatUnits(res.amount, route.sourceDecimals),
  officialFee: formatUnits(res.officialFeeAmount, route.sourceDecimals),
  refundable: formatUnits(res.refundableAmount, route.sourceDecimals),
  feeBps: res.feeBps,
  deadline: res.deadline.toString(),
  approvals: res.approvals,
}, null, 2));

if (res.gatewayNonce != null) {
  for (let i = 0; i < 8; i++) {
    const state = await pub(97).readContract({ address: route.adapter, abi: BRIDGE_ADAPTER_ABI, functionName: 'requestState', args: [res.gatewayNonce] });
    console.log('requestState', Number(state));
    if (Number(state) >= 2) break;
    await new Promise((r) => setTimeout(r, 7000));
  }
}
