/** V30.2B P4B.2 — READ-ONLY. First retained post-cardinality observation, approved-allocation security ceiling, candidate oracle limits. No writes. */
import { createPublicClient, http, parseAbi, parseAbiItem, getAddress } from "viem";
import { writeFileSync } from "node:fs";
import { getSqrtRatioAtTick, swapToTarget, scaleSqrt, amountsForLiquidity, Q96 } from "./v3math.mjs";
const RPC = process.env.BOT_RPC || "https://rpc.botchain.ai";
const POOL = getAddress("0xDaCFc2574b6110892351Bd31afb36F95E7206162");
const FLOW = getAddress("0xcaaB50F36252a57529AFeF651fa6B9f9281917fF");
const CONTROLLER = getAddress("0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF");
const CARD_BLOCK = 24777215n, FEE = 10000, ALLOC = 100_000_000n * 10n ** 18n, WEEK = 604800;
const A = parseAbi(["function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)","function liquidity() view returns (uint128)","function tickSpacing() view returns (int24)","function tickBitmap(int16) view returns (uint256)","function ticks(int24) view returns (uint128,int128,uint256,uint256,int56,uint160,uint32,bool)","function observations(uint256) view returns (uint32,int56,uint160,bool)","function balanceOf(address) view returns (uint256)","function oracle() view returns (address)"]);
const c = createPublicClient({ chain:{id:677,name:"BOT",nativeCurrency:{name:"BOT",symbol:"BOT",decimals:18},rpcUrls:{default:{http:[RPC]}}}, transport: http(RPC,{timeout:30000}) });
if (await c.getChainId() !== 677) throw new Error("STOP chain");
const head = await c.getBlock(); const bn = head.number; const now = Number(head.timestamp);
const r = (fn, args=[]) => c.readContract({ address: POOL, abi: A, functionName: fn, args, blockNumber: bn });
const s0 = await r("slot0"); const L = await r("liquidity"); const sp = Number(await r("tickSpacing"));
const idx = Number(s0[2]), card = Number(s0[3]);
// retained observations
const obs = []; for (let i = 0; i < card; i++) { const o = await r("observations",[BigInt(i)]); if (o[3]) obs.push({ i, ts: Number(o[0]), tickCum: o[1] }); }
const cardTs = Number((await c.getBlock({ blockNumber: CARD_BLOCK })).timestamp);
const post = obs.filter(o => o.ts > cardTs).sort((a,b)=>a.ts-b.ts);
// oracle-writing events since cardinality block
const evs = { swap: parseAbiItem("event Swap(address indexed,address indexed,int256,int256,uint160,uint128,int24)"), mint: parseAbiItem("event Mint(address,address indexed,int24 indexed,int24 indexed,uint128,uint256,uint256)"), burn: parseAbiItem("event Burn(address indexed,int24 indexed,int24 indexed,uint128,uint256,uint256)") };
const writes = []; for (const [k,e] of Object.entries(evs)) for (const l of await c.getLogs({ address: POOL, event: e, fromBlock: CARD_BLOCK+1n, toBlock: bn })) writes.push({ k, block: l.blockNumber.toString() });
const first = post[0] || null;
// ticks
const minW = Math.floor(Math.floor(-887272/sp)/256), maxW = Math.floor(Math.floor(887272/sp)/256);
const ticks = []; for (let w = minW; w <= maxW; w++) { const bits = await r("tickBitmap",[w]); for (let b=0;b<256;b++) if ((bits>>BigInt(b))&1n) { const t=(w*256+b)*sp; const d=await r("ticks",[t]); if (d[7]) ticks.push({ tick:t, liquidityNet:d[1] }); } }
ticks.sort((a,b)=>a.tick-b.tick);
const sqrtP = s0[0], tick = Number(s0[1]); const lower = ticks[0], upper = ticks[ticks.length-1];
// token0 = USDT(6), token1 = FLOW(18)
const spot = 1 / ((Number(sqrtP)/Number(Q96))**2 * 1e-12);
const usd = (amt, isFlow) => isFlow ? Number(amt)/1e18*spot : Number(amt)/1e6;
const sim = (st, pct, dir) => { const f = dir==="up"?100+pct:100-pct; const target = scaleSqrt(st.sqrtP,100n,BigInt(f));
  const x = swapToTarget({ sqrtP: st.sqrtP, tick, L: st.L, ticks: st.ticks, feePips: FEE, target }); const inFlow = !x.zeroForOne;
  return +(usd(x.amountInGross,inFlow)-usd(x.amountOut,!inFlow)).toFixed(2); };
const costs = (st) => Object.fromEntries([5,10,20,30].map(p=>[`${p}%`,{ upUsd: sim(st,p,"up"), downUsd: sim(st,p,"down"), minUsd: Math.min(sim(st,p,"up"),sim(st,p,"down")) }]));
const base = { sqrtP, L, ticks };
const withAdded = (dL) => ({ sqrtP, L: L+dL, ticks: ticks.map(t=>({ ...t, liquidityNet: t.tick===lower.tick?t.liquidityNet+dL:t.tick===upper.tick?t.liquidityNet-dL:t.liquidityNet })) });
const sa = getSqrtRatioAtTick(lower.tick), sb = getSqrtRatioAtTick(upper.tick);
// FLOW already committed = FLOW held by the pool
const flowInPool = await c.readContract({ address: FLOW, abi: A, functionName: "balanceOf", args: [POOL], blockNumber: bn });
const budget = ALLOC - flowInPool;
// max dL such that FLOW for dL (same live range) <= remaining allocation
let lo=0n, hi=L*100000n; while (hi-lo>1n) { const m=(lo+hi)/2n; if (amountsForLiquidity(sqrtP,sa,sb,m).amount1 <= budget) lo=m; else hi=m; }
const dL = lo, add = amountsForLiquidity(sqrtP,sa,sb,dL);
const baseC = costs(base), maxC = costs(withAdded(dL));
// candidate oracle limits from real behavior: price change between consecutive swaps
const swaps = (await c.getLogs({ address: POOL, event: evs.swap, fromBlock: 23854178n, toBlock: bn })).map(l=>({ block:l.blockNumber, tick:Number(l.args[6] ?? l.args.tick) }));
const ts = []; for (const s of swaps) ts.push(Number((await c.getBlock({ blockNumber: s.block })).timestamp));
const moves = []; for (let i=1;i<swaps.length;i++) moves.push(Math.abs(1.0001**(swaps[i].tick-swaps[i-1].tick)-1)*10000);
const gaps = []; for (let i=1;i<ts.length;i++) gaps.push(ts[i]-ts[i-1]);
const q = (a,p) => { const s=[...a].sort((x,y)=>x-y); return s.length? s[Math.min(s.length-1,Math.floor(p*s.length))]:null; };
const oracle = await c.readContract({ address: CONTROLLER, abi: A, functionName: "oracle", blockNumber: bn });
const ev = { gate:"V30.2B-P4B.2", mainnetWrites:0, block:{ number: bn.toString(), timestamp: now, iso: new Date(now*1000).toISOString() },
  cardinality:{ txBlock: CARD_BLOCK.toString(), txTs: cardTs, txIso: new Date(cardTs*1000).toISOString(), observationIndex: idx, observationCardinality: card, observationCardinalityNext: Number(s0[4]), writesSince: writes, retained: obs.map(o=>({i:o.i,ts:o.ts,iso:new Date(o.ts*1000).toISOString()})),
    firstRetainedPost: first && { index:first.i, ts:first.ts, iso:new Date(first.ts*1000).toISOString() }, true7dEarliest: first && new Date((first.ts+WEEK)*1000).toISOString() },
  allocation:{ ceilingFLOW: "100000000", flowAlreadyInPool: (Number(flowInPool)/1e18).toFixed(6), remainingFLOW: (Number(budget)/1e18).toFixed(6), range:[lower.tick,upper.tick], addedL: dL.toString(), multiple: Number(L+dL)/Number(L),
    additionalFLOW: (Number(add.amount1)/1e18).toFixed(6), additionalUSDT: (Number(add.amount0)/1e6).toFixed(6) },
  spotUsdtPerFlow: spot, costsNow: baseC, costsAtMaxApproved: maxC,
  behavior:{ swaps: swaps.length, moveBps:{ p50:q(moves,.5), p90:q(moves,.9), max: Math.max(...moves) }, gapSec:{ p50:q(gaps,.5), p90:q(gaps,.9), max: Math.max(...gaps) } },
  guards:{ oracle, oracleZero: oracle==="0x0000000000000000000000000000000000000000" } };
writeFileSync("../P4B2_OBSERVATION_BUDGET.json", JSON.stringify(ev,(k,v)=>typeof v==="bigint"?v.toString():v,2));
console.log(JSON.stringify(ev,(k,v)=>typeof v==="bigint"?v.toString():v,2));
