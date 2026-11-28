// Read-only comparison of pinned mainnet baselines with the completed local fork.
import {createPublicClient,http,parseAbi,type Address} from 'viem';
import {readFileSync,writeFileSync} from 'node:fs';
const live=JSON.parse(readFileSync('docs/security/caswap-correction/live.json','utf8'));const fork=JSON.parse(readFileSync('docs/security/caswap-correction/fork.json','utf8'));
const remote=createPublicClient({transport:http('https://rpc.botchain.ai',{retryCount:0})}),local=createPublicClient({transport:http('http://127.0.0.1:8547')});
const abi=parseAbi(['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)']);const rows=[];
for(const target of [live.addresses.supplied,live.addresses.v4] as Address[]){
 const remoteNative=await remote.getBalance({address:target,blockNumber:BigInt(live.pin.number)}),localNative=await local.getBalance({address:target});rows.push({target,asset:'native',before:remoteNative,after:localNative,unchanged:remoteNative===localNative});
 for(const token of [live.addresses.ca,live.addresses.caWbot,live.addresses.wbot,live.addresses.usdt] as Address[]){const before=await remote.readContract({address:token,abi,functionName:'balanceOf',args:[target],blockNumber:BigInt(live.pin.number)}),after=await local.readContract({address:token,abi,functionName:'balanceOf',args:[target]});rows.push({target,asset:token,before,after,unchanged:before===after});}
}
const out={mainnetWrites:0,kind:'LOCAL_RESIDUAL_COMPARISON',pin:live.pin,localResult:fork.result,rows};writeFileSync('docs/security/caswap-correction/residuals.json',JSON.stringify(out,(_k,v)=>typeof v==='bigint'?v.toString():v,2));if(rows.some(r=>!r.unchanged))throw Error('RESIDUAL_CHANGED');console.log('10/10 native/token balance baselines unchanged across V4 and CaSwap router');
