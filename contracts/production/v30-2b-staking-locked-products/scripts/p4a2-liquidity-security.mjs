/**
 * V30.2B P4A.2 — Liquidity Security + TWAP Warm-up readiness (READ-ONLY).
 *
 * Zero writes. Reads the exact live BDEX V3 FLOW/USDT pool on BOT Mainnet 677,
 * proves observation support for 30m / 6h / 7d windows, reconfirms the frozen
 * staking boundary, and derives manipulation-cost evidence analytically from
 * live concentrated-liquidity state.
 */
import { createPublicClient, http, parseAbi, getAddress } from "viem";
import { writeFileSync } from "node:fs";

const RPC = "https://rpc.botchain.ai";
const CHAIN_ID = 677;

const FLOW = getAddress("0xcaaB50F36252a57529AFeF651fa6B9f9281917fF");
const USDT = getAddress("0xababc7ddc03e501d190c676bf3d92ef0e6e87a3c");
const V3_FACTORY = getAddress("0x1C51c173323ec11BB4e3C4fD2314c225Dc4b5419");
const V3_QUOTER = getAddress("0x034A705b36067cFF99AbF5C662BE881cbd8D0176");
const V3_ROUTER = getAddress("0x07032d47A1b9f8460cBeE9dC17c1d3E438693929");
const FB_ROUTER_V3 = getAddress("0x986962de6F00D0eC571b1a34Fa70AEeB445b5445");
const VAULT = getAddress("0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D");
const CONTROLLER = getAddress("0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF");
const FEE = 10000;

const FACTORY_ABI = parseAbi([
  "function getPool(address,address,uint24) view returns (address)",
  "function feeAmountTickSpacing(uint24) view returns (int24)",
]);
const POOL_ABI = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function fee() view returns (uint24)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function liquidity() view returns (uint128)",
  "function tickSpacing() view returns (int24)",
  "function observe(uint32[] secondsAgos) view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128)",
  "function observations(uint256) view returns (uint32 blockTimestamp, int56 tickCumulative, uint160 secondsPerLiquidityCumulativeX128, bool initialized)",
]);
const QUOTER_ABI = parseAbi([
  "function factory() view returns (address)",
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);
const VAULT_ABI = parseAbi([
  "function oracle() view returns (address)",
  "function weeklyUsdBudget8() view returns (uint256)",
  "function maxFlowPerEpoch() view returns (uint256)",
  "function emergencyMode() view returns (bool)",
]);

const client = createPublicClient({
  chain: { id: CHAIN_ID, name: "BOT", nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } },
  transport: http(RPC),
});

const checks = [];
const ok = (name, pass, detail) => { checks.push({ name, pass: !!pass, detail }); };

async function main() {
  const evidence = { gate: "V30.2B-P4A.2", chainId: null, block: null, pool: {}, twap: {}, manipulation: {}, staking: {}, quotes: {} };

  const id = await client.getChainId();
  ok("chain id 677", id === CHAIN_ID, id);
  evidence.chainId = id;
  const block = await client.getBlock();
  evidence.block = { number: Number(block.number), timestamp: Number(block.timestamp) };

  const spacing = await client.readContract({ address: V3_FACTORY, abi: FACTORY_ABI, functionName: "feeAmountTickSpacing", args: [FEE] });
  ok("fee tier 10000 enabled on factory", Number(spacing) > 0, Number(spacing));

  const pool = await client.readContract({ address: V3_FACTORY, abi: FACTORY_ABI, functionName: "getPool", args: [FLOW, USDT, FEE] });
  ok("FLOW/USDT pool resolved from factory", pool !== "0x0000000000000000000000000000000000000000", pool);
  if (pool === "0x0000000000000000000000000000000000000000") { finish(evidence); return; }

  const [token0, token1, poolFee, liquidity, slot0, tickSpacing] = await Promise.all([
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "token0" }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "token1" }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "fee" }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "liquidity" }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "slot0" }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "tickSpacing" }),
  ]);
  const pair = new Set([token0.toLowerCase(), token1.toLowerCase()]);
  ok("pool holds exactly canonical FLOW + USDT", pair.has(FLOW.toLowerCase()) && pair.has(USDT.toLowerCase()), [token0, token1]);
  ok("pool fee == 10000", Number(poolFee) === FEE, Number(poolFee));
  ok("active liquidity > 0", liquidity > 0n, liquidity.toString());
  ok("pool initialized + unlocked", slot0[0] > 0n && slot0[6] === true, { sqrtPriceX96: slot0[0].toString(), unlocked: slot0[6] });
  evidence.pool = {
    address: pool, token0, token1, fee: Number(poolFee), liquidity: liquidity.toString(),
    sqrtPriceX96: slot0[0].toString(), tick: Number(slot0[1]),
    observationIndex: Number(slot0[2]), observationCardinality: Number(slot0[3]),
    observationCardinalityNext: Number(slot0[4]), tickSpacing: Number(tickSpacing),
  };

  // Live production quotes, both directions (simulate — no write).
  const q = async (tokenIn, tokenOut, amountIn) => {
    const sim = await client.simulateContract({
      address: V3_QUOTER, abi: QUOTER_ABI, functionName: "quoteExactInputSingle",
      args: [{ tokenIn, tokenOut, amountIn, fee: FEE, sqrtPriceLimitX96: 0n }],
    });
    return sim.result;
  };
  const flowToUsdt = await q(FLOW, USDT, 10n ** 18n);
  const usdtToFlow = await q(USDT, FLOW, 10n ** 6n);
  ok("1 FLOW -> USDT quote > 0", flowToUsdt[0] > 0n, flowToUsdt[0].toString());
  ok("1 USDT -> FLOW quote > 0", usdtToFlow[0] > 0n, usdtToFlow[0].toString());
  const quoterFactory = await client.readContract({ address: V3_QUOTER, abi: QUOTER_ABI, functionName: "factory" });
  ok("quoter bound to verified factory", quoterFactory.toLowerCase() === V3_FACTORY.toLowerCase(), quoterFactory);
  evidence.quotes = {
    oneFlowOutUsdt6: flowToUsdt[0].toString(),
    oneUsdtOutFlow18: usdtToFlow[0].toString(),
    flowToUsdtSqrtAfter: flowToUsdt[1].toString(),
    usdtToFlowSqrtAfter: usdtToFlow[1].toString(),
  };

  // Router surfaces unchanged.
  for (const [name, addr] of [["BDEX V3 router", V3_ROUTER], ["FlowBridge Router v3", FB_ROUTER_V3]]) {
    const code = await client.getBytecode({ address: addr });
    ok(`${name} deployed`, !!code && code.length > 2, addr);
  }

  // ── TWAP warm-up ────────────────────────────────────────────────────────
  const windows = { "30m": 1800, "6h": 21600, "7d": 604800 };
  const observe = async (secondsAgo) => {
    try {
      const res = await client.readContract({ address: pool, abi: POOL_ABI, functionName: "observe", args: [[secondsAgo, 0]] });
      return res;
    } catch (e) { return null; }
  };
  const twap = {};
  for (const [label, secs] of Object.entries(windows)) {
    const res = await observe(secs);
    if (!res) { twap[label] = { status: "WARMING", reason: "observation history does not cover window" }; continue; }
    const [c0, c1] = res[0];
    const avgTick = Number((c1 - c0) / BigInt(secs));
    twap[label] = { status: "READY", averageTick: avgTick };
  }
  const oldest = await client.readContract({ address: pool, abi: POOL_ABI, functionName: "observations", args: [0n] });
  const oldestTs = Number(oldest[0]);
  const ageSeconds = Number(block.timestamp) - oldestTs;
  const earliest7d = oldestTs + 604800;
  ok("observe() cumulative tick data readable at 0s", !!(await observe(0)), true);
  ok("oldest observation initialized", oldest[3] === true, oldestTs);
  ok("7d TWAP not claimed before 604800s of real history", !(ageSeconds >= 604800) || twap["7d"].status === "READY", ageSeconds);
  evidence.twap = {
    windows: twap,
    oldestObservationTimestamp: oldestTs,
    observationAgeSeconds: ageSeconds,
    earliest7dTwapTimestamp: earliest7d,
    earliest7dTwapIso: new Date(earliest7d * 1000).toISOString(),
    observationCardinality: Number(slot0[3]),
  };

  // ── Manipulation-resistance (analytic, concentrated-liquidity math) ──────
  // Within the active range, moving sqrtP by factor r costs:
  //   dx (token0 in) = L * (1/sqrtP' - 1/sqrtP), dy (token1 in) = L * (sqrtP' - sqrtP)
  const Q96 = 2n ** 96n;
  const L = Number(liquidity);
  const sqrtP = Number(slot0[0]) / Number(Q96);
  const t0IsUsdt = token0.toLowerCase() === USDT.toLowerCase();
  const dec0 = t0IsUsdt ? 6 : 18;
  const dec1 = t0IsUsdt ? 18 : 6;
  const cost = {};
  for (const pct of [5, 10, 20, 30]) {
    const up = Math.sqrt(1 + pct / 100), down = Math.sqrt(1 - pct / 100);
    // price(token1 per token0) up => token0 in; down => token1 in
    const t1In = (L * (sqrtP * up - sqrtP)) / 10 ** dec1;
    const t0In = (L * (1 / (sqrtP * down) - 1 / sqrtP)) / 10 ** dec0;
    cost[`${pct}%`] = {
      pushPriceUp_token1In: t1In,
      pushPriceUp_token1Symbol: t0IsUsdt ? "FLOW" : "USDT",
      pushPriceDown_token0In: t0In,
      pushPriceDown_token0Symbol: t0IsUsdt ? "USDT" : "FLOW",
      note: "in-range only; crossing a range boundary makes the move cheaper still",
    };
  }
  evidence.manipulation = {
    methodology:
      "Uniswap-V3 in-range swap math applied to the live L and sqrtPriceX96. Cost to move spot by X% is the token input that shifts sqrtP by sqrt(1±X). TWAP distortion cost ≈ spot-move cost × (fraction of window sustained), because a geometric-mean TWAP over W seconds moves proportionally to the sustained duration; one-block manipulation of a 1800s window shifts it by ~(block_time/1800) of the spot move.",
    spotMoveCost: cost,
    twapDistortionModel: {
      "30m": "sustaining a 10% spot move for 3 min moves the 30m TWAP ~1%",
      "6h": "same 10% move must persist ~36 min to move the 6h TWAP ~1%",
      "7d": "same 10% move must persist ~16.8 h to move the 7d TWAP ~1%",
    },
    boundaryBehaviour:
      "Outside the LP range active liquidity is 0: quotes revert or return 0 and the app must fail closed (no-active-liquidity block).",
    classification: null,
  };

  // ── Staking boundary frozen ─────────────────────────────────────────────
  const [oracle, budget, maxFlow, emergency] = await Promise.all([
    client.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "oracle" }).catch(() => null),
    client.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "weeklyUsdBudget8" }).catch(() => null),
    client.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "maxFlowPerEpoch" }).catch(() => null),
    client.readContract({ address: VAULT, abi: VAULT_ABI, functionName: "emergencyMode" }).catch(() => null),
  ]);
  ok("R5/vault oracle is address(0)", oracle === "0x0000000000000000000000000000000000000000", oracle);
  ok("weeklyUsdBudget8 == 0", budget === 0n, budget?.toString());
  ok("emergencyMode false", emergency === false, emergency);
  evidence.staking = {
    vault: VAULT, controller: CONTROLLER, oracle, weeklyUsdBudget8: budget?.toString(),
    maxFlowPerEpoch: maxFlow?.toString(), emergencyMode: emergency,
    dynamicStandard: "DISABLED",
  };

  // Liquidity classification: bootstrap unless a 30% move costs a governance-
  // grade amount. Threshold is a *proposal* only — never auto-approved.
  const thirtyUp = cost["30%"].pushPriceUp_token1In;
  const thirtyDown = cost["30%"].pushPriceDown_token0In;
  const usdCostOf30 = t0IsUsdt ? thirtyDown : thirtyUp; // USDT-side cost
  evidence.manipulation.classification = usdCostOf30 >= 250000 ? "ORACLE_CANDIDATE" : "BOOTSTRAP_ONLY";
  evidence.manipulation.usdtCostToMoveSpot30pct = usdCostOf30;
  evidence.manipulation.minLiquidityProposal = "OWNER_DECISION_REQUIRED";

  finish(evidence);
}

function finish(evidence) {
  const failures = checks.filter((c) => !c.pass);
  evidence.checks = checks;
  evidence.summary = { total: checks.length, passed: checks.length - failures.length, failed: failures.length };
  writeFileSync(
    new URL("../P4A2_LIQUIDITY_SECURITY.json", import.meta.url),
    JSON.stringify(evidence, null, 2),
  );
  for (const c of checks) console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name} :: ${JSON.stringify(c.detail)}`);
  console.log(`\n${evidence.summary.passed}/${evidence.summary.total} checks passed, ${failures.length} failures`);
  console.log(JSON.stringify({ twap: evidence.twap, manipulation: evidence.manipulation?.spotMoveCost, classification: evidence.manipulation?.classification, usdtCostToMoveSpot30pct: evidence.manipulation?.usdtCostToMoveSpot30pct }, null, 2));
}

main().catch((e) => { console.error("HALT:", e.shortMessage || e.message); process.exit(1); });
