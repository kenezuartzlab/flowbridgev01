/** Local research collector. Fixed RPC/targets and existing authenticated admin /price gate only.
 * No key access, real wallet, transaction, signing, nonce, approvals or deployment.
 * Synthetic state overrides are confined to gas estimation; Quoter outputs use honest eth_call.
 */
import { readFileSync,writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { encodeFunctionData,decodeFunctionResult,encodeAbiParameters,keccak256,pad,toHex,parseAbi,type Address,type Hex } from 'viem';
import { BNB_ASSETS,BNB_OBSERVED_POOLS } from '../src/lib/bnb/quoteAdapter';
import { POOL_GATE as G,OFFICIAL_RPC,quoterAbi,factoryAbi,poolAbi,tokenAbi } from '../src/lib/rwa/quoteReadiness';
import { rankResearchQuotes,userNet,COMPARISON_LIMITS,type ResearchQuote } from '../src/lib/bnb/comparisonRanking';
import { buildZeroExPriceUrl,type ZeroExPublicResult,type ZeroExDirection } from '../src/lib/bnb/zeroExPrice';
const E=10n**18n,W=BNB_ASSETS.WBNB.address as Address,U=BNB_ASSETS.USDT.address as Address;
const pools=BNB_OBSERVED_POOLS.filter(p=>p.pair==='WBNB/USDT');
const SYN='0x000000000000000000000000000000000f1b0001' as Address;
const targets=[W,U,G.factory,G.quoter,G.router,...pools.map(p=>p.pool)].map(a=>a.toLowerCase());
const methods=['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getCode','eth_call','eth_estimateGas','eth_gasPrice'];
const calls:unknown[]=[],rows:unknown[]=[],attempts:unknown[]=[];let id=0,providerRequests=0;
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const output='docs/security/BNB_SWAP_V1_9_COMPARISON_EVIDENCE_20261118.json';
if(process.argv.includes('--resume')){const previous=JSON.parse(readFileSync(output,'utf8'));calls.push(...previous.calls);rows.push(...previous.rows);attempts.push(...previous.attempts);providerRequests=previous.providerRequests;}
const routerAbi=parseAbi(['function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)']);
const slot=(a:Address,n:bigint)=>keccak256(encodeAbiParameters([{type:'address'},{type:'uint256'}],[a,n]));
const nested=(a:Address,b:Address,n:bigint)=>keccak256(encodeAbiParameters([{type:'address'},{type:'bytes32'}],[b,slot(a,n)]));
const word=(n:bigint)=>pad(toHex(n),{size:32});
async function rpc(method:string,params:any[],peer=false):Promise<any>{
 if(!methods.includes(method))throw Error('forbidden method');
 if(['eth_call','eth_estimateGas','eth_getCode'].includes(method)){
  const to=method==='eth_getCode'?params[0]:params[0].to;
  if(!targets.includes(String(to).toLowerCase()) || !/^0x[0-9a-f]+$/i.test(params[1]))throw Error('unpinned or forbidden target');
  if(method==='eth_call' && (params.length!==2 || Object.keys(params[0]).some(k=>!['to','data'].includes(k))))throw Error('honest calls only');
  if(method==='eth_estimateGas' && (params[0].from!==SYN || params[0].to!==G.router || Object.keys(params[2]??{}).some(a=>![SYN,W,U].map(x=>x.toLowerCase()).includes(a.toLowerCase()))))throw Error('synthetic estimate only');
 }
 const endpoint=OFFICIAL_RPC[peer?1:0],at=Date.now();
 let j:any;
 for(let attempt=0;attempt<2;attempt++){try{const r=await fetch(endpoint,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(8000),headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})});j=await r.json();break;}catch{calls.push({endpoint,method,params,at:new Date(at).toISOString(),ok:false,error:'transport-or-json',attempt});if(attempt===1)throw Error('rpc transport');await sleep(1000);}}
 calls.push({endpoint,method,params,at:new Date(at).toISOString(),latencyMs:Date.now()-at,ok:!j.error,result:j.result,error:j.error?String(j.error.message).slice(0,200):undefined});
 if(j.error)throw Error('RPC_'+method);return j.result;
}
async function block(n?:number){const number=n??Number(BigInt(await rpc('eth_blockNumber',[])))-2;const tag=toHex(number);const b=await rpc('eth_getBlockByNumber',[tag,false]);const p=await rpc('eth_getBlockByNumber',[tag,false],true);if(!b || b.hash!==p?.hash)throw Error('peer hash mismatch');return {number,tag,hash:b.hash,time:Number(BigInt(b.timestamp))*1000,observedAt:Date.now()};}
const call=(to:string,data:Hex,b:any)=>rpc('eth_call',[{to,data},b.tag]);
async function quote(direction:ZeroExDirection,amount:bigint,fee:number,b:any){
 const tin=direction==='WBNB->USDT'?W:U,tout=direction==='WBNB->USDT'?U:W;
 const data=encodeFunctionData({abi:quoterAbi,functionName:'quoteExactInputSingle',args:[{tokenIn:tin,tokenOut:tout,amountIn:amount,fee,sqrtPriceLimitX96:0n}]});
 const t=Date.now();const d=decodeFunctionResult({abi:quoterAbi,functionName:'quoteExactInputSingle',data:await call(G.quoter,data,b)}) as readonly [bigint,bigint,number,bigint];
 return {buy:d[0].toString(),ticks:d[2],quoterInnerGas:d[3].toString(),observedAt:Date.now(),latencyMs:Date.now()-t};
}
async function gas(direction:ZeroExDirection,amount:bigint,fee:number,b:any){
 const tin=direction==='WBNB->USDT'?W:U,tout=direction==='WBNB->USDT'?U:W;
 const index=tin===W?3n:1n,allowIndex=tin===W?4n:2n;
 const overrides={[SYN]:{balance:toHex(E)},[tin]:{stateDiff:{[slot(SYN,index)]:word(amount),[nested(SYN,G.router as Address,allowIndex)]:word(amount)}}};
 // Estimate-only token balances/allowances, no approval call or chain mutation.
 const params={tokenIn:tin,tokenOut:tout,fee,recipient:SYN,deadline:BigInt(b.time/1000)+120n,amountIn:amount,amountOutMinimum:1n,sqrtPriceLimitX96:0n};
 const units=await rpc('eth_estimateGas',[{from:SYN,to:G.router,data:encodeFunctionData({abi:routerAbi,functionName:'exactInputSingle',args:[params]})},b.tag,overrides]);
 return BigInt(units).toString();
}
const drift=(a:string,b:string)=>Number((BigInt(a)>BigInt(b)?BigInt(a)-BigInt(b):BigInt(b)-BigInt(a))*1_000_000n/BigInt(a))/100;
async function main(){
 const session=JSON.parse(readFileSync(`${homedir()}/.cache/lovable-auth/session.json`,'utf8')).session;
 const token=session.access_token; if(typeof token!=='string')throw Error('session unavailable');
 const {wallet}=JSON.parse(readFileSync('/tmp/bnb-v19/admin-context.json','utf8'));if(typeof wallet!=='string'||!/^0x[0-9a-f]{40}$/i.test(wallet))throw Error('canonical admin context unavailable');
 if(await rpc('eth_chainId',[])!=='0x38'||await rpc('eth_chainId',[],true)!=='0x38')throw Error('chain');
 const initial=await block(); const identity:any={block:initial,pools:[],tokens:[]};
 for(const a of [W,U]){const decimals=decodeFunctionResult({abi:tokenAbi,functionName:'decimals',data:await call(a,encodeFunctionData({abi:tokenAbi,functionName:'decimals'}),initial)});if(Number(decimals)!==18)throw Error('decimals');identity.tokens.push({address:a,decimals:18,codeHash:keccak256(await rpc('eth_getCode',[a,initial.tag]))});}
 for(const p of pools){const match=decodeFunctionResult({abi:factoryAbi,functionName:'getPool',data:await call(G.factory,encodeFunctionData({abi:factoryAbi,functionName:'getPool',args:[W,U,p.fee]}),initial)});if(String(match).toLowerCase()!==p.pool.toLowerCase())throw Error('pool');const liq=decodeFunctionResult({abi:poolAbi,functionName:'liquidity',data:await call(p.pool,encodeFunctionData({abi:poolAbi,functionName:'liquidity'}),initial)});if(liq===0n)throw Error('liquidity');identity.pools.push({...p,liquidity:String(liq),factory:G.factory,codeHash:keccak256(await rpc('eth_getCode',[p.pool,initial.tag]))});}
 const save=()=>writeFileSync(output,JSON.stringify({generatedAt:new Date().toISOString(),scope:'ARCHIVED_READ_ONLY_RESEARCH',release:'HOLD',execution:false,rwa:'BLOCKED',rpcIndependent:false,limits:COMPARISON_LIMITS,providerRequestCap:15,providerRequests,identity,feeSemantics:'UNVERIFIED: first-party /price schema does not explicitly state whether buyAmount includes fees',nativeOverhead:'UNVERIFIED — ERC20 WBNB comparisons only',calls,attempts,rows},null,2)+'\n');
 for(const size of [5,25,100,500,1000])for(const direction of ['WBNB->USDT','USDT->WBNB'] as const){
  if(rows.some((r:any)=>r.size===size&&r.direction===direction&&r.diagnostics))continue;
  for(let retry=0;retry<2;retry++){
   if(providerRequests>=15){save();return;}
   const before=await block();const ref=await quote('WBNB->USDT',E,500,before);
   const amount=direction==='WBNB->USDT'?BigInt(size)*E*E/BigInt(ref.buy):BigInt(size)*E;
   const pre=await Promise.all(pools.map(p=>quote(direction,amount,p.fee,before)));
   const request={direction,sellAmount:amount.toString()},started=Date.now();providerRequests++;
   let zx:ZeroExPublicResult;
   try{const res=await fetch('http://localhost:8080/api/admin/bnb-0x-price',{method:'POST',signal:AbortSignal.timeout(12_000),headers:{'content-type':'application/json',authorization:`Bearer ${token}`,'x-wallet-address':wallet},body:JSON.stringify(request)});if(res.status!==200){zx={provider:'0x',status:res.status===403?'FORBIDDEN':'UNAUTHORIZED',executable:false};}else{zx=await res.json() as ZeroExPublicResult;}}catch{zx={provider:'0x',status:'NETWORK_ERROR',executable:false};}
   attempts.push({size,direction,retry,request,providerUrl:buildZeroExPriceUrl(request),startedAt:new Date(started).toISOString(),completedAt:new Date().toISOString(),elapsedMs:Date.now()-started,status:zx.status});
   if(zx.status!=='INDICATIVE_UNEXECUTABLE'){rows.push({size,direction,request,status:zx.status,zeroEx:zx});save();if(['FORBIDDEN','UNAUTHORIZED','KEY_MISSING'].includes(zx.status))return;if(['RATE_LIMITED','LOCAL_RATE_LIMITED'].includes(zx.status)&&retry===0){await sleep(60_000);continue;}break;}
   const after=await block(),providerBlock=await block(zx.blockNumber);
   const post=await Promise.all(pools.map(p=>quote(direction,amount,p.fee,after)));
   const gasPrice=BigInt(await rpc('eth_gasPrice',[]));
   const rate=direction==='WBNB->USDT'?BigInt(ref.buy):E;
   const diagnostics=[] as any[];
   for(let i=0;i<pools.length;i++){
    const p=pools[i];if(!p)continue;let gasUnits:string|null=null;try{gasUnits=await gas(direction,amount,p.fee,after);}catch{/* missing gas fences ranking */}
    const d=drift(pre[i].buy,post[i].buy),small=await quote(direction,amount/1000n,p.fee,after);
    const impact=Number((BigInt(small.buy)*1000n-BigInt(post[i].buy))*1_000_000n/(BigInt(small.buy)*1000n))/100;
    const pc:ResearchQuote={id:`pancake-${p.fee}`,provider:`pancake-${p.fee}` as ResearchQuote['provider'],chainId:56,direction,sellAmount:amount.toString(),buyAmount:post[i].buy,fee:'0',feeToken:null,semantics:'INCLUDED',gasWei:gasUnits?(BigInt(gasUnits)*gasPrice).toString():null,gasClass:'SIMULATION',observedAt:post[i].observedAt,blockTime:after.time,block:after.number,latencyMs:post[i].latencyMs,provenance:true,archived:false,reused:false,impactBps:Math.max(0,impact),status:'OK'};
    const zq:ResearchQuote={...pc,id:'0x',provider:'0x',buyAmount:zx.buyAmount??'0',fee:zx.fees?.zeroExFee??'0',feeToken:zx.fees?.feeToken??null,semantics:'UNKNOWN',gasWei:zx.totalNetworkFeeWei??null,gasClass:'PROVIDER_ESTIMATE',observedAt:Date.parse(zx.observedAt??''),blockTime:providerBlock.time,block:providerBlock.number,latencyMs:zx.latencyMs??99999,provenance:zx.simulationIncomplete===false && (zx.fees?.gasFee??'0')==='0',reused:Date.parse(zx.observedAt??'')<started,impactBps:0};
    const evaluatedAt=Date.now();diagnostics.push({poolFee:p.fee,before:pre[i],after:post[i],driftBps:d,impactBps:impact,gasUnits,gasPriceWei:gasPrice.toString(),pancake:pc,zeroEx:zq,evaluatedAt,ranking:rankResearchQuotes([pc,zq],evaluatedAt,rate,d),pancakeNet:userNet(pc,rate)?.toString(),zeroExNetIfIncluded:userNet(zq,rate,'INCLUDED')?.toString(),zeroExNetIfExcluded:userNet(zq,rate,'EXCLUDED')?.toString(),sellFeeExcludedConversion:'average-rate approximation, not exact requote',feeScenarios:[5,10].map(bps=>({bps,proposalOnly:true,feeOut:(BigInt(pc.buyAmount)*BigInt(bps)/10000n).toString(),netBeforeUnknownAdapterExtraGas:(BigInt(pc.buyAmount)-BigInt(pc.buyAmount)*BigInt(bps)/10000n-BigInt(pc.gasWei??'0')*rate/E).toString()}))});
   }
   const final=await block(before.number);const canonical=final.hash===before.hash;
   rows.push({size,direction,request,reference:ref,before,after,providerBlock,canonical,zeroEx:zx,diagnostics,flowBridgeIntegratorBps:0,execution:false});save();break;
  }
  await sleep(6_000);
 }
 save();console.log(JSON.stringify({providerRequests,rows:rows.length,statuses:attempts.map((a:any)=>a.status)}));
}
main().catch(()=>{console.error('Collector blocked; inspect saved evidence if present (no secrets logged).');process.exitCode=1;});