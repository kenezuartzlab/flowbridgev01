// Read-only factory-discovered wrapper-bridge depth. No wrapping equivalence assumed.
import {createPublicClient,http,parseAbi,type Address} from 'viem';
import {readFileSync,writeFileSync} from 'node:fs';
const live=JSON.parse(readFileSync('docs/security/caswap-correction/live.json','utf8'));const pc=createPublicClient({transport:http('https://rpc.botchain.ai',{retryCount:0})});
const abi=parseAbi(['function getPair(address,address) view returns(address)','function totalSupply() view returns(uint256)','function activationDelay() view returns(uint256)']);
const rows=[];
for(const factory of [live.venues.supplied.factory,live.venues.old.factory,'0x117115f3b72c8d1989178089a67d0c26f8ee0aa3'] as Address[]){for(const [a,b] of [[live.addresses.caWbot,live.addresses.wbot],[live.addresses.caWbot,live.addresses.usdt]]){let result;try{result=await pc.readContract({address:factory,abi,functionName:'getPair',args:[a,b],blockNumber:BigInt(live.pin.number)});}catch(e:any){result={UNKNOWN:e.shortMessage??e.message};}rows.push({factory,a,b,pair:result});}}
const wbotSupply=await pc.readContract({address:live.addresses.wbot,abi,functionName:'totalSupply',blockNumber:BigInt(live.pin.number)});
const out={kind:'READ_ONLY',pin:live.pin,mainnetWrites:0,rows,wbotSupply};writeFileSync('docs/security/caswap-correction/bridge-depth.json',JSON.stringify(out,(_k,v)=>typeof v==='bigint'?v.toString():v,2));console.log(JSON.stringify(out,(_k,v)=>typeof v==='bigint'?v.toString():v,2));
