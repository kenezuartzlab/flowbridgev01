import { createPublicClient, http, parseUnits } from 'viem';
import { BRIDGE_ADAPTER_ABI } from '../src/lib/bridge/adapterAbi';
const pub = createPublicClient({ transport: http('https://bsc-testnet-rpc.publicnode.com') });
const r = await pub.readContract({ address: '0x8DCCA27e9c96491Cc27974a14Fd60fA1bBF23065', abi: BRIDGE_ADAPTER_ABI, functionName: 'previewSource', args: [parseUnits('10.5', 18)] });
console.log((r as any[]).map(String));
