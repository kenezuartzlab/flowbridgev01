import { createPublicClient, http, decodeEventLog } from 'viem';
import { BRIDGE_ADAPTER_ABI } from '../src/lib/bridge/adapterAbi';
import { mapAdapterStatus } from '../src/lib/bridge/adapterStatus';
const adapter='0x8DCCA27e9c96491Cc27974a14Fd60fA1bBF23065';
const pub=createPublicClient({transport:http('https://bsc-testnet-rpc.publicnode.com')});
const r=await pub.getTransactionReceipt({hash:'0x0de9c0d77462de2e7d76fe21d41503646e8df85973b068dbf93f957ec95ca1ca'});
let nonce:bigint|null=null;
for(const l of r.logs){try{const d=decodeEventLog({abi:BRIDGE_ADAPTER_ABI,data:l.data,topics:l.topics});if(d.eventName==='BridgeRequested')nonce=(d.args as any).gatewayNonce;}catch{}}
console.log('gatewayNonce',nonce?.toString());
for(let i=0;i<5;i++){
 const s=await pub.readContract({address:adapter,abi:BRIDGE_ADAPTER_ABI,functionName:'requestState',args:[nonce!]});
 const claim=await pub.readContract({address:adapter,abi:BRIDGE_ADAPTER_ABI,functionName:'canClaimRefund',args:[nonce!]});
 console.log('state',Number(s),JSON.stringify(mapAdapterStatus(Number(s))),'canClaimRefund',claim);
 if(Number(s)>=2)break;
 await new Promise(r=>setTimeout(r,8000));
}
