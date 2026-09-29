/** V30.2B P4B.3 — MINT PREFLIGHT ONLY. Fresh live read, exact amounts, eth_call simulations, unsigned calldata. Zero broadcasts. */
import { createPublicClient, http, parseAbi, getAddress, encodeFunctionData, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { writeFileSync } from "node:fs";
import { getSqrtRatioAtTick, swapToTarget, scaleSqrt, amountsForLiquidity, Q96 } from "./v3math.mjs";
const RPC = process.env.BOT_RPC || "https://rpc.botchain.ai";
const POOL = getAddress("0xDaCFc2574b6110892351Bd31afb36F95E7206162"), FLOW = getAddress("0xcaaB50F36252a57529AFeF651fa6B9f9281917fF");
const USDT = getAddress("0xababc7ddc03e501d190c676bf3d92ef0e6e87a3c"), NPM = getAddress("0xDAc3FcFF004d8a8675b94E44941A1a2e3b240090");
const VAULT = getAddress("0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D"), CONTROLLER = getAddress("0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF"), PUBLISHER = getAddress("0x05F7E3eA71093D8224ABB9DE078D1a2e480faB22");
const CAP = 50_000_000n * 10n ** 18n, MEDIUM = [362800, 373000], NARROW = [364600, 371200], SLIP_BPS = 50n;
const A = parseAbi(["function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)","function liquidity() view returns (uint128)","function tickSpacing() view returns (int24)","function token0() view returns (address)","function tickBitmap(int16) view returns (uint256)","function ticks(int24) view returns (uint128,int128,uint256,uint256,int56,uint160,uint32,bool)","function balanceOf(address) view returns (uint256)","function allowance(address,address) view returns (uint256)","function oracle() view returns (address)","function hasRole(bytes32,address) view returns (bool)"]);
const NPM_ABI = parseAbi(["function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) payable returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)"]);
const c = createPublicClient({ transport: http(RPC, { timeout: 30000 }) });
const chainId = await c.getChainId(); if (chainId !== 677) throw new Error("STOP chain");
const key = process.env.DEPLOYER_PRIVATE_KEY; const signer = key ? privateKeyToAccount(key.startsWith("0x") ? key : "0x" + key).address : null;
const bn = await c.getBlockNumber(); const blk = await c.getBlock({ blockNumber: bn });
const r = (addr, fn, args = []) => c.readContract({ address: addr, abi: A, functionName: fn, args, blockNumber: bn });
const s0 = await r(POOL, "slot0"), L0 = await r(POOL, "liquidity"), sp = Number(await r(POOL, "tickSpacing"));
if ((await r(POOL, "token0")).toLowerCase() !== USDT.toLowerCase()) throw new Error("STOP token order");
const sqrtP = s0[0], tick = Number(s0[1]);
const ticks0 = []; for (let w = Math.floor(Math.floor(-887272 / sp) / 256); w <= Math.floor(Math.floor(887272 / sp) / 256); w++) { const bits = await r(POOL, "tickBitmap", [w]); for (let b = 0; b < 256; b++) if ((bits >> BigInt(b)) & 1n) { const t = (w * 256 + b) * sp; const d = await r(POOL, "ticks", [t]); if (d[7]) ticks0.push({ tick: t, liquidityNet: d[1] }); } }
ticks0.sort((a, b) => a.tick - b.tick);
const flowInPool = await r(FLOW, "balanceOf", [POOL]); const newFlow = CAP - flowInPool;
const inside = (g) => g[0] <= tick && tick < g[1] && g[0] % sp === 0 && g[1] % sp === 0;
const spot = 1 / ((Number(sqrtP) / Number(Q96)) ** 2 * 1e-12);
const pos = (rng, flowTarget) => { const a = getSqrtRatioAtTick(rng[0]), b = getSqrtRatioAtTick(rng[1]); const u = amountsForLiquidity(sqrtP, a, b, 10n ** 18n); let dL = flowTarget * 10n ** 18n / u.amount1; let x = amountsForLiquidity(sqrtP, a, b, dL); while (x.amount1 > flowTarget) { dL -= 1n; x = amountsForLiquidity(sqrtP, a, b, dL); } return { range: rng, dL, usdt: x.amount0, flow: x.amount1 }; };
const med = pos(MEDIUM, newFlow / 10n), nar = pos(NARROW, newFlow - newFlow / 10n);
const totalFlow = med.flow + nar.flow, totalUsdt = med.usdt + nar.usdt;
// attack costs
const tickOf = (s) => { let lo = -887272, hi = 887272; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (getSqrtRatioAtTick(m) <= s) lo = m; else hi = m; } return lo; };
const TGT = { flowDown: (p) => scaleSqrt(sqrtP, 100n, BigInt(100 - p)), flowUp: (p) => scaleSqrt(sqrtP, 100n, BigInt(100 + p)) };
const build = (adds) => { let L = L0; const m = new Map(ticks0.map((t) => [t.tick, t.liquidityNet])); for (const { range, dL } of adds) { m.set(range[0], (m.get(range[0]) ?? 0n) + dL); m.set(range[1], (m.get(range[1]) ?? 0n) - dL); if (range[0] <= tick && tick < range[1]) L += dL; } return { L, ticks: [...m].filter(([, v]) => v !== 0n).map(([tick, liquidityNet]) => ({ tick, liquidityNet })).sort((a, b) => a.tick - b.tick) }; };
const usd = (a, isFlow) => (isFlow ? Number(a) / 1e18 * spot : Number(a) / 1e6);
const costs = (adds) => { const st = build(adds); const o = {}; for (const p of [5, 10, 20, 30]) { o[`${p}%`] = {}; for (const dir of ["flowDown", "flowUp"]) { const x = swapToTarget({ sqrtP, tick, L: st.L, ticks: st.ticks, feePips: 10000, target: TGT[dir](p) }); const inFlow = !x.zeroForOne; o[`${p}%`][dir] = x.exhaustedLiquidity ? { exhausted: true } : { usd: +(usd(x.amountInGross, inFlow) - usd(x.amountOut, !inFlow)).toFixed(2), ticksCrossed: x.ticksCrossed, exhausted: false }; } } return o; };
const pre = costs([]), post = costs([med, nar]);
const tUp30 = tickOf(TGT.flowUp(30)), tDn30 = tickOf(TGT.flowDown(30));
const covers30 = (g) => g[0] < tUp30 && g[1] > tDn30;
// staking/router boundary
const oracle = await r(CONTROLLER, "oracle"); const EPOCH = keccak256(toBytes("EPOCH_ROLE")), PUBR = keccak256(toBytes("PUBLISHER_ROLE"));
const epochRole = await r(VAULT, "hasRole", [EPOCH, CONTROLLER]).catch(() => null), pubRole = await r(CONTROLLER, "hasRole", [PUBR, PUBLISHER]).catch(() => null);
// unsigned txs + simulations
const deadline = BigInt(blk.timestamp) + 1800n;
const mk = (p) => ({ token0: USDT, token1: FLOW, fee: 10000, tickLower: p.range[0], tickUpper: p.range[1], amount0Desired: p.usdt, amount1Desired: p.flow, amount0Min: p.usdt * (10000n - SLIP_BPS) / 10000n, amount1Min: p.flow * (10000n - SLIP_BPS) / 10000n, recipient: signer ?? "0x0000000000000000000000000000000000000001", deadline });
const wallet = signer ? { flow: await r(FLOW, "balanceOf", [signer]), usdt: await r(USDT, "balanceOf", [signer]), flowAllow: await r(FLOW, "allowance", [signer, NPM]), usdtAllow: await r(USDT, "allowance", [signer, NPM]) } : null;
const sim = async (p) => { const data = encodeFunctionData({ abi: NPM_ABI, functionName: "mint", args: [mk(p)] }); const out = { to: NPM, value: "0", data, params: mk(p) };
  if (!signer) return { ...out, simulation: "BLOCKED", reason: "no signer configured" };
  try { const res = await c.simulateContract({ account: signer, address: NPM, abi: NPM_ABI, functionName: "mint", args: [mk(p)], blockNumber: bn }); const g = await c.estimateGas({ account: signer, to: NPM, data }); return { ...out, simulation: "PASS", result: res.result, gas: g }; }
  catch (e) { return { ...out, simulation: "BLOCKED", reason: (e.shortMessage || String(e)).slice(0, 300) }; } };
const tx1 = await sim(med), tx2 = await sim(nar);
const checks = { chain677: chainId === 677, poolUnlocked: s0[6], priceInsideMedium: inside(MEDIUM), priceInsideNarrow: inside(NARROW), capRespected: flowInPool + totalFlow <= CAP, mediumCovers30: covers30(MEDIUM), narrowCovers30: covers30(NARROW), post30NotExhausted: !post["30%"].flowDown.exhausted && !post["30%"].flowUp.exhausted, oracleZero: oracle === "0x0000000000000000000000000000000000000000", epochRoleUnassigned: epochRole === false, publisherRoleUnassigned: pubRole === false, tx1Sim: tx1.simulation === "PASS", tx2Sim: tx2.simulation === "PASS" };
const ev = { gate: "V30.2B-P4B.3-MINT-PREFLIGHT", mainnetWrites: 0, block: bn, blockTime: new Date(Number(blk.timestamp) * 1000).toISOString(), tick, sqrtP, spotUsdtPerFlow: spot, activeL: L0, flowInPool, newFlowBudget: newFlow, signer, npm: NPM, wallet,
  medium: { range: MEDIUM, liquidity: med.dL, flow: med.flow, usdt: med.usdt }, narrow: { range: NARROW, liquidity: nar.dL, flow: nar.flow, usdt: nar.usdt }, totalNewFlow: totalFlow, totalNewUsdt: totalUsdt, totalCommittedAfter: flowInPool + totalFlow,
  moveTicks30: { up: tUp30, down: tDn30 }, preCosts: pre, postCosts: post, staking: { oracle, epochRole, pubRole }, unsigned: { tx1, tx2 }, checks, pass: Object.values(checks).every(Boolean) };
writeFileSync(new URL("../P4B3_MINT_PREFLIGHT.json", import.meta.url), JSON.stringify(ev, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
console.log(JSON.stringify({ block: ev.block, tick, signer, wallet, medium: ev.medium, narrow: ev.narrow, totalFlow, totalUsdt, after: ev.totalCommittedAfter, post: post, tx1: { sim: tx1.simulation, reason: tx1.reason, gas: tx1.gas }, tx2: { sim: tx2.simulation, reason: tx2.reason, gas: tx2.gas }, checks }, (k, v) => (typeof v === "bigint" ? v.toString() : v), 1));
