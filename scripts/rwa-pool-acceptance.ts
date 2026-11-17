/** Local read-only evidence collector. No wallet client, signer, nonce or send method. */
import { decodeFunctionResult, encodeFunctionData, formatUnits, keccak256, parseUnits, type Abi, type Address, type Hex } from "viem";
import { mkdir, writeFile } from "node:fs/promises";
import { POOL_GATE as G, OFFICIAL_RPC, TEST_USDT_SIZES, PROPOSED_HEALTH, factoryAbi, poolAbi, tokenAbi, quoterAbi, identityFailures, quoteFresh, sizeFailures, validateReadOnlyRequest, type PoolIdentity, type SizeObservation } from "../src/lib/rwa/quoteReadiness";

const out = process.argv[2] ?? "/tmp/rwa-v11/evidence.json";
const calls: { endpoint: string; method: string; params: unknown[]; result?: unknown; error?: string }[] = [];
async function rpc(endpoint: typeof OFFICIAL_RPC[number], method: string, params: unknown[]) {
  validateReadOnlyRequest(endpoint,method,params);
  const record: typeof calls[number] = {endpoint,method,params}; calls.push(record);
  try {
    const r = await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:calls.length,method,params}),signal:AbortSignal.timeout(15000)});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const body = await r.json() as {result?: unknown; error?: {message: string; code: number}};
    if (body.error || body.result === undefined) throw new Error(body.error ? `RPC ${body.error.code}: ${body.error.message}` : "Missing result");
    record.result = method === "eth_getCode" ? {bytes:(String(body.result).length-2)/2, hash:keccak256(body.result as Hex)} : body.result;
    return body.result;
  } catch(e) { record.error = e instanceof Error ? e.message : "RPC failure"; throw e; }
}
async function read(endpoint: typeof OFFICIAL_RPC[number], block: Hex, target: Address, abi: Abi, functionName: string, args?: readonly unknown[]) {
  const data = encodeFunctionData({abi,functionName,args});
  const result = await rpc(endpoint,"eth_call",[{to:target,data},block]);
  return decodeFunctionResult({abi,functionName,data:result as Hex});
}
async function identity(endpoint: typeof OFFICIAL_RPC[number], block: Hex) {
  const code = await Promise.all([G.factory,G.quoter,G.pool,G.xaut,G.usdt,G.router].map(async address => {
    const value = await rpc(endpoint,"eth_getCode",[address,block]) as Hex;
    return {address,bytes:(value.length-2)/2,hash:keccak256(value)};
  }));
  const factoryPool = await read(endpoint,block,G.factory,factoryAbi,"getPool",[G.xaut,G.usdt,G.fee]);
  const pool = Object.fromEntries(await Promise.all(["factory","token0","token1","fee","tickSpacing","slot0","liquidity"].map(async fn => [fn,await read(endpoint,block,G.pool,poolAbi,fn)])));
  const tokens = await Promise.all([G.xaut,G.usdt].map(async address => ({address,decimals:Number(await read(endpoint,block,address,tokenAbi,"decimals")),symbol:String(await read(endpoint,block,address,tokenAbi,"symbol")),totalSupply:String(await read(endpoint,block,address,tokenAbi,"totalSupply"))})));
  return {chainId:Number(BigInt(await rpc(endpoint,"eth_chainId",[]) as Hex)),factoryPool,code,pool,tokens};
}
const stringify = (v: unknown) => JSON.stringify(v,(_,x)=>typeof x === "bigint" ? x.toString() : x,2);
async function collect() {
  const startedAt = new Date().toISOString();
  const base = {schema:1,startedAt,chainId:56,contracts:G,rpcSources:OFFICIAL_RPC,proposal:PROPOSED_HEALTH,executionEnabled:false,transactionsSent:0,signaturesRequested:0,aggregatorAvailability:"UNVERIFIED",tokenTransferBehavior:"UNVERIFIED",feeCollection:"UNVERIFIED"};
  try {
    const block = await rpc(OFFICIAL_RPC[0],"eth_blockNumber",[]) as Hex;
    const header = await rpc(OFFICIAL_RPC[0],"eth_getBlockByNumber",[block,false]) as {hash: string; timestamp: Hex};
    const peerHeader = await rpc(OFFICIAL_RPC[1],"eth_getBlockByNumber",[block,false]) as {hash: string};
    const first = await identity(OFFICIAL_RPC[0],block), peer = await identity(OFFICIAL_RPC[1],block);
    const slot = first.pool.slot0 as readonly [bigint,number,number,number,number,number,boolean];
    const facts: PoolIdentity = {chainId:first.chainId,factoryPool:String(first.factoryPool),factory:String(first.pool.factory),token0:String(first.pool.token0),token1:String(first.pool.token1),fee:Number(first.pool.fee),tickSpacing:Number(first.pool.tickSpacing),xautDecimals:first.tokens[0]?.decimals ?? -1,usdtDecimals:first.tokens[1]?.decimals ?? -1,xautSymbol:first.tokens[0]?.symbol ?? "",usdtSymbol:first.tokens[1]?.symbol ?? "",liquidity:String(first.pool.liquidity),unlocked:slot[6],codesPresent:first.code.every(c=>c.bytes>0),peerAgrees:stringify(first)===stringify(peer),blockCanonical:header.hash===peerHeader.hash};
    const gateFailures = identityFailures(facts);
    const blockTime = new Date(Number(BigInt(header.timestamp))*1000).toISOString();
    const sizes: SizeObservation[] = [];
    // token0 XAUt (6), token1 USDT (18): raw ratio must be adjusted by 10^(6-18).
    const spotUsdtPerXaut = (Number(slot[0])/2**96)**2 * 10**(G.xautDecimals-G.usdtDecimals);
    if (!gateFailures.length) for (const usdtSize of TEST_USDT_SIZES) {
      try {
        const quote = async (tokenIn: Address,tokenOut: Address,amount: bigint,exactOutput=false) => await read(OFFICIAL_RPC[0],block,G.quoter,quoterAbi,exactOutput ? "quoteExactOutputSingle" : "quoteExactInputSingle",[exactOutput ? {tokenIn,tokenOut,amount,fee:500,sqrtPriceLimitX96:0n} : {tokenIn,tokenOut,amountIn:amount,fee:500,sqrtPriceLimitX96:0n}]) as readonly [bigint,bigint,number,bigint];
        const buy = await quote(G.usdt,G.xaut,parseUnits(String(usdtSize),G.usdtDecimals));
        // Matched on-chain size: sell the exact simulated buy output, not scraped gold valuation.
        const sell = await quote(G.xaut,G.usdt,buy[0]);
        const exactBuy = await quote(G.usdt,G.xaut,buy[0],true);
        const exactSell = await quote(G.xaut,G.usdt,parseUnits(String(usdtSize),G.usdtDecimals),true);
        const xaut = Number(formatUnits(buy[0],G.xautDecimals)), returned = Number(formatUnits(sell[0],G.usdtDecimals));
        const ask = usdtSize/xaut, bid = returned/xaut;
        sizes.push({usdtSize,xautInput:formatUnits(buy[0],G.xautDecimals),buyOutput:formatUnits(buy[0],G.xautDecimals),sellOutput:formatUnits(sell[0],G.usdtDecimals),buyGas:Number(buy[3]),sellGas:Number(sell[3]),buyTicks:Number(buy[2]),sellTicks:Number(sell[2]),buyImpactBps:Math.max(0,(ask/spotUsdtPerXaut-1)*10000),sellImpactBps:Math.max(0,(1-bid/spotUsdtPerXaut)*10000),roundTripLossBps:(1-returned/usdtSize)*10000,spreadBps:(ask-bid)/((ask+bid)/2)*10000,exactOutputBuyInput:formatUnits(exactBuy[0],G.usdtDecimals),exactOutputSellInput:formatUnits(exactSell[0],G.xautDecimals)});
      } catch(e) { sizes.push({usdtSize,xautInput:"0",buyOutput:"0",sellOutput:"0",buyGas:0,sellGas:0,buyTicks:0,sellTicks:0,buyImpactBps:0,sellImpactBps:0,roundTripLossBps:0,spreadBps:0,error:e instanceof Error ? e.message : "Quote failed"}); }
    }
    const finalHeader = await rpc(OFFICIAL_RPC[0],"eth_getBlockByNumber",[block,false]) as {hash:string};
    if (finalHeader.hash !== header.hash) gateFailures.push("reorg-during-read");
    const observedAt = new Date().toISOString();
    return {...base,observedAt,blockNumber:Number(BigInt(block)),blockHash:header.hash,blockTime,identity:first,peerIdentity:peer,facts,gateFailures,chainGate:gateFailures.length ? "BLOCKED" : "VERIFIED",spotUsdtPerXaut,sizes,quoteFreshAtCompletion:quoteFresh(observedAt,blockTime,Date.now()),sizeDecisions:sizes.map(s=>({usdtSize:s.usdtSize,failures:sizeFailures(s)})),health:"UNVERIFIED",calls};
  } catch(e) { return {...base,observedAt:new Date().toISOString(),chainGate:"BLOCKED",gateFailures:[e instanceof Error ? e.message : "RPC unavailable"],sizes:[],health:"UNVERIFIED",calls}; }
}
await mkdir(out.slice(0,out.lastIndexOf("/")),{recursive:true});
const evidence = await collect();
await writeFile(out,stringify(evidence)+"\n");
console.log(stringify({output:out,chainGate:evidence.chainGate,gateFailures:evidence.gateFailures,sizes:evidence.sizes,readCalls:calls.length,transactionsSent:0}));