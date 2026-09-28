/**
 * V30.2B P4A.3 (exact liquidity-security threshold) + P4B (7-day oracle
 * readiness) — READ-ONLY runner. Zero writes, no signing key used.
 *   bun contracts/production/v30-2b-staking-locked-products/scripts/p4a3-p4b-runner.mjs
 */
import { createPublicClient, http, parseAbi, getAddress } from "viem";
import { writeFileSync } from "node:fs";
import { getSqrtRatioAtTick, swapToTarget, scaleSqrt, amountsForLiquidity, Q96 } from "./v3math.mjs";

const RPC = process.env.BOT_RPC || "https://rpc.botchain.ai";
const FLOW = getAddress("0xcaaB50F36252a57529AFeF651fa6B9f9281917fF");
const USDT = getAddress("0xababc7ddc03e501d190c676bf3d92ef0e6e87a3c");
const V3_FACTORY = getAddress("0x1C51c173323ec11BB4e3C4fD2314c225Dc4b5419");
const V3_QUOTER = getAddress("0x034A705b36067cFF99AbF5C662BE881cbd8D0176");
const CONTROLLER = getAddress("0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF");
const EXPECTED_POOL = "0xdacfc2574b6110892351bd31afb36f95e7206162";
const FEE = 10000;
const P4B_EARLIEST = Date.parse("2026-09-27T04:36:39Z") / 1000;
const ZERO = "0x0000000000000000000000000000000000000000";

const POOL_ABI = parseAbi([
  "function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)",
  "function token0() view returns (address)", "function token1() view returns (address)",
  "function fee() view returns (uint24)", "function liquidity() view returns (uint128)",
  "function tickSpacing() view returns (int24)",
  "function tickBitmap(int16) view returns (uint256)",
  "function ticks(int24) view returns (uint128 liquidityGross,int128 liquidityNet,uint256,uint256,int56,uint160,uint32,bool initialized)",
  "function observe(uint32[]) view returns (int56[],uint160[])",
  "function observations(uint256) view returns (uint32,int56,uint160,bool)",
  "function balanceOf(address) view returns (uint256)",
]);
const ERC20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"]);
const FACTORY_ABI = parseAbi(["function getPool(address,address,uint24) view returns (address)"]);
const QUOTER_ABI = parseAbi(["function quoteExactInputSingle((address,address,uint256,uint24,uint160)) returns (uint256,uint160,uint32,uint256)"]);
const CTRL_ABI = parseAbi(["function oracle() view returns (address)", "function weeklyUsdBudget8() view returns (uint256)"]);

const client = createPublicClient({ chain: { id: 677, name: "BOT", nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }, transport: http(RPC) });
const checks = []; const ok = (n, p, d) => checks.push({ name: n, pass: !!p, detail: d });
const halt = (m) => { throw new Error("STOP: " + m); };

// Fresh state read pinned to a single block.
async function readState(blockNumber) {
  const r = (fn, args = []) => client.readContract({ address: pool, abi: POOL_ABI, functionName: fn, args, blockNumber });
  const [t0, t1, fee, L, s0, spacing] = await Promise.all([r("token0"), r("token1"), r("fee"), r("liquidity"), r("slot0"), r("tickSpacing")]);
  const sp = Number(spacing);
  const minW = Math.floor(Math.floor(-887272 / sp) / 256), maxW = Math.floor(Math.floor(887272 / sp) / 256);
  const words = await Promise.all(Array.from({ length: maxW - minW + 1 }, (_, i) => r("tickBitmap", [minW + i])));
  const tickIdx = [];
  words.forEach((w, i) => { for (let b = 0; b < 256; b++) if ((w >> BigInt(b)) & 1n) tickIdx.push(((minW + i) * 256 + b) * sp); });
  const tickData = await Promise.all(tickIdx.map((t) => r("ticks", [t])));
  const ticks = tickIdx.map((t, i) => ({ tick: t, liquidityGross: tickData[i][0], liquidityNet: tickData[i][1], initialized: tickData[i][7] })).filter((t) => t.initialized).sort((a, b) => a.tick - b.tick);
  return { token0: t0, token1: t1, fee: Number(fee), L, sqrtP: s0[0], tick: Number(s0[1]), obsIndex: Number(s0[2]), card: Number(s0[3]), cardNext: Number(s0[4]), unlocked: s0[6], spacing: sp, ticks };
}
let pool;

async function main() {
  const ev = { gate: "V30.2B-P4A.3+P4B", mainnetWrites: 0, rpc: RPC };
  ok("chain id 677", (await client.getChainId()) === 677);
  const block = await client.getBlock();
  ev.block = { number: Number(block.number), timestamp: Number(block.timestamp), iso: new Date(Number(block.timestamp) * 1000).toISOString() };
  pool = await client.readContract({ address: V3_FACTORY, abi: FACTORY_ABI, functionName: "getPool", args: [FLOW, USDT, FEE], blockNumber: block.number });
  ok("pool resolved from verified factory (FLOW, USDT, 10000)", pool.toLowerCase() === EXPECTED_POOL, pool);
  if (pool.toLowerCase() !== EXPECTED_POOL) halt("pool identity differs");

  const st = await readState(block.number);
  const flowIs0 = st.token0.toLowerCase() === FLOW.toLowerCase();
  ok("canonical token pair", new Set([st.token0, st.token1].map((a) => a.toLowerCase())).has(USDT.toLowerCase()) && (flowIs0 || st.token1.toLowerCase() === FLOW.toLowerCase()), [st.token0, st.token1]);
  ok("fee 10000", st.fee === FEE, st.fee);
  const dec = { [FLOW.toLowerCase()]: 18, [USDT.toLowerCase()]: Number(await client.readContract({ address: USDT, abi: ERC20, functionName: "decimals" })) };
  const d0 = dec[st.token0.toLowerCase()], d1 = dec[st.token1.toLowerCase()];
  // raw price token1/token0 -> USDT per FLOW
  const raw = (s) => (Number(s) / Number(Q96)) ** 2;
  const usdtPerFlow = (s) => { const p = raw(s) * 10 ** (d0 - d1); return flowIs0 ? p : 1 / p; };
  const spot = usdtPerFlow(st.sqrtP);

  // Liquidity sanity: sum of liquidityNet up to current tick == active L
  let acc = 0n; for (const t of st.ticks) if (t.tick <= st.tick) acc += t.liquidityNet;
  ok("tick-bitmap reconstruction reproduces active liquidity", acc === st.L, { reconstructed: acc.toString(), live: st.L.toString() });
  if (acc !== st.L) halt("V3 liquidity reconstruction inconsistent");
  const lower = st.ticks[0], upper = st.ticks[st.ticks.length - 1];
  const rangeUsdt = [usdtPerFlow(getSqrtRatioAtTick(lower.tick)), usdtPerFlow(getSqrtRatioAtTick(upper.tick))].sort((a, b) => a - b);
  const inRange = st.tick >= lower.tick && st.tick < upper.tick;
  ok("price inside LP range", inRange, { tick: st.tick, lower: lower.tick, upper: upper.tick });
  const [bal0, bal1] = await Promise.all([st.token0, st.token1].map((t) => client.readContract({ address: t, abi: ERC20, functionName: "balanceOf", args: [pool], blockNumber: block.number })));
  const active = amountsForLiquidity(st.sqrtP, getSqrtRatioAtTick(lower.tick), getSqrtRatioAtTick(upper.tick), st.L);
  ev.pool = {
    address: pool, token0: st.token0, token1: st.token1, decimals: [d0, d1], tick: st.tick, sqrtPriceX96: st.sqrtP.toString(),
    activeLiquidity: st.L.toString(), tickSpacing: st.spacing, observationIndex: st.obsIndex, observationCardinality: st.card, observationCardinalityNext: st.cardNext,
    spotUsdtPerFlow: spot, inRange,
    initializedTicks: st.ticks.map((t) => ({ tick: t.tick, liquidityNet: t.liquidityNet.toString() })),
    lpRangeTicks: [lower.tick, upper.tick], lpRangeUsdtPerFlow: rangeUsdt,
    activePositionTokens: { [flowIs0 ? "FLOW" : "USDT"]: fmt(active.amount0, d0), [flowIs0 ? "USDT" : "FLOW"]: fmt(active.amount1, d1) },
    poolTokenBalances: { token0: fmt(bal0, d0), token1: fmt(bal1, d1), note: "includes uncollected fees/protocol dust; active-position amounts above are authoritative" },
  };

  // ── P4A.3 manipulation cost (exact, fresh reset per target) ───────────
  const flowUsd = (amt, isFlow, decimals) => Number(amt) / 10 ** decimals * (isFlow ? spot : 1);
  const simulate = (state, pct, dir) => {
    // dir "up": FLOW price +pct; "down": FLOW price -pct. Fresh copy each time (fork reset).
    const s = { ...state, ticks: state.ticks.map((t) => ({ ...t })) };
    const factor = dir === "up" ? 100 + pct : 100 - pct;
    // raw price scales with FLOW price if FLOW is token0, inversely otherwise
    const target = flowIs0 ? scaleSqrt(s.sqrtP, BigInt(factor), 100n) : scaleSqrt(s.sqrtP, 100n, BigInt(factor));
    const r = swapToTarget({ sqrtP: s.sqrtP, tick: s.tick, L: s.L, ticks: s.ticks, feePips: FEE, target });
    const inIsFlow = r.zeroForOne === flowIs0; // zeroForOne pays token0
    const inDec = r.zeroForOne ? d0 : d1, outDec = r.zeroForOne ? d1 : d0;
    const grossInUsd = flowUsd(r.amountInGross, inIsFlow, inDec), outUsd = flowUsd(r.amountOut, !inIsFlow, outDec);
    return {
      direction: dir === "up" ? `FLOW +${pct}% (buy FLOW with USDT)` : `FLOW -${pct}% (sell FLOW for USDT)`,
      inputToken: inIsFlow ? "FLOW" : "USDT", grossInput: fmt(r.amountInGross, inDec), netInput: fmt(r.amountInNet, inDec),
      poolFeePaid: fmt(r.feePaid, inDec), outputToken: inIsFlow ? "USDT" : "FLOW", grossOutput: fmt(r.amountOut, outDec),
      grossInputUsd: round(grossInUsd), netCostUsdAtStartSpot: round(grossInUsd - outUsd),
      endTick: null, endPriceUsdtPerFlow: usdtPerFlow(r.endSqrt), ticksCrossed: r.ticksCrossed,
      staysInsideActiveRange: !r.exhaustedLiquidity && r.endSqrt > getSqrtRatioAtTick(lower.tick) && r.endSqrt < getSqrtRatioAtTick(upper.tick),
      _raw: r,
    };
  };
  const table = (state) => Object.fromEntries([5, 10, 20, 30].map((p) => [`${p}%`, { up: simulate(state, p, "up"), down: simulate(state, p, "down") }]));
  const now = table(st);

  // Quoter parity: feed exact gross input into the live QuoterV2; output and ending sqrtPrice must match.
  let parity = true; const parityRows = [];
  for (const p of ["5%", "10%", "20%", "30%"]) for (const dir of ["up", "down"]) {
    const x = now[p][dir]._raw;
    const tin = x.zeroForOne ? st.token0 : st.token1, tout = x.zeroForOne ? st.token1 : st.token0;
    const q = (await client.simulateContract({ address: V3_QUOTER, abi: QUOTER_ABI, functionName: "quoteExactInputSingle", args: [[tin, tout, x.amountInGross, FEE, 0n]], blockNumber: block.number })).result;
    const outDiff = q[0] > x.amountOut ? q[0] - x.amountOut : x.amountOut - q[0];
    const sqrtRel = Math.abs(Number(q[1] - x.endSqrt)) / Number(x.endSqrt);
    const outRel = Number(outDiff) / Number(x.amountOut || 1n); const match = outRel < 1e-8 && sqrtRel < 1e-8;
    parity &&= match; parityRows.push({ move: p, dir, quoterOut: q[0].toString(), mathOut: x.amountOut.toString(), outRelDiff: Number(outDiff) / Number(x.amountOut || 1n), sqrtRelDiff: sqrtRel, match });
  }
  ok("exact V3 math parity with live QuoterV2 (8 moves, both directions)", parity, parityRows.filter((r) => !r.match));
  if (!parity) halt("V3 math cannot be reproduced");
  const strip = (t) => JSON.parse(JSON.stringify(t, (k, v) => (k === "_raw" ? undefined : typeof v === "bigint" ? v.toString() : v)));
  ev.manipulation = { baseline: strip(now), quoterParity: parityRows };

  // ── Required liquidity sensitivity (same range, current price) ─────────
  const cost30 = (state) => { const t = { up: simulate(state, 30, "up"), down: simulate(state, 30, "down") }; return { t, min: Math.min(t.up.netCostUsdAtStartSpot, t.down.netCostUsdAtStartSpot) }; };
  const withAdded = (dL) => ({ ...st, L: st.L + dL, ticks: st.ticks.map((t) => ({ ...t, liquidityNet: t.tick === lower.tick ? t.liquidityNet + dL : t.tick === upper.tick ? t.liquidityNet - dL : t.liquidityNet })) });
  const base30 = cost30(st).min;
  const targets = {};
  for (const target of [1000, 2500, 5000, 10000]) {
    // bisection on dL (cost is monotone in L)
    let lo = 0n, hi = st.L * 4096n;
    for (let i = 0; i < 200 && hi - lo > 1n; i++) { const mid = (lo + hi) / 2n; if (cost30(withAdded(mid)).min < target) lo = mid; else hi = mid; }
    const dL = hi, s2 = withAdded(dL);
    const add = amountsForLiquidity(st.sqrtP, getSqrtRatioAtTick(lower.tick), getSqrtRatioAtTick(upper.tick), dL);
    targets[`$${target}`] = {
      requiredActiveLiquidity: (st.L + dL).toString(), multipleOfCurrent: Number(st.L + dL) / Number(st.L),
      additionalFLOW: fmt(flowIs0 ? add.amount0 : add.amount1, 18), additionalUSDT: fmt(flowIs0 ? add.amount1 : add.amount0, dec[USDT.toLowerCase()]),
      recomputedCosts: Object.fromEntries(Object.entries(strip(table(s2))).map(([k, v]) => [k, { upUsd: v.up.netCostUsdAtStartSpot, downUsd: v.down.netCostUsdAtStartSpot }])),
    };
  }
  ev.requiredLiquidity = { basis: "30% move, cheaper direction, net attacker cost at start spot; liquidity added to the same live range at the current price", current30MoveCostUsd: base30, targets };
  const classification = inRange && parity ? "ORACLE_THRESHOLD_CANDIDATE_MATH_READY" : "BLOCKED";

  // ── P4B: TWAP reconstruction from real observations only ───────────────
  const obsAt = (i) => client.readContract({ address: pool, abi: POOL_ABI, functionName: "observations", args: [BigInt(i)], blockNumber: block.number });
  const oldestIdx = (st.obsIndex + 1) % st.card;
  let oldest = await obsAt(oldestIdx); if (!oldest[3]) oldest = await obsAt(0);
  const coverage = Number(block.timestamp) - Number(oldest[0]);
  const windows = { "30m": 1800, "6h": 21600, "7d": 604800 };
  const twap = {};
  for (const [label, secs] of Object.entries(windows)) {
    if (st.card <= 1) { twap[label] = { status: "WARMING", reason: `observationCardinality=${st.card}: only one observation slot; history is overwritten every block with a swap, no multi-observation window can be reproduced` }; continue; }
    if (coverage < secs) { twap[label] = { status: "WARMING", reason: `real coverage ${coverage}s < ${secs}s` }; continue; }
    try {
      const [cums] = await client.readContract({ address: pool, abi: POOL_ABI, functionName: "observe", args: [[secs, 0]], blockNumber: block.number });
      const avgTick = Number((cums[1] - cums[0]) / BigInt(secs));
      const ref = usdtPerFlow(getSqrtRatioAtTick(avgTick));
      twap[label] = { status: "READY", averageTick: avgTick, referenceUsdtPerFlow: ref, spotDeviationPct: round(((spot - ref) / ref) * 100) };
    } catch (e) { twap[label] = { status: "REFERENCE_UNAVAILABLE", reason: e.shortMessage || e.message }; }
  }
  const [oracle, budget] = await Promise.all([
    client.readContract({ address: CONTROLLER, abi: CTRL_ABI, functionName: "oracle", blockNumber: block.number }),
    client.readContract({ address: CONTROLLER, abi: CTRL_ABI, functionName: "weeklyUsdBudget8", blockNumber: block.number }),
  ]);
  ok("R5 oracle is address(0)", oracle === ZERO, oracle);
  ok("weeklyUsdBudget8 == 0", budget === 0n, budget.toString());
  ok("P4B earliest timestamp passed", Number(block.timestamp) >= P4B_EARLIEST, ev.block.iso);
  ok("no 7d PASS without >=604800s real coverage", twap["7d"].status !== "READY" || coverage >= 604800, coverage);
  const p4bLive = twap["7d"].status === "READY" ? "PASS_PENDING_OWNER_POLICY" : "NOT_READY";
  ev.p4b = {
    runner: "READY", liveRun: p4bLive, twap, observation: { cardinality: st.card, cardinalityNext: st.cardNext, index: st.obsIndex, oldestTimestamp: Number(oldest[0]), realCoverageSeconds: coverage },
    ownerPolicies: { minimumLiquidityThreshold: "UNAPPROVED", freshnessRule: "UNAPPROVED", maxDeviationRule: "UNAPPROVED" }, result: p4bLive === "NOT_READY" ? "NOT_READY" : "OWNER_DECISION_REQUIRED",
  };
  ev.staking = { oracle, weeklyUsdBudget8: budget.toString(), standardDynamic: "DISABLED" };
  ev.classification = classification;
  finish(ev);
}
const fmt = (v, d) => { const n = BigInt(v), s = n.toString().padStart(d + 1, "0"); return `${s.slice(0, -d)}.${s.slice(-d)}`.replace(/\.?0+$/, "") || "0"; };
const round = (x) => Math.round(x * 100) / 100;
function finish(ev) {
  ev.checks = checks; ev.summary = { total: checks.length, passed: checks.filter((c) => c.pass).length };
  writeFileSync(new URL("../P4A3_P4B_RUN.json", import.meta.url), JSON.stringify(ev, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name} :: ${JSON.stringify(c.detail)}`);
}
main().catch((e) => { console.error("HALT:", e.shortMessage || e.message); finish({ halted: e.message }); process.exit(1); });
