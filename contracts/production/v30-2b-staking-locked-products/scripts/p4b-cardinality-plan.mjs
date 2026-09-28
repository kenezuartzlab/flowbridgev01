/**
 * V30.2B P4B — observation cardinality sizing for FLOW/USDT 1% pool. READ-ONLY.
 * No signing key, no broadcast. eth_call / eth_estimateGas only.
 *   bun contracts/production/v30-2b-staking-locked-products/scripts/p4b-cardinality-plan.mjs
 */
import { createPublicClient, http, parseAbi, getAddress, encodeFunctionData, toFunctionSelector, parseAbiItem } from "viem";
import { writeFileSync } from "node:fs";

const RPC = process.env.BOT_RPC || "https://rpc.botchain.ai";
const POOL = getAddress("0xDaCFc2574b6110892351Bd31afb36F95E7206162");
const FACTORY = getAddress("0x1C51c173323ec11BB4e3C4fD2314c225Dc4b5419");
const PROBE_FROM = getAddress("0x000000000000000000000000000000000000dEaD");
const WEEK = 604800;
const CANDIDATES = [64, 128, 256, 512, 1024, 2048];
const MULTIPLIERS = [1, 2, 5, 10];

const ABI = parseAbi([
  "function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)",
  "function fee() view returns (uint24)",
  "function observations(uint256) view returns (uint32,int56,uint160,bool)",
  "function increaseObservationCardinalityNext(uint16)",
]);
const EV = {
  swap: parseAbiItem("event Swap(address indexed sender,address indexed recipient,int256 amount0,int256 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick)"),
  mint: parseAbiItem("event Mint(address sender,address indexed owner,int24 indexed tickLower,int24 indexed tickUpper,uint128 amount,uint256 amount0,uint256 amount1)"),
  burn: parseAbiItem("event Burn(address indexed owner,int24 indexed tickLower,int24 indexed tickUpper,uint128 amount,uint256 amount0,uint256 amount1)"),
};
const POOL_CREATED = parseAbiItem("event PoolCreated(address indexed token0,address indexed token1,uint24 indexed fee,int24 tickSpacing,address pool)");

const c = createPublicClient({ chain: { id: 677, name: "BOT", nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } }, transport: http(RPC, { timeout: 30000 }) });

async function logsRange(params, from, to, step = 50000n) {
  const out = [];
  for (let s = from; s <= to; s += step) {
    const e = s + step - 1n > to ? to : s + step - 1n;
    out.push(...(await c.getLogs({ ...params, fromBlock: s, toBlock: e })));
  }
  return out;
}

const chainId = await c.getChainId();
if (chainId !== 677) throw new Error("STOP: chain " + chainId);
const head = await c.getBlock();
const code = await c.getCode({ address: POOL });
const sel = toFunctionSelector("increaseObservationCardinalityNext(uint16)");
const selectorPresent = code.toLowerCase().includes(sel.slice(2).toLowerCase());
const slot0 = await c.readContract({ address: POOL, abi: ABI, functionName: "slot0" });

// creation block: binary search getCode
let lo = 0n, hi = head.number;
while (lo < hi) { const m = (lo + hi) / 2n; const cd = await c.getCode({ address: POOL, blockNumber: m }).catch(() => undefined); if (cd && cd !== "0x") hi = m; else lo = m + 1n; }
const creationBlock = lo;
const created = await logsRange({ address: FACTORY, event: POOL_CREATED }, creationBlock, creationBlock, 1n);
const creationTs = Number((await c.getBlock({ blockNumber: creationBlock })).timestamp);

const raw = [];
for (const [k, ev] of Object.entries(EV)) for (const l of await logsRange({ address: POOL, event: ev }, creationBlock, head.number)) raw.push({ kind: k, block: l.blockNumber });
const counts = { swap: 0, mint: 0, burn: 0 }; raw.forEach((r) => counts[r.kind]++);
// V3 writes at most one observation per block (first write-triggering interaction).
const blocks = [...new Set(raw.map((r) => r.block))].sort((a, b) => (a < b ? -1 : 1));
const ts = [];
for (const b of blocks) ts.push(Number((await c.getBlock({ blockNumber: b })).timestamp));
const nowTs = Number(head.timestamp);
const gaps = []; for (let i = 1; i < ts.length; i++) gaps.push(ts[i] - ts[i - 1]);
const lifetime = nowTs - creationTs;
const writes = ts.length;
const avgInterval = writes > 0 ? lifetime / writes : null; // conservative: lifetime / writes
const worstGap = Math.max(...gaps, ts.length ? nowTs - ts[ts.length - 1] : lifetime, ts.length ? ts[0] - creationTs : lifetime);
const sortedGaps = [...gaps].sort((a, b) => a - b);
const pct = (p) => (sortedGaps.length ? sortedGaps[Math.min(sortedGaps.length - 1, Math.floor(p * sortedGaps.length))] : null);

const minCard = {};
for (const m of MULTIPLIERS) minCard[`${m}x`] = avgInterval ? Math.ceil(WEEK / (avgInterval / m)) : null;

const gasLimit = Number(head.gasLimit);
const sims = [];
for (const n of CANDIDATES) {
  const data = encodeFunctionData({ abi: ABI, functionName: "increaseObservationCardinalityNext", args: [n] });
  let gas = null, err = null, callOk = false;
  try { await c.call({ account: PROBE_FROM, to: POOL, data }); callOk = true; } catch (e) { err = e.shortMessage || String(e); }
  try { gas = Number(await c.estimateGas({ account: PROBE_FROM, to: POOL, data })); } catch (e) { err = err || e.shortMessage || String(e); }
  const retention = (mult) => (avgInterval ? Math.round((n * avgInterval) / mult) : null);
  sims.push({ target: n, callOk, gasEstimate: gas, fitsBlock: gas !== null && gas <= gasLimit, blockGasLimitPct: gas ? +((gas / gasLimit) * 100).toFixed(2) : null,
    retentionSecondsCurrent: retention(1), retentionDaysCurrent: retention(1) && +(retention(1) / 86400).toFixed(2),
    retentionSeconds5x: retention(5), retentionDays5x: retention(5) && +(retention(5) / 86400).toFixed(2), error: err });
}
// Smallest candidate with >=7d at 5x activity (safety margin), that also fits block.
const selected = sims.find((s) => s.fitsBlock && s.retentionSeconds5x >= WEEK) || null;

const ev = {
  gate: "V30.2B-P4B-CARDINALITY-PLAN", mainnetWrites: 0, broadcast: false, rpc: RPC, chainId,
  block: { number: head.number.toString(), timestamp: nowTs, gasLimit },
  pool: { address: POOL, creationBlock: creationBlock.toString(), creationTs, poolCreatedLogFound: created.length > 0,
    observationIndex: slot0[2], observationCardinality: slot0[3], observationCardinalityNext: slot0[4], unlocked: slot0[6] },
  abi: { function: "increaseObservationCardinalityNext(uint16)", selector: sel, selectorInRuntime: selectorPresent, permissionless: true },
  activity: { counts, oracleWritingBlocks: writes, lifetimeSeconds: lifetime, avgIntervalSeconds: avgInterval && Math.round(avgInterval),
    medianGapSeconds: pct(0.5), p10GapSeconds: pct(0.1), worstIntervalSeconds: worstGap, sinceLastWriteSeconds: ts.length ? nowTs - ts[ts.length - 1] : null },
  minCardinalityFor7d: minCard, simulations: sims, selected: selected && selected.target,
};
writeFileSync("contracts/production/v30-2b-staking-locked-products/P4B_CARDINALITY_PLAN.json", JSON.stringify(ev, null, 2));
console.log(JSON.stringify(ev, null, 2));
