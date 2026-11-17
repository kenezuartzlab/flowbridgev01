/** Fixed local read-only BNB route collector; no wallet, key, nonce or execution transport. */
import { encodeFunctionData, decodeFunctionData, decodeFunctionResult, parseAbi, keccak256, formatUnits, type Abi, type Hex, type Address } from 'viem';
import { mkdir, writeFile } from 'node:fs/promises';
import { BNB_ASSETS } from '../src/lib/bnb/quoteAdapter';
import { POOL_GATE as G, OFFICIAL_RPC, factoryAbi, poolAbi, tokenAbi, quoterAbi, quoteFresh } from '../src/lib/rwa/quoteReadiness';
const W = BNB_ASSETS.WBNB.address, U = G.usdt;
const router = '0x10ED43C718714eb63d5aA57B78B54704E256024E' as const;
const routerAbi = parseAbi(['function WETH() view returns (address)']);
const discovered = new Set<string>();
const calls: { endpoint:string; method:string; params:unknown[]; result?:unknown; error?:string }[] = [];
const equal = (a:unknown,b:unknown) => String(a).toLowerCase() === String(b).toLowerCase();
function validate(endpoint:string,method:string,params:unknown[]) {
  if (!OFFICIAL_RPC.some(e=>e===endpoint) || !['eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getCode','eth_call'].includes(method)) throw new Error('Forbidden endpoint/method');
  if (method === 'eth_chainId' || method === 'eth_blockNumber') { if(params.length) throw new Error('Unexpected parameters'); return; }
  if (method === 'eth_getBlockByNumber') { if(params.length !== 2 || !/^0x[\da-f]+$/i.test(String(params[0])) || params[1] !== false) throw new Error('Invalid block request'); return; }
  const target = method === 'eth_call' ? (params[0] as {to?:string})?.to : String(params[0]);
  if (!target || ![G.factory,G.quoter,W,U,router].some(a=>equal(a,target)) && !discovered.has(target.toLowerCase())) throw new Error('Unknown observation target');
  if(params.length !== 2 || !/^0x[\da-f]+$/i.test(String(params[1]))) throw new Error('Unpinned request');
  if (method === 'eth_getCode') return;
  const call = params[0] as {to:string;data:Hex};
  if(Object.keys(call).some(k=>!['to','data'].includes(k))) throw new Error('Forbidden call fields');
  const abi = equal(target,G.factory) ? factoryAbi : equal(target,G.quoter) ? quoterAbi : equal(target,router) ? routerAbi : equal(target,W) || equal(target,U) ? tokenAbi : poolAbi;
  const d = decodeFunctionData({abi,data:call.data});
  if(equal(target,G.factory)) {
    const a=d.args as readonly [string,string,number];
    if(!equal(a[0],W) || !equal(a[1],U) || ![500,2500].includes(Number(a[2]))) throw new Error('Unlisted factory request');
  }
  if(equal(target,G.quoter)) {
    const a=(d.args as readonly [{tokenIn:string;tokenOut:string;amountIn:bigint;fee:number;sqrtPriceLimitX96:bigint}])[0];
    const pair = equal(a.tokenIn,W)&&equal(a.tokenOut,U) || equal(a.tokenIn,U)&&equal(a.tokenOut,W);
    if(d.functionName !== 'quoteExactInputSingle' || !pair || ![500,2500].includes(a.fee) || a.sqrtPriceLimitX96 !== 0n || a.amountIn <= 0n || a.amountIn > (equal(a.tokenIn,U) ? 25n*10n**18n : 1n*10n**18n)) throw new Error('Unlisted quote');
  }
}
async function rpc(endpoint:typeof OFFICIAL_RPC[number],method:string,params:unknown[]) {
  validate(endpoint,method,params);
  const record:typeof calls[number]={endpoint,method,params}; calls.push(record);
  try {
    const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:calls.length,method,params}),signal:AbortSignal.timeout(15000)});
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const j=await r.json() as {result?:unknown;error?:{code:number;message:string}};
    if(j.error || j.result === undefined) throw new Error(j.error ? `RPC ${j.error.code}` : 'Missing RPC result');
    record.result=method==='eth_getCode' ? {bytes:(String(j.result).length-2)/2,hash:keccak256(j.result as Hex)} : j.result;
    return j.result;
  } catch(e) {record.error=e instanceof Error?e.message:'RPC failure';throw e;}
}
async function read(ep:typeof OFFICIAL_RPC[number],block:Hex,to:Address,abi:Abi,functionName:string,args?:readonly unknown[]) {
  return decodeFunctionResult({abi,functionName,data:await rpc(ep,'eth_call',[{to,data:encodeFunctionData({abi,functionName,args})},block]) as Hex});
}
const stringify=(v:unknown)=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x,2);
async function collect() {
  const base={schema:1,pair:'WBNB/USDT',nativeBnbQuote:false,startedAt:new Date().toISOString(),executionEnabled:false,provider:'PancakeSwap V3 AMM simulation',rpcSources:OFFICIAL_RPC};
  try {
    const block=await rpc(OFFICIAL_RPC[0],'eth_blockNumber',[]) as Hex;
    const headers=await Promise.all(OFFICIAL_RPC.map(ep=>rpc(ep,'eth_getBlockByNumber',[block,false]))) as {hash:string;timestamp:Hex}[];
    const h=headers[0]; if(!h || headers[1]?.hash!==h.hash) throw new Error('Peer block mismatch');
    const blockTime=new Date(Number(BigInt(h.timestamp))*1000).toISOString();
    const identities=await Promise.all(OFFICIAL_RPC.map(async ep=>({chain:Number(BigInt(await rpc(ep,'eth_chainId',[]) as Hex)),wrapped:String(await read(ep,block,router,routerAbi,'WETH')),codes:await Promise.all([G.factory,G.quoter,W,U,router].map(async to=>({to,code:await rpc(ep,'eth_getCode',[to,block])}))),tokens:await Promise.all([W,U].map(async to=>({to,decimals:Number(await read(ep,block,to,tokenAbi,'decimals')),symbol:String(await read(ep,block,to,tokenAbi,'symbol'))})))})));
    const id=identities[0]; if(!id || stringify(id)!==stringify(identities[1]) || id.chain!==56 || !equal(id.wrapped,W) || id.codes.some(c=>c.code==='0x') || id.tokens.some(t=>t.decimals!==18) || id.tokens[0]?.symbol!=='WBNB' || id.tokens[1]?.symbol!=='USDT') throw new Error('Code/metadata/wrapped identity gate failed');
    const pools=[];
    for(const fee of [500,2500]) {
      const address=String(await read(OFFICIAL_RPC[0],block,G.factory,factoryAbi,'getPool',[W,U,fee]));
      const peerAddress=String(await read(OFFICIAL_RPC[1],block,G.factory,factoryAbi,'getPool',[W,U,fee]));
      if(!equal(address,peerAddress)) throw new Error('Factory peer mismatch');
      if(equal(address,'0x0000000000000000000000000000000000000000')) {pools.push({fee,state:'BLOCKED',reason:'No factory pool'});continue;}
      if(!/^0x[\da-f]{40}$/i.test(address)) throw new Error('Malformed factory pool');
      // The only dynamic target is returned by this fixed factory/token/fee call; verify before quoting.
      discovered.add(address.toLowerCase());
      const observations=await Promise.all(OFFICIAL_RPC.map(async ep=>({code:await rpc(ep,'eth_getCode',[address,block]),fields:Object.fromEntries(await Promise.all(['factory','token0','token1','fee','tickSpacing','liquidity','slot0'].map(async fn=>[fn,await read(ep,block,address as Address,poolAbi,fn)])))})));
      const o=observations[0]; if(!o || stringify(o)!==stringify(observations[1]) || o.code==='0x' || !equal(o.fields.factory,G.factory) || !equal(o.fields.token0,U) || !equal(o.fields.token1,W) || Number(o.fields.fee)!==fee || Number(o.fields.tickSpacing)!==(fee===500?10:50) || BigInt(String(o.fields.liquidity))<=0n || (o.fields.slot0 as unknown[])[6]!==true) throw new Error('Exact pool peer/identity/liquidity gate failed');
      const quote=async(tokenIn:Address,tokenOut:Address,amountIn:bigint)=>await read(OFFICIAL_RPC[0],block,G.quoter,quoterAbi,'quoteExactInputSingle',[{tokenIn,tokenOut,amountIn,fee,sqrtPriceLimitX96:0n}]) as readonly [bigint,bigint,number,bigint];
      try {
        const buy=await quote(U,W,25n*10n**18n); const sell=await quote(W,U,buy[0]);
        pools.push({fee,pool:address,state:'VERIFIED_READ_ONLY_AT_COLLECTION',observations:observations.map(o=>({fields:o.fields,code:{bytes:(String(o.code).length-2)/2,hash:keccak256(o.code as Hex)}})),usdtInput:'25',wbnbOutput:formatUnits(buy[0],18),matchedUsdtOutput:formatUnits(sell[0],18),buyGas:String(buy[3]),sellGas:String(sell[3]),buyTicks:buy[2],sellTicks:sell[2],indicativeRoundTripLossBps:(1-Number(formatUnits(sell[0],18))/25)*10000});
      }catch(e){pools.push({fee,pool:address,state:'BLOCKED',reason:e instanceof Error?e.message:'Quote failure'});}
    }
    const final=await rpc(OFFICIAL_RPC[0],'eth_getBlockByNumber',[block,false]) as {hash:string};
    if(final.hash!==h.hash) throw new Error('Reorg during read');
    const observedAt=new Date().toISOString();
    return {...base,state:'READ_ONLY_OBSERVATION',blockNumber:Number(BigInt(block)),blockHash:h.hash,blockTime,observedAt,freshAtCompletion:quoteFresh(observedAt,blockTime,Date.now()),identity:identities.map(i=>({...i,codes:i.codes.map(c=>({to:c.to,bytes:(String(c.code).length-2)/2,hash:keccak256(c.code as Hex)}))})),pools,calls};
  }catch(e){return {...base,state:'BLOCKED',observedAt:new Date().toISOString(),reason:e instanceof Error?e.message:'RPC unavailable',calls};}
}
const out=process.argv[2]??'/tmp/bnb-v12/core-rpc.json';
await mkdir(out.slice(0,out.lastIndexOf('/')),{recursive:true});
const evidence=await collect(); await writeFile(out,stringify(evidence)+'\n');
console.log(stringify({output:out,state:evidence.state,calls:calls.length,...('pools' in evidence ? {block:evidence.blockNumber,pools:evidence.pools}: {reason:evidence.reason})}));