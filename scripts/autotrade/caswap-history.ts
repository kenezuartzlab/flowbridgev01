// Read-only explorer history + canonical receipt checks. No user identity attribution.
import {createPublicClient,http,parseAbi,decodeEventLog,toEventSelector, type Hex} from 'viem';
import {writeFileSync,readFileSync} from 'node:fs';
const pc=createPublicClient({transport:http('https://rpc.botchain.ai',{timeout:20000,retryCount:0})});
const live=JSON.parse(readFileSync('docs/security/caswap-correction/live.json','utf8'));
const v3=live.addresses.v3;
const event=parseAbi(['event SwapExecuted(uint256 indexed routerId,address indexed tokenIn,address indexed tokenOut,address sender,address recipient,uint256 swapAmount,uint256 amountOut,uint256 fee)']);
const topic=toEventSelector(event[0]);
const out:any={kind:'READ_ONLY_HISTORY',mainnetWrites:0,provenance:[],events:[],receiptChecks:[]};
for(const id of [2,3]){
 const url=`https://scan.botchain.ai/api?module=logs&action=getLogs&fromBlock=0&toBlock=${live.pin.number}&address=${v3}&topic0=${topic}&topic1=0x${id.toString(16).padStart(64,'0')}&topic0_1_opr=and`;
 const j=await (await fetch(url)).json();out.provenance.push({url,status:j.status,count:Array.isArray(j.result)?j.result.length:null,cap:1000,completeness:'INDEX_RESPONSE_NOT_ARCHIVE_PROOF'});
 if(!Array.isArray(j.result))continue;
 for(const l of j.result){try{const d=decodeEventLog({abi:event,data:l.data,topics:l.topics.filter(Boolean)});const a=d.args;out.events.push({tx:l.transactionHash,block:BigInt(l.blockNumber),routerId:a.routerId,tokenIn:a.tokenIn,tokenOut:a.tokenOut,swapAmount:a.swapAmount,amountOut:a.amountOut,fee:a.fee});}catch{}}
}
for(const ev of [...out.events.filter((x:any)=>String(x.routerId)==='3').slice(-2),...out.events.filter((x:any)=>String(x.routerId)==='2'&&(x.tokenIn.toLowerCase()===live.addresses.ca.toLowerCase()||x.tokenOut.toLowerCase()===live.addresses.ca.toLowerCase())).slice(-2)]){
 const row:any={tx:ev.tx,event:ev};
 try{const r=await pc.getTransactionReceipt({hash:ev.tx});const t=await pc.getTransaction({hash:ev.tx});row.receipt={status:r.status,blockNumber:r.blockNumber,blockHash:r.blockHash,to:r.to,gasUsed:r.gasUsed};row.input=t.input;row.value=t.value;row.logs=r.logs.map(l=>({address:l.address,topics:l.topics,data:l.data}));
 row.historicalRegistry=await pc.readContract({address:v3,abi:parseAbi(['function routers(uint256) view returns(address,uint8,address,bool,string,string)']),functionName:'routers',args:[BigInt(ev.routerId)],blockNumber:r.blockNumber}).catch((e)=>({UNKNOWN:e.shortMessage??e.message}));
 }catch(e:any){row.UNKNOWN=e.shortMessage??e.message;}out.receiptChecks.push(row);
}
writeFileSync('docs/security/caswap-correction/history.json',JSON.stringify(out,(_k,v)=>typeof v==='bigint'?v.toString():v,2));
console.log(JSON.stringify({eventCount:out.events.length,byId:{2:out.events.filter((x:any)=>String(x.routerId)==='2').length,3:out.events.filter((x:any)=>String(x.routerId)==='3').length},receipts:out.receiptChecks.map((x:any)=>({tx:x.tx,receipt:x.receipt,registry:x.historicalRegistry}))},(_k,v)=>typeof v==='bigint'?v.toString():v,2));
