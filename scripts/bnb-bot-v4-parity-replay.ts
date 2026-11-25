/** READ-ONLY provenance replay for the BOT V4 vs BNB V1.13 parity review. eth_call/eth_getCode at pinned blocks only; no transactions. */
import { createPublicClient, http, keccak256, parseAbi, decodeAbiParameters } from 'viem';
import { writeFileSync } from 'node:fs';
import { OFFICIAL_RPC, POOL_GATE as G, quoterAbi } from '../src/lib/rwa/quoteReadiness';
const W='0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',U='0x55d398326f99059fF775485246999027B3197955',ROUTER='0x1b81D678ffb9C0263b24A97847620C99d213eB14';
const erc=parseAbi(['function decimals() view returns (uint8)','function symbol() view returns (string)']);
const fac=parseAbi(['function getPool(address,address,uint24) view returns (address)']);
const pAbi=parseAbi(['function token0() view returns (address)','function token1() view returns (address)','function liquidity() view returns (uint128)','function fee() view returns (uint24)']);
const out:any={generatedAt:new Date().toISOString(),scope:'read-only eth_call at pinned blocks; no transactions; not a deployment; not an audit',bnb:{},bot:{}};
async function bnb(){const c=createPublicClient({transport:http(OFFICIAL_RPC[0],{timeout:20000})});const blk=await c.getBlock();const bn=blk.number;
 out.bnb={rpc:OFFICIAL_RPC[0],chainId:await c.getChainId(),block:{number:bn.toString(),hash:blk.hash,timestamp:Number(blk.timestamp)},
  codeKeccak:{WBNB:keccak256((await c.getCode({address:W,blockNumber:bn}))!),USDT:keccak256((await c.getCode({address:U,blockNumber:bn}))!),ROUTER:keccak256((await c.getCode({address:ROUTER,blockNumber:bn}))!)},
  decimals:{WBNB:await c.readContract({address:W,abi:erc,functionName:'decimals',blockNumber:bn}),USDT:await c.readContract({address:U,abi:erc,functionName:'decimals',blockNumber:bn})},tiers:[]};
 for(const tier of [500,2500]){const pool=await c.readContract({address:G.factory as any,abi:fac,functionName:'getPool',args:[W,U,tier],blockNumber:bn});
  const r=(f:any)=>c.readContract({address:pool,abi:pAbi,functionName:f,blockNumber:bn}) as any;
  const raw=await c.call({to:pool,data:'0x3850c7bd',blockNumber:bn}); // slot0(); Pancake V3 feeProtocol is uint32 (Uniswap uint8) — decode only words 0..1
  const [sqrtP,tick]=decodeAbiParameters([{type:'uint160'},{type:'int24'}],raw.data!) as [bigint,number];
  const t0=(await r('token0')) as string; const amountIn=10n**16n;
  const q=await c.simulateContract({address:G.quoter as any,abi:quoterAbi,functionName:'quoteExactInputSingle',args:[{tokenIn:W,tokenOut:U,amountIn,fee:tier,sqrtPriceLimitX96:0n}] as any,blockNumber:bn}).then((x:any)=>x.result[0] as bigint).catch((e:any)=>'UNKNOWN: '+String(e.shortMessage??e).slice(0,120));
  // both 18 dp on BSC: price token1/token0 = (sqrtP/2^96)^2
  const p=Number(sqrtP)/2**96, spot01=p*p; const usdtPerBnb=t0.toLowerCase()===U.toLowerCase()?1/spot01:spot01;
  const spotOut=0.01*usdtPerBnb; const quoted=typeof q==='bigint'?Number(q)/1e18:null;
  out.bnb.tiers.push({tier,pool,factory:G.factory,token0:t0,token1:await r('token1'),feeField:await r('fee'),liquidity:(await r('liquidity')).toString(),poolCodeKeccak:keccak256((await c.getCode({address:pool,blockNumber:bn}))!),
   slot0:{rawWords:(raw.data!.length-2)/64,sqrtPriceX96:sqrtP.toString(),tick},spotUsdtPerBnb:usdtPerBnb,quoterOut_0_01_BNB:typeof q==='bigint'?q.toString():q,spotOut_0_01_BNB:spotOut,quoteVsSpotBps:quoted===null?null:Math.round((spotOut-quoted)/spotOut*1e4*100)/100});}
 out.bnb.historicalArchive='UNKNOWN — public dataseed is non-archive; only the head block was read.';}
async function bot(){const c=createPublicClient({transport:http('https://rpc.botchain.ai',{timeout:20000})});const blk=await c.getBlock();const bn=blk.number;
 const WB='0xd5452816194a3784dba983426cce7c122f4abd30',UB='0xababc7ddc03e501d190c676bf3d92ef0e6e87a3c',V4='0x79653140D84B78C19354ee984f236Ec92160fc61';
 out.bot={rpc:'https://rpc.botchain.ai',chainId:await c.getChainId(),block:{number:bn.toString(),hash:blk.hash,timestamp:Number(blk.timestamp)},
  decimals:{WBOT:await c.readContract({address:WB,abi:erc,functionName:'decimals',blockNumber:bn}),USDT:await c.readContract({address:UB,abi:erc,functionName:'decimals',blockNumber:bn})},
  routerV4CodeKeccak:keccak256((await c.getCode({address:V4,blockNumber:bn}))!),
  note:'BOT fork replay of swaps not run here: Router V4 forge fork tests require BOT archive RPC; marked UNKNOWN. Identity proven in bot-v4-identity.json.'};}
for(const [n,f] of [['bnb',bnb],['bot',bot]] as const){try{await f();}catch(e){out[n]={status:'UNKNOWN',error:String(e).slice(0,300)};}}
writeFileSync('docs/security/bnb-bot-v4-parity/read-only-replay.json',JSON.stringify(out,(k,v)=>typeof v==='bigint'?v.toString():v,2)+'\n');console.log(JSON.stringify(out,(k,v)=>typeof v==='bigint'?v.toString():v,1));
