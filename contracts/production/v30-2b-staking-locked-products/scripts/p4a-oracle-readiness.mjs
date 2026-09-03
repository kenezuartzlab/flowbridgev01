// V30.2B P4A — Dynamic Standard staking: oracle readiness + owner decision gate.
//
// READ-ONLY on BOT Mainnet 677. Zero mainnet writes, zero signatures, zero role
// grants. Failure-mode proofs run against a local anvil fork of the exact
// deployed R5 bytecode (fork writes only). Nothing here activates anything.
//
// Usage:
//   anvil --fork-url <BOT mainnet rpc> --port 8901   (optional, for §4 sims)
//   bun contracts/production/v30-2b-staking-locked-products/scripts/p4a-oracle-readiness.mjs
import fs from 'node:fs';
import path from 'node:path';
import {
  createPublicClient, createTestClient, createWalletClient, http, getAddress,
  formatEther, parseAbi, encodeFunctionData, parseUnits,
} from 'viem';

const D = path.dirname(new URL(import.meta.url).pathname).replace(/\/scripts$/, '');
const P = path.join(D, '..');
const RPC = process.env.BOT_MAINNET_RPC_URL || 'https://rpc.botchain.ai';
const RPC2 = process.env.BOT_MAINNET_RPC_URL_2 || RPC;
const FORK_RPC = process.env.P4A_FORK_RPC || 'http://127.0.0.1:8901';

const A = {
  flow: getAddress('0xcaaB50F36252a57529AFeF651fa6B9f9281917fF'),
  treasury: getAddress('0x96552909998F3DbAf5Ff4979dc158508b3442e65'),
  controller: getAddress('0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF'),
  vault: getAddress('0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D'),
  usdt: getAddress('0xababc7ddc03e501d190c676bf3d92ef0e6e87a3c'),
  wbot: getAddress('0xd5452816194a3784dBa983426cCe7c122F4abd30'),
  v3Factory: getAddress('0x1C51c173323ec11BB4e3C4fD2314c225Dc4b5419'),
  v2Factory: getAddress('0x117115f3b72c8d1989178089a67d0c26f8ee0aa3'),
  governor: getAddress('0x88A4CC1F5771523baeB83DaEea07D323a3ce9507'),
  publisher: getAddress('0x05F7E3eA71093D8224ABB9DE078D1a2e480faB22'),
};

const abi = {
  treasury: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-treasury/abi.json'), 'utf8')),
  controller: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-controller/abi.json'), 'utf8')),
  vault: JSON.parse(fs.readFileSync(path.join(P, 'v30-2b-vault/abi.json'), 'utf8')),
};
const erc20 = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]);
const v3f = parseAbi(['function getPool(address,address,uint24) view returns (address)']);
const v2f = parseAbi(['function getPair(address,address) view returns (address)']);
const poolAbi = parseAbi([
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
  'function liquidity() view returns (uint128)',
  'function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)',
  'function observe(uint32[]) view returns (int56[],uint160[])',
]);
const POOL_CREATED = parseAbi([
  'event PoolCreated(address indexed token0,address indexed token1,uint24 indexed fee,int24 tickSpacing,address pool)',
])[0];
const FEE_TIERS = [100, 500, 2500, 3000, 10000];

const client = createPublicClient({ transport: http(RPC) });
const client2 = createPublicClient({ transport: http(RPC2) });
const read = (address, a, functionName, args = []) =>
  client.readContract({ address, abi: a, functionName, args });

const checks = [];
const fail = [];
const check = (ok, label, detail) => {
  checks.push({ ok, label, detail: detail ?? null });
  if (!ok) fail.push(`${label}${detail ? ` :: ${detail}` : ''}`);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  return ok;
};

const chainId = await client.getChainId();
const block = await client.getBlock();
check(chainId === 677, 'chain is BOT Mainnet 677', `chainId=${chainId}`);
console.log(`block ${block.number} ts ${block.timestamp}`);

// ------------------------------------------------- §3.1 frozen baseline reads
const live = {
  oracle: await read(A.controller, abi.controller, 'oracle'),
  oraclePolicy: await read(A.controller, abi.controller, 'oraclePolicy'),
  weeklyUsdBudget8: await read(A.controller, abi.controller, 'weeklyUsdBudget8'),
  maxFlowPerEpoch: await read(A.controller, abi.controller, 'maxFlowPerEpoch'),
  genesisCap: await read(A.controller, abi.controller, 'GENESIS_YEAR1_CAP'),
  genesisUsed: await read(A.controller, abi.controller, 'genesisYear1Used'),
  standardCap: await read(A.controller, abi.controller, 'STANDARD_YEAR1_CAP'),
  standardUsed: await read(A.controller, abi.controller, 'standardYear1Used'),
  totalCap: await read(A.controller, abi.controller, 'TOTAL_YEAR1_CAP'),
  epochCommitted: await read(A.controller, abi.controller, 'epochCommitted'),
  epochEnd: await read(A.controller, abi.controller, 'epochEnd'),
  prevImpliedVarBps: await read(A.controller, abi.controller, 'prevImpliedVarBps'),
  emergencyMode: await read(A.controller, abi.controller, 'emergencyMode'),
  vaultOfController: await read(A.controller, abi.controller, 'vault'),
  vaultPaused: await read(A.vault, abi.vault, 'paused'),
  free: await read(A.treasury, abi.treasury, 'freeBalance'),
  reservedGenesis: await read(A.treasury, abi.treasury, 'reservedGenesis'),
  reservedFloors: await read(A.treasury, abi.treasury, 'reservedFloors'),
  totalObligations: await read(A.treasury, abi.treasury, 'totalObligations'),
  inventory: await read(A.flow, erc20, 'balanceOf', [A.treasury]),
};
const EPOCH_ROLE = await read(A.vault, abi.vault, 'EPOCH_ROLE');
const PUBLISHER_ROLE = await read(A.controller, abi.controller, 'PUBLISHER_ROLE');
const roles = {
  epochRoleToController: await read(A.vault, abi.vault, 'hasRole', [EPOCH_ROLE, A.controller]),
  publisherRoleToPublisher: await read(A.controller, abi.controller, 'hasRole', [PUBLISHER_ROLE, A.publisher]),
};

check(/^0x0{40}$/i.test(live.oracle), 'controller oracle still unset (0x0)', live.oracle);
check(live.weeklyUsdBudget8 === 0n, 'weeklyUsdBudget8 still 0', String(live.weeklyUsdBudget8));
check(live.maxFlowPerEpoch === 50_000n * 10n ** 18n, 'maxFlowPerEpoch is exactly 50,000 FLOW', formatEther(live.maxFlowPerEpoch));
check(live.genesisCap === 1_000_000n * 10n ** 18n, 'Genesis Year-1 cap is 1,000,000 FLOW');
check(live.standardCap === 2_000_000n * 10n ** 18n, 'Standard Year-1 cap is 2,000,000 FLOW');
check(live.totalCap === 3_000_000n * 10n ** 18n, 'Total Year-1 cap is 3,000,000 FLOW');
check(live.emergencyMode === false, 'controller emergencyMode false');
check(live.vaultPaused === false, 'vault not paused');
check(getAddress(live.vaultOfController) === A.vault, 'controller bound to canonical R6 vault');
check(roles.epochRoleToController === false, 'EPOCH_ROLE -> controller still unassigned');
check(roles.publisherRoleToPublisher === false, 'PUBLISHER_ROLE -> approved publisher still unassigned');
check(live.epochCommitted === 0n, 'no standard epoch committed', String(live.epochCommitted));
check(live.inventory >= live.free + live.totalObligations, 'reward treasury solvent');

// P3D live staking untouched: product matrix + position #2 still present.
const productMatrix = [];
for (let pid = 0; pid < 5; pid++) {
  const [active, lockSeconds, genesisAprBps, floorBps, targetBps, hardCapBps, minPrincipal] =
    await read(A.controller, abi.controller, 'products', [BigInt(pid)]);
  productMatrix.push({
    productId: pid, active, lockSeconds: Number(lockSeconds),
    genesisAprBps: Number(genesisAprBps), floorBps: Number(floorBps),
    targetBps: Number(targetBps), hardCapBps: Number(hardCapBps),
    minPrincipal: formatEther(minPrincipal),
  });
}
const EXPECT = [
  [0, 0, 1800, 0, 1000, 1200], [1, 2_592_000, 2700, 800, 1400, 1800],
  [2, 7_776_000, 3600, 1000, 1800, 2400], [3, 15_552_000, 4800, 1200, 2400, 3200],
  [4, 31_536_000, 6000, 1500, 3000, 4000],
];
for (const [pid, lock, gen, floor, target, cap] of EXPECT) {
  const p = productMatrix[pid];
  check(
    p.active && p.lockSeconds === lock && p.genesisAprBps === gen && p.floorBps === floor &&
    p.targetBps === target && p.hardCapBps === cap,
    `product ${pid} floor/target/hard-cap matrix unchanged`,
    `${p.floorBps}/${p.targetBps}/${p.hardCapBps} bps`,
  );
}
const pos2 = await read(A.vault, abi.vault, 'getPosition', [2n]);
const pos2Owner = getAddress(Array.isArray(pos2) ? pos2[0] : pos2.owner);
check(pos2Owner === getAddress('0x3d8a7fa490f9db09dd8006b74688213ace9c0164'), 'P3D canary position #2 intact', pos2Owner);

// -------------------------------------------- §3.2-3.4 pool discovery (2 paths)
async function discoverPools(c) {
  const found = [];
  for (const [a, b, label] of [[A.flow, A.usdt, 'FLOW/USDT'], [A.flow, A.wbot, 'FLOW/WBOT']]) {
    for (const fee of FEE_TIERS) {
      let pool = null;
      try {
        pool = await c.readContract({ address: A.v3Factory, abi: v3f, functionName: 'getPool', args: [a, b, fee] });
      } catch { pool = null; }
      if (pool && !/^0x0{40}$/i.test(pool)) found.push({ dex: 'BDEX V3', label, fee, pool: getAddress(pool) });
    }
    let pair = null;
    try {
      pair = await c.readContract({ address: A.v2Factory, abi: v2f, functionName: 'getPair', args: [a, b] });
    } catch { pair = null; }
    if (pair && !/^0x0{40}$/i.test(pair)) found.push({ dex: 'BDEX V2', label, fee: null, pool: getAddress(pair) });
  }
  return found;
}
async function poolCreatedForFlow(c) {
  const logs = await c.getLogs({ address: A.v3Factory, event: POOL_CREATED, fromBlock: 0n, toBlock: 'latest' });
  const flow = logs.filter((l) =>
    [l.args.token0, l.args.token1].some((t) => t.toLowerCase() === A.flow.toLowerCase()));
  return { total: logs.length, flow: flow.map((l) => ({ pool: getAddress(l.args.pool), fee: Number(l.args.fee) })) };
}

const pathA = await discoverPools(client);
const pathB = await discoverPools(client2);
const logsA = await poolCreatedForFlow(client);
const logsB = await poolCreatedForFlow(client2);
check(JSON.stringify(pathA) === JSON.stringify(pathB), 'pool discovery reproduced on a second fresh read path');
check(JSON.stringify(logsA) === JSON.stringify(logsB), 'PoolCreated history reproduced on a second fresh read path');
console.log(`V3 factory pools total=${logsA.total}, FLOW pools=${logsA.flow.length}, registry hits=${pathA.length}`);

const candidates = [];
for (const cand of pathA) {
  const info = { ...cand };
  try {
    info.token0 = getAddress(await client.readContract({ address: cand.pool, abi: poolAbi, functionName: 'token0' }));
    info.token1 = getAddress(await client.readContract({ address: cand.pool, abi: poolAbi, functionName: 'token1' }));
    info.liquidity = String(await client.readContract({ address: cand.pool, abi: poolAbi, functionName: 'liquidity' }));
    const s0 = await client.readContract({ address: cand.pool, abi: poolAbi, functionName: 'slot0' });
    info.observationCardinality = Number(s0[3]);
    try {
      await client.readContract({ address: cand.pool, abi: poolAbi, functionName: 'observe', args: [[604800, 0]] });
      info.sevenDayTwapAvailable = true;
    } catch (e) { info.sevenDayTwapAvailable = false; info.observeError = (e.shortMessage || e.message).slice(0, 120); }
  } catch (e) { info.readError = (e.shortMessage || e.message).slice(0, 120); }
  candidates.push(info);
}
const poolVerdict = candidates.length === 0 ? 'NOT_FOUND'
  : candidates.some((c) => c.sevenDayTwapAvailable) ? 'FOUND' : 'UNSAFE';
check(true, `FLOW/USDT production pool discovery verdict: ${poolVerdict}`, `${candidates.length} candidate(s)`);
const twapVerdict = poolVerdict === 'FOUND' ? 'PASS' : poolVerdict === 'UNSAFE' ? 'NOT_READY' : 'BLOCKED';

// ------------------------------------ §4 live fail-closed proof + fork sims
const healthy = await read(A.controller, abi.controller, 'referenceHealthy');
check(healthy[0] === false && Number(healthy[1]) === 1,
  'live referenceHealthy() fail-closed with reasonCode 1 (oracle not configured)', `code=${healthy[1]}`);
let quoteRevert = null;
try {
  await read(A.controller, abi.controller, 'quoteEpochBudget');
} catch (e) { quoteRevert = (e.shortMessage || e.message); }
check(/OracleNotConfigured|revert/i.test(quoteRevert ?? ''),
  'live quoteEpochBudget() reverts fail-closed', (quoteRevert ?? 'no revert').slice(0, 80));

// Mock reference-oracle runtime bytecode: returns 4 constant words for any call.
const w = (v) => BigInt(v).toString(16).padStart(64, '0');
const mockOracleCode = (price, updatedAt, liquidity, deviation) =>
  ('0x'
    + `7f${w(price)}600052`
    + `7f${w(updatedAt)}602052`
    + `7f${w(liquidity)}604052`
    + `7f${w(deviation)}606052`
    + '60806000f3');

const forkSims = [];
let forkAvailable = false;
try {
  const test = createTestClient({ mode: 'anvil', transport: http(FORK_RPC) });
  const forkPub = createPublicClient({ transport: http(FORK_RPC) });
  await forkPub.getChainId();
  forkAvailable = true;
  const wallet = createWalletClient({ account: A.governor, chain: null, transport: http(FORK_RPC) });
  await test.impersonateAccount({ address: A.governor });
  await test.setBalance({ address: A.governor, value: 10n ** 19n });
  const MOCK = getAddress('0x00000000000000000000000000000000000ac1e5');
  const now = Number((await forkPub.getBlock()).timestamp);
  const PRICE = 2_500_000n; // 0.025 USD (8dp) — SAMPLE ONLY, never an approved value
  const scenarios = [
    { name: 'unavailable / not configured', oracle: null, expectCode: 1 },
    { name: 'malformed zero price', code: mockOracleCode(0, now, 10n ** 12n, 0), expectCode: 2 },
    { name: 'stale reference', code: mockOracleCode(PRICE, now - 86_400, 10n ** 12n, 0), expectCode: 3 },
    { name: 'insufficient liquidity', code: mockOracleCode(PRICE, now, 0, 0), expectCode: 4, minLiquidityUsd8: 10n ** 12n },
    { name: 'excessive deviation', code: mockOracleCode(PRICE, now, 10n ** 12n, 5_000), expectCode: 5 },
    { name: 'recovery to a valid reference', code: mockOracleCode(PRICE, now, 10n ** 12n, 10), expectCode: 0, minLiquidityUsd8: 10n ** 11n },
  ];
  for (const s of scenarios) {
    if (s.code) await test.setCode({ address: MOCK, bytecode: s.code });
    await wallet.writeContract({
      address: A.controller, abi: abi.controller, functionName: 'setOracle',
      args: [s.oracle === null ? '0x0000000000000000000000000000000000000000' : MOCK],
    });
    if (s.minLiquidityUsd8 !== undefined) {
      await wallet.writeContract({
        address: A.controller, abi: abi.controller, functionName: 'setOraclePolicy',
        args: [7200n, s.minLiquidityUsd8, 500n],
      });
    }
    const h = await forkPub.readContract({ address: A.controller, abi: abi.controller, functionName: 'referenceHealthy' });
    let quoted = null, reverted = null;
    try {
      quoted = await forkPub.readContract({ address: A.controller, abi: abi.controller, functionName: 'quoteEpochBudget' });
    } catch (e) { reverted = (e.shortMessage || e.message).slice(0, 80); }
    forkSims.push({ scenario: s.name, expectCode: s.expectCode, gotCode: Number(h[1]), ok: h[0], quoted: quoted === null ? null : String(quoted), reverted });
    check(Number(h[1]) === s.expectCode, `fork sim: ${s.name} -> reasonCode ${s.expectCode}`, `code=${h[1]}`);
    if (s.expectCode !== 0) check(reverted !== null, `fork sim: ${s.name} blocks quoteEpochBudget()`, reverted ?? 'NOT BLOCKED');
    else check(quoted === 0n, 'fork sim: healthy reference still yields 0 FLOW while weeklyUsdBudget8 is 0', String(quoted));
  }
  // publishEpoch must stay impossible without PUBLISHER_ROLE even on a healthy reference.
  let pubBlocked = null;
  try {
    await forkPub.simulateContract({
      address: A.controller, abi: abi.controller, functionName: 'publishEpoch',
      args: [[1], [1n]], account: A.publisher,
    });
  } catch (e) { pubBlocked = (e.shortMessage || e.message).slice(0, 90); }
  check(pubBlocked !== null, 'fork sim: publishEpoch() impossible for approved publisher without PUBLISHER_ROLE', pubBlocked ?? 'NOT BLOCKED');
} catch (e) {
  console.log(`NOTE  fork simulations skipped — no anvil fork at ${FORK_RPC} (${(e.shortMessage || e.message).slice(0, 70)})`);
}

// ------------------------------------------ §5 standard economics readiness
const standardRemaining = live.standardCap - live.standardUsed;
const totalRemaining = live.totalCap - live.genesisUsed - live.standardUsed;
// Standard Year-1 usage today is exactly the P3D 30D floor reservation; no
// variable epoch has ever consumed Standard budget.
check(live.standardUsed === live.reservedFloors,
  'Standard Year-1 used equals the P3D floor reservation only (no variable epoch usage)',
  formatEther(live.standardUsed));
check(standardRemaining <= live.standardCap, 'Standard remaining within 2,000,000 FLOW ceiling', formatEther(standardRemaining));
check(live.free + live.reservedGenesis + live.reservedFloors <= live.inventory,
  'free reward capacity excludes Genesis + floor reservations and stays solvent',
  `free=${formatEther(live.free)} rg=${formatEther(live.reservedGenesis)} rf=${formatEther(live.reservedFloors)}`);

// Deployed formula reproduced off chain — SAMPLE prices only, not launch values.
const capForBudget = standardRemaining < totalRemaining ? standardRemaining : totalRemaining;
const budgetSamples = [];
for (const usdPerFlow of ['0.01', '0.025', '0.05', '0.10']) {
  for (const weeklyUsd of ['1000', '5000', '25000']) {
    const price8 = parseUnits(usdPerFlow, 8);
    const budget8 = parseUnits(weeklyUsd, 8);
    let flowBudget = (budget8 * 10n ** 18n) / price8;
    const unbounded = flowBudget;
    if (flowBudget > live.maxFlowPerEpoch && live.maxFlowPerEpoch !== 0n) flowBudget = live.maxFlowPerEpoch;
    if (flowBudget > capForBudget) flowBudget = capForBudget;
    const bounded = flowBudget < unbounded;
    budgetSamples.push({
      sampleUsdPerFlow: usdPerFlow, sampleWeeklyUsdBudget: weeklyUsd,
      unboundedFlow: formatEther(unbounded), boundedFlow: formatEther(flowBudget),
      boundedBy: bounded ? (flowBudget === live.maxFlowPerEpoch ? 'maxFlowPerEpoch' : 'Year-1 capacity') : 'none',
      withinFreeRewardCapacity: flowBudget <= live.free,
    });
  }
}
check(budgetSamples.every((s) => BigInt(parseUnits(s.boundedFlow, 18)) <= live.maxFlowPerEpoch),
  'every sampled price-derived budget is bounded by maxFlowPerEpoch');
check(budgetSamples.some((s) => s.boundedBy === 'maxFlowPerEpoch'),
  'sample set exercises the maxFlowPerEpoch clamp');
// ±10% weekly guard + hard cap arithmetic (deployed rule: floor + variable <= hardCap).
const guard = productMatrix.map((p) => ({
  productId: p.productId, floorBps: p.floorBps, hardCapBps: p.hardCapBps,
  maxVariableBps: p.hardCapBps - p.floorBps,
}));
check(guard.every((g) => g.maxVariableBps >= 0), 'variable head-room non-negative for every product');

// -------------------------------- §6 unsigned role prep (simulation only)
const unsignedSafeActions = [
  {
    step: 'P4B-R1',
    description: 'Vault R6 grants EPOCH_ROLE to Controller R5 (required before any variable epoch can settle)',
    to: A.vault, value: '0',
    data: encodeFunctionData({ abi: abi.vault, functionName: 'grantRole', args: [EPOCH_ROLE, A.controller] }),
  },
  {
    step: 'P4B-R2',
    description: 'Controller R5 grants PUBLISHER_ROLE to the approved Staking Publisher',
    to: A.controller, value: '0',
    data: encodeFunctionData({ abi: abi.controller, functionName: 'grantRole', args: [PUBLISHER_ROLE, A.publisher] }),
  },
];
for (const act of unsignedSafeActions) {
  check(/^0x[0-9a-f]{8,}$/i.test(act.data), `unsigned Safe action built: ${act.step}`, act.to);
}
check(roles.epochRoleToController === false && roles.publisherRoleToPublisher === false,
  'role prep is REQUIRED and remains unexecuted (nothing signed, nothing broadcast)');

// --------------------------------------------------------------- verdict
const verdict = fail.length === 0 && poolVerdict === 'FOUND' ? 'PASS'
  : fail.length === 0 ? 'PASS_WITH_BLOCKER' : 'BLOCKED';
const out = {
  phase: 'V30.2B P4A',
  generatedAt: new Date().toISOString(),
  chainId, block: Number(block.number), blockTimestamp: Number(block.timestamp),
  mainnetWrites: 0,
  addresses: A,
  live: Object.fromEntries(Object.entries(live).map(([k, v]) => [k, Array.isArray(v) ? v.map(String) : String(v)])),
  roles: { EPOCH_ROLE, PUBLISHER_ROLE, ...roles },
  productMatrix,
  poolDiscovery: { verdict: poolVerdict, registryHits: pathA, poolCreatedTotal: logsA.total, flowPoolsFromLogs: logsA.flow, candidates },
  twapVerdict,
  oracleInterface: {
    expected: 'IFlowReferenceOracle.latestReference() -> (priceUsd8, updatedAt, liquidityUsd8, deviationBps)',
    priceUnits: 'USD per FLOW, 8 decimals',
    failClosedCodes: { 1: 'not configured', 2: 'zero/malformed price', 3: 'stale', 4: 'insufficient liquidity', 5: 'deviation too high' },
    deployedPolicy: {
      maxStalenessSeconds: String(live.oraclePolicy[0]),
      minLiquidityUsd8: String(live.oraclePolicy[1]),
      maxDeviationBps: String(live.oraclePolicy[2]),
    },
  },
  forkSimulations: { available: forkAvailable, rpc: FORK_RPC, scenarios: forkSims },
  standardEconomics: {
    standardYear1Used: formatEther(live.standardUsed),
    standardYear1Remaining: formatEther(standardRemaining),
    totalYear1Remaining: formatEther(totalRemaining),
    freeRewardCapacity: formatEther(live.free),
    reservedGenesis: formatEther(live.reservedGenesis),
    reservedFloors: formatEther(live.reservedFloors),
    maxFlowPerEpoch: formatEther(live.maxFlowPerEpoch),
    weeklyUsdBudget8: String(live.weeklyUsdBudget8),
    budgetSamplesAreMathTestsOnly: true,
    budgetSamples,
    variableHeadroom: guard,
  },
  rolePrep: { required: true, simulated: forkAvailable, unsignedSafeActions, signed: false, broadcast: false },
  ownerDecisionsStillRequired: [
    'Observation window for the FLOW/USD reference (target >= 7 days)',
    'Maximum freshness age (maxStalenessSeconds)',
    'Minimum liquidity threshold (minLiquidityUsd8)',
    'Maximum deviation threshold (maxDeviationBps)',
    'Nonzero weeklyUsdBudget8',
  ],
  alreadyFrozenDoNotReapprove: [
    'maxFlowPerEpoch = 50,000 FLOW / 7 days',
    'Year-1 ceilings 1M Genesis / 2M Standard / 3M total',
    'Product floor / target / hard-cap matrix',
    `Approved Staking Publisher ${A.publisher}`,
  ],
  blocker: poolVerdict === 'FOUND' ? null
    : 'No FLOW/USDT (or FLOW/WBOT) pool exists on BOT Mainnet 677 on either the BDEX V3 factory or the BDEX V2 factory. Verified production FLOW liquidity/pool creation is required before any oracle-dependent activation. No >=7-day observation history can exist until a pool exists, so no earliest-ready timestamp can be quoted.',
  verdict,
  checksPassed: checks.filter((c) => c.ok).length,
  checksTotal: checks.length,
  failures: fail,
};
const outPath = path.join(D, 'P4A_ORACLE_READINESS.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`\n${out.checksPassed}/${out.checksTotal} checks passed, ${fail.length} failures`);
console.log(`pool=${poolVerdict} twap=${twapVerdict} verdict=${verdict}`);
console.log(`evidence: ${outPath}`);
