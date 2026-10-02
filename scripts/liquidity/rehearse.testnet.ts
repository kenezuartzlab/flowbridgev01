/**
 * Liquidity V1 — BOT Testnet (968) acceptance rehearsal. Testnet ONLY.
 * Uses the same library code the app uses. Every write: simulate → send →
 * receipt.status === "success" (otherwise abort). Exact approvals; leftover
 * allowances cleared. Output: docs/liquidity/testnet-rehearsal.json
 */
import { createWalletClient, http, parseUnits, type Address, type Hex, parseAbi, formatUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { writeFileSync, mkdirSync } from "node:fs";
import { botTestnet } from "../../src/lib/wagmi";
import { getVenue, type V2Venue, type V3Venue } from "../../src/lib/liquidity/venues";
import { liqClient, readV2Pair, discoverV2Positions, enabledFeeTiers, readV3Pool, discoverV3Positions, readAllowance, readBalance, v2Wiring } from "../../src/lib/liquidity/chainReads";
import { ERC20_LITE_ABI, MAX_UINT128, NPM_ABI, V2_ROUTER_ABI } from "../../src/lib/liquidity/abis";
import { planAddV2, planRemoveV2, deadlineFrom } from "../../src/lib/liquidity/v2Math";
import { validateCreatePool } from "../../src/lib/liquidity/createPool";
import { applySlippage, getSqrtRatioAtTick, liquidityForAmounts, amountsForLiquidity, nearestUsableTick } from "../../src/lib/liquidity/v3Math";

const CHAIN = 968;
const MSTT = "0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e" as Address;
const FLOW = "0xCE14Ca1CF2012F1996D5FBc7d369FA051aa641Ac" as Address;
const pk = process.env.DEPLOYER_PRIVATE_KEY!;
const account = privateKeyToAccount((pk.startsWith("0x") ? pk : `0x${pk}`) as Hex);
if (account.address.toLowerCase() !== "0x851275569923c62a2ef962ec35bfbb8f1bcbf3dd") throw new Error("Not the approved rehearsal wallet");
const pub = liqClient(CHAIN);
const wallet = createWalletClient({ account, chain: botTestnet, transport: http() });
const me = account.address;
const log: { step: string; hash?: string; status?: string; detail?: unknown }[] = [];
const now = () => Math.floor(Date.now() / 1000);
const j = (x: unknown) => JSON.parse(JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v)));

async function send(step: string, req: any, detail?: unknown) {
  const { request } = await pub.simulateContract({ account, ...req });
  const hash = await wallet.writeContract(request);
  const r = await pub.waitForTransactionReceipt({ hash });
  log.push({ step, hash, status: r.status, detail: j(detail) });
  console.log(step, hash, r.status);
  if (r.status !== "success") throw new Error(`${step} failed`);
  return r;
}
async function approveExact(token: Address, spender: Address, amount: bigint, step: string) {
  const cur = await readAllowance(CHAIN, token, me, spender);
  if (cur === amount) return;
  if (cur !== 0n) await send(`${step} · reset approval`, { address: token, abi: ERC20_LITE_ABI, functionName: "approve", args: [spender, 0n] });
  await send(`${step} · exact approval`, { address: token, abi: ERC20_LITE_ABI, functionName: "approve", args: [spender, amount] }, { amount });
}
async function clearResidual(token: Address, spender: Address, step: string) {
  const left = await readAllowance(CHAIN, token, me, spender);
  if (left > 0n) await send(`${step} · clear leftover approval`, { address: token, abi: ERC20_LITE_ABI, functionName: "approve", args: [spender, 0n] }, { left });
  const after = await readAllowance(CHAIN, token, me, spender);
  if (after !== 0n) throw new Error("approval not cleared");
  log.push({ step: `${step} · allowance after`, detail: "0" });
}

async function main() {
  const v2 = getVenue(CHAIN, "bdex-v2") as V2Venue;
  const v3 = getVenue(CHAIN, "bdex-v3") as V3Venue;
  const { wrapped } = await v2Wiring(v2);
  console.log("tBOT", formatUnits(await readBalance(CHAIN, "native", me), 18), "MSTT", formatUnits(await readBalance(CHAIN, MSTT, me), 18), "FLOW", formatUnits(await readBalance(CHAIN, FLOW, me), 18));

  // ── BDEX V2: add (native BOT + MSTT) ─────────────────────────────────────
  const pairBefore = await readV2Pair(v2, MSTT, wrapped);
  const mAmt = parseUnits("100", 18);
  const pool = pairBefore && pairBefore.reserve0 > 0n
    ? (pairBefore.token0.toLowerCase() === MSTT.toLowerCase()
      ? { reserveA: pairBefore.reserve0, reserveB: pairBefore.reserve1, totalSupply: pairBefore.totalSupply }
      : { reserveA: pairBefore.reserve1, reserveB: pairBefore.reserve0, totalSupply: pairBefore.totalSupply })
    : null;
  const plan = planAddV2(mAmt, pool ? null : parseUnits("0.02", 18), pool, 100, { a: await readBalance(CHAIN, MSTT, me), b: await readBalance(CHAIN, "native", me) });
  log.push({ step: "V2 pair state before", detail: j({ pair: pairBefore?.pair ?? null, newPair: plan.newPair }) });
  await approveExact(MSTT, v2.router, plan.amountADesired, "V2 add");
  await send("BDEX V2 ADD LIQUIDITY (addLiquidityETH MSTT + tBOT)", {
    address: v2.router, abi: V2_ROUTER_ABI, functionName: "addLiquidityETH", value: plan.amountBDesired,
    args: [MSTT, plan.amountADesired, plan.amountAMin, plan.amountBMin, me, deadlineFrom(now(), 20)],
  }, plan);
  await clearResidual(MSTT, v2.router, "V2 add");

  // ── LP discovery ─────────────────────────────────────────────────────────
  const pair = (await readV2Pair(v2, MSTT, wrapped))!;
  const found = (await discoverV2Positions(v2, me)).find((p) => p.pair.toLowerCase() === pair.pair!.toLowerCase());
  if (!found) throw new Error("LP discovery did not find the new LP position");
  log.push({ step: "BDEX V2 LP DISCOVERY", detail: j({ pair: found.pair, lp: found.lpBalance, shareBps: found.shareBps, amount0: found.amount0, amount1: found.amount1 }) });

  // ── BDEX V2: remove 50% ──────────────────────────────────────────────────
  const mIs0 = pair.token0.toLowerCase() === MSTT.toLowerCase();
  const rp = planRemoveV2(found.lpBalance, { pct: 50 }, { reserveA: mIs0 ? pair.reserve0 : pair.reserve1, reserveB: mIs0 ? pair.reserve1 : pair.reserve0, totalSupply: pair.totalSupply }, 100);
  await approveExact(pair.pair!, v2.router, rp.liquidity, "V2 remove");
  await send("BDEX V2 REMOVE LIQUIDITY (removeLiquidityETH 50%)", {
    address: v2.router, abi: V2_ROUTER_ABI, functionName: "removeLiquidityETH",
    args: [MSTT, rp.liquidity, rp.amountAMin, rp.amountBMin, me, deadlineFrom(now(), 20)],
  }, rp);
  await clearResidual(pair.pair!, v2.router, "V2 remove");

  // ── BDEX V3: Create Pool ─────────────────────────────────────────────────
  const tiers = await enabledFeeTiers(v3);
  log.push({ step: "V3 enabled fee tiers (live)", detail: tiers });
  if (tiers.some((t) => t.fee === 100)) throw new Error("0.01% unexpectedly enabled");
  let fee = 0, existing: string | null = null;
  for (const t of [3000, 10000, 500]) {
    const p = await readV3Pool(v3, MSTT, FLOW, t);
    if (!p.pool) { fee = t; break; }
    existing = p.pool;
  }
  // Duplicate rejection proof on an existing pool, if any.
  if (existing) log.push({ step: "Create Pool duplicate check", detail: validateCreatePool({ version: "v3", tokenA: { address: MSTT, decimals: 18, symbol: "MSTT" }, tokenB: { address: FLOW, decimals: 18, symbol: "FLOW" }, feeTier: 3000, enabledFeeTiers: tiers.map((t) => t.fee), existingPool: existing, priceAinB: "1", priceConfirmed: true }) });
  if (!fee) throw new Error("All MSTT/FLOW tiers already exist");
  const cp = validateCreatePool({ version: "v3", tokenA: { address: MSTT, decimals: 18, symbol: "MSTT" }, tokenB: { address: FLOW, decimals: 18, symbol: "FLOW" }, feeTier: fee, enabledFeeTiers: tiers.map((t) => t.fee), existingPool: null, priceAinB: "1", priceConfirmed: true });
  if (!cp.ok) throw new Error(cp.reason);
  await send(`CREATE POOL BDEX V3 MSTT/FLOW ${fee / 10000}% (1 MSTT = 1 FLOW · 1 FLOW = 1 MSTT)`, {
    address: v3.positionManager, abi: NPM_ABI, functionName: "createAndInitializePoolIfNecessary",
    args: [cp.token0.address as Address, cp.token1.address as Address, fee, cp.sqrtPriceX96!],
  }, { token0: cp.token0.symbol, token1: cp.token1.symbol, fee, sqrtPriceX96: cp.sqrtPriceX96 });
  const pool3 = await readV3Pool(v3, MSTT, FLOW, fee);
  log.push({ step: "V3 pool after create", detail: j(pool3) });

  // ── Mint ─────────────────────────────────────────────────────────────────
  const tl = nearestUsableTick(pool3.tick - 20 * pool3.tickSpacing, pool3.tickSpacing);
  const tu = nearestUsableTick(pool3.tick + 20 * pool3.tickSpacing, pool3.tickSpacing);
  const t0 = cp.token0.address as Address, t1 = cp.token1.address as Address;
  const want = parseUnits("10", 18);
  const L = liquidityForAmounts(pool3.sqrtPriceX96, getSqrtRatioAtTick(tl), getSqrtRatioAtTick(tu), want, want);
  const exp = amountsForLiquidity(pool3.sqrtPriceX96, getSqrtRatioAtTick(tl), getSqrtRatioAtTick(tu), L);
  await approveExact(t0, v3.positionManager, want, "V3 mint token0");
  await approveExact(t1, v3.positionManager, want, "V3 mint token1");
  await send("BDEX V3 MINT", {
    address: v3.positionManager, abi: NPM_ABI, functionName: "mint",
    args: [{ token0: t0, token1: t1, fee, tickLower: tl, tickUpper: tu, amount0Desired: want, amount1Desired: want, amount0Min: applySlippage(exp.amount0, 100), amount1Min: applySlippage(exp.amount1, 100), recipient: me, deadline: deadlineFrom(now(), 20) }],
  }, { tickLower: tl, tickUpper: tu, expected: exp });
  await clearResidual(t0, v3.positionManager, "V3 mint token0");
  await clearResidual(t1, v3.positionManager, "V3 mint token1");

  // ── Position discovery ───────────────────────────────────────────────────
  let pos = (await discoverV3Positions(v3, me)).find((p) => p.pool?.toLowerCase() === pool3.pool!.toLowerCase());
  if (!pos) throw new Error("V3 position discovery failed");
  log.push({ step: "BDEX V3 POSITION DISCOVERY", detail: j(pos) });
  const id = pos.tokenId;

  // ── Generate a small fee via a real swap through the new pool (SwapRouter) ─
  const SR = parseAbi(["struct P { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 deadline; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }", "function exactInputSingle(P params) payable returns (uint256)"]);
  const router = "0x07032d47A1b9f8460cBeE9dC17c1d3E438693929" as Address;
  const swapIn = parseUnits("1", 18);
  try {
    await approveExact(MSTT, router, swapIn, "Fee-generating swap");
    await send("Fee-generating swap 1 MSTT → FLOW (BDEX V3 SwapRouter)", { address: router, abi: SR, functionName: "exactInputSingle", args: [{ tokenIn: MSTT, tokenOut: FLOW, fee, recipient: me, deadline: deadlineFrom(now(), 20), amountIn: swapIn, amountOutMinimum: 1n, sqrtPriceLimitX96: 0n }] });
    await clearResidual(MSTT, router, "Fee-generating swap");
  } catch (e) { log.push({ step: "Fee-generating swap skipped", detail: (e as Error).message.slice(0, 200) }); }

  // ── Increase ─────────────────────────────────────────────────────────────
  const add = parseUnits("5", 18);
  await approveExact(t0, v3.positionManager, add, "V3 increase token0");
  await approveExact(t1, v3.positionManager, add, "V3 increase token1");
  await send("BDEX V3 INCREASE", { address: v3.positionManager, abi: NPM_ABI, functionName: "increaseLiquidity", args: [{ tokenId: id, amount0Desired: add, amount1Desired: add, amount0Min: 0n, amount1Min: 0n, deadline: deadlineFrom(now(), 20) }] });
  await clearResidual(t0, v3.positionManager, "V3 increase token0");
  await clearResidual(t1, v3.positionManager, "V3 increase token1");

  pos = (await discoverV3Positions(v3, me)).find((p) => p.tokenId === id)!;
  log.push({ step: "Unclaimed fees before collect (static collect)", detail: j({ unclaimed0: pos.unclaimed0, unclaimed1: pos.unclaimed1 }) });

  // ── Collect fees only ────────────────────────────────────────────────────
  await send("BDEX V3 COLLECT (fees)", { address: v3.positionManager, abi: NPM_ABI, functionName: "collect", args: [{ tokenId: id, recipient: me, amount0Max: MAX_UINT128, amount1Max: MAX_UINT128 }] }, { unclaimed0: pos.unclaimed0, unclaimed1: pos.unclaimed1 });

  // ── Decrease 50% then collect ────────────────────────────────────────────
  const half = pos.liquidity / 2n;
  await send("BDEX V3 DECREASE (50%)", { address: v3.positionManager, abi: NPM_ABI, functionName: "decreaseLiquidity", args: [{ tokenId: id, liquidity: half, amount0Min: 0n, amount1Min: 0n, deadline: deadlineFrom(now(), 20) }] }, { liquidity: half });
  await send("BDEX V3 COLLECT (decreased amounts)", { address: v3.positionManager, abi: NPM_ABI, functionName: "collect", args: [{ tokenId: id, recipient: me, amount0Max: MAX_UINT128, amount1Max: MAX_UINT128 }] });

  // ── Close + burn ─────────────────────────────────────────────────────────
  pos = (await discoverV3Positions(v3, me)).find((p) => p.tokenId === id)!;
  await send("BDEX V3 DECREASE (remaining)", { address: v3.positionManager, abi: NPM_ABI, functionName: "decreaseLiquidity", args: [{ tokenId: id, liquidity: pos.liquidity, amount0Min: 0n, amount1Min: 0n, deadline: deadlineFrom(now(), 20) }] });
  await send("BDEX V3 COLLECT (final)", { address: v3.positionManager, abi: NPM_ABI, functionName: "collect", args: [{ tokenId: id, recipient: me, amount0Max: MAX_UINT128, amount1Max: MAX_UINT128 }] });
  await send("BDEX V3 BURN empty position", { address: v3.positionManager, abi: NPM_ABI, functionName: "burn", args: [id] }, { tokenId: id });

  mkdirSync("docs/liquidity", { recursive: true });
  writeFileSync("docs/liquidity/testnet-rehearsal.json", JSON.stringify({ chainId: CHAIN, wallet: me, at: new Date().toISOString(), steps: log }, null, 2));
  console.log("DONE", log.filter((l) => l.hash).length, "txs");
}
main().catch((e) => {
  mkdirSync("docs/liquidity", { recursive: true });
  writeFileSync("docs/liquidity/testnet-rehearsal.partial.json", JSON.stringify({ error: String(e?.message ?? e), steps: log }, null, 2));
  console.error("FAILED", e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
