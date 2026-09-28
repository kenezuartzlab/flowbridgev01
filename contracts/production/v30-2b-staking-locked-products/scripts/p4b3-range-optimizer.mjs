/** V30.2B P4B.3 — READ-ONLY. Range-structure optimizer for FLOW/USDT 1%. Exact V3 math on live state, fresh state per candidate. No writes. */
import { createPublicClient, http, parseAbi, getAddress } from "viem";
import { writeFileSync } from "node:fs";
import { getSqrtRatioAtTick, swapToTarget, scaleSqrt, amountsForLiquidity, Q96 } from "./v3math.mjs";
const RPC = process.env.BOT_RPC || "https://rpc.botchain.ai";
const POOL = getAddress("0xDaCFc2574b6110892351Bd31afb36F95E7206162"), FLOW = getAddress("0xcaaB50F36252a57529AFeF651fa6B9f9281917fF");
const A = parseAbi(["function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)","function liquidity() view returns (uint128)","function tickSpacing() view returns (int24)","function tickBitmap(int16) view returns (uint256)","function ticks(int24) view returns (uint128,int128,uint256,uint256,int56,uint160,uint32,bool)","function balanceOf(address) view returns (uint256)"]);
const c = createPublicClient({ chain:{id:677,name:"BOT",nativeCurrency:{name:"BOT",symbol:"BOT",decimals:18},rpcUrls:{default:{http:[RPC]}}}, transport: http(RPC,{timeout:30000}) });
if (await c.getChainId() !== 677) throw new Error("STOP chain");
const bn = await c.getBlockNumber();
const r = (fn,args=[]) => c.readContract({ address: POOL, abi: A, functionName: fn, args, blockNumber: bn });
const s0 = await r("slot0"), L0 = await r("liquidity"), sp = Number(await r("tickSpacing"));
const sqrtP = s0[0], tick = Number(s0[1]);
const ticks0 = []; const minW=Math.floor(Math.floor(-887272/sp)/256), maxW=Math.floor(Math.floor(887272/sp)/256);
for (let w=minW; w<=maxW; w++){ const bits=await r("tickBitmap",[w]); for(let b=0;b<256;b++) if((bits>>BigInt(b))&1n){ const t=(w*256+b)*sp; const d=await r("ticks",[t]); if(d[7]) ticks0.push({tick:t,liquidityNet:d[1]}); } }
ticks0.sort((a,b)=>a.tick-b.tick);
const flowInPool = await c.readContract({ address: FLOW, abi: A, functionName:"balanceOf", args:[POOL], blockNumber: bn });
// token0 USDT(6), token1 FLOW(18). FLOW price down 30% => raw price x 1/0.7 ; up 30% => raw x 1/1.3
const spot = 1/((Number(sqrtP)/Number(Q96))**2*1e-12);
const usd = (a,isFlow)=> isFlow? Number(a)/1e18*spot : Number(a)/1e6;
const TGT = { flowDown: (p)=>scaleSqrt(sqrtP,100n,BigInt(100-p)), flowUp: (p)=>scaleSqrt(sqrtP,100n,BigInt(100+p)) };
const tickOf = (s)=>{ let lo=-887272,hi=887272; while(hi-lo>1){const m=(lo+hi)>>1; if(getSqrtRatioAtTick(m)<=s) lo=m; else hi=m;} return lo; };
const tDown30 = tickOf(TGT.flowDown(30)), tUp30 = tickOf(TGT.flowUp(30));
const fl = (t)=>Math.floor(t/sp)*sp, ce=(t)=>Math.ceil(t/sp)*sp;
const WIDE = [ticks0[0].tick, ticks0[ticks0.length-1].tick];
const NARROW = [fl(tUp30)-sp, ce(tDown30)+sp];            // smallest spacing-aligned range still covering both 30% moves (+1 spacing margin)
const MEDIUM = [fl(tUp30)-10*sp, ce(tDown30)+10*sp];       // ±2000 ticks outside narrow
for (const [a,b] of [WIDE,MEDIUM,NARROW]) if (!(a<tUp30 && b>tDown30)) throw new Error("STOP range does not cover 30%");
const flowPerL = ([a,b]) => { const x=amountsForLiquidity(sqrtP,getSqrtRatioAtTick(a),getSqrtRatioAtTick(b),10n**18n); return x; };
const Lfor = (rng, flow) => { const u=flowPerL(rng); return flow*10n**18n/u.amount1; };
const build = (adds) => { let L=L0; const m=new Map(ticks0.map(t=>[t.tick,t.liquidityNet]));
  for (const {rng,dL} of adds){ m.set(rng[0],(m.get(rng[0])??0n)+dL); m.set(rng[1],(m.get(rng[1])??0n)-dL); if(rng[0]<=tick&&tick<rng[1]) L+=dL; }
  return { L, ticks:[...m].filter(([,v])=>v!==0n).map(([tick,liquidityNet])=>({tick,liquidityNet})).sort((a,b)=>a.tick-b.tick) }; };
const cost = (st,pct,dir) => { const x=swapToTarget({ sqrtP, tick, L: st.L, ticks: st.ticks, feePips:10000, target: TGT[dir](pct) });
  if (x.exhaustedLiquidity) return { usd:null, exhausted:true };
  const inFlow=!x.zeroForOne; return { usd:+(usd(x.amountInGross,inFlow)-usd(x.amountOut,!inFlow)).toFixed(2), feeUsd:+usd(x.feePaid,inFlow).toFixed(2), ticksCrossed:x.ticksCrossed, exhausted:false }; };
const evalC = (adds) => { const st=build(adds); const out={}; let min=Infinity;
  for (const p of [5,10,20,30]){ const d=cost(st,p,"flowDown"), u=cost(st,p,"flowUp"); out[`${p}%`]={ flowDown:d, flowUp:u, minUsd: Math.min(d.usd??-1,u.usd??-1) }; }
  return { costs:out, min30: out["30%"].minUsd, covered: !out["30%"].flowDown.exhausted && !out["30%"].flowUp.exhausted, activeL: st.L.toString() }; };
const splits = [0,10,20,30,40,50,60,70,80,90,100];
const results = [];
for (const capM of [25,50,75,100]) {
  const cap = BigInt(capM)*10n**24n; const add = cap - flowInPool; if (add<=0n) { results.push({capM,blocked:"cap below committed"}); continue; }
  const cand = [];
  cand.push({ structure:"A", split:{wide:100}, adds:[{rng:WIDE, flow:add}] });
  for (const m of splits) cand.push({ structure:"B", split:{wide:100-m,medium:m}, adds:[{rng:WIDE,flow:add*BigInt(100-m)/100n},{rng:MEDIUM,flow:add*BigInt(m)/100n}] });
  for (const m of splits) for (const n of splits) if (m+n<=100 && n>0 && m>0) cand.push({ structure:"C", split:{wide:100-m-n,medium:m,narrow:n}, adds:[{rng:WIDE,flow:add*BigInt(100-m-n)/100n},{rng:MEDIUM,flow:add*BigInt(m)/100n},{rng:NARROW,flow:add*BigInt(n)/100n}] });
  const best = {};
  for (const cd of cand) { // fresh state per candidate: build() starts from immutable live snapshot
    const adds = cd.adds.filter(a=>a.flow>0n).map(a=>({ rng:a.rng, dL:Lfor(a.rng,a.flow), flow:a.flow }));
    const ev = evalC(adds); if (!ev.covered) continue;
    const usdt = adds.reduce((s,a)=>s+amountsForLiquidity(sqrtP,getSqrtRatioAtTick(a.rng[0]),getSqrtRatioAtTick(a.rng[1]),a.dL).amount0,0n);
    const flowUsed = adds.reduce((s,a)=>s+amountsForLiquidity(sqrtP,getSqrtRatioAtTick(a.rng[0]),getSqrtRatioAtTick(a.rng[1]),a.dL).amount1,0n);
    const row = { structure:cd.structure, split:cd.split, additionalFLOW:(Number(flowUsed)/1e18).toFixed(6), additionalUSDT:(Number(usdt)/1e6).toFixed(6), ...ev,
      positions: adds.map(a=>({ range:a.rng, liquidity:a.dL.toString() })) };
    if (!best[cd.structure] || row.min30 > best[cd.structure].min30) best[cd.structure]=row;
  }
  results.push({ capM, committedFLOW:(Number(flowInPool)/1e18).toFixed(6), best });
}
const ev = { gate:"V30.2B-P4B.3", mainnetWrites:0, block:bn.toString(), tick, spotUsdtPerFlow:spot, tickSpacing:sp,
  moveTicks:{ flowUp30:tUp30, flowDown30:tDown30 }, ranges:{ WIDE, MEDIUM, NARROW }, baseline: evalC([]), results };
writeFileSync("../P4B3_RANGE_OPTIMIZER.json", JSON.stringify(ev,(k,v)=>typeof v==="bigint"?v.toString():v,2));
console.log(JSON.stringify({ block:ev.block, tick, ranges:ev.ranges, moveTicks:ev.moveTicks, baseline30: ev.baseline.costs["30%"],
  summary: results.map(x=>({ cap:x.capM, ...Object.fromEntries(Object.entries(x.best||{}).map(([k,v])=>[k,{split:v.split,flow:v.additionalFLOW,usdt:v.additionalUSDT,c5:v.costs["5%"].minUsd,c10:v.costs["10%"].minUsd,c20:v.costs["20%"].minUsd,c30:v.min30,dn30:v.costs["30%"].flowDown.usd,up30:v.costs["30%"].flowUp.usd,x30:v.costs["30%"].flowUp.ticksCrossed}]))})) },null,1));
