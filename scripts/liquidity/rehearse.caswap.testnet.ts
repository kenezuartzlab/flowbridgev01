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
const j = (x: unknown) => (x === undefined ? null : JSON.parse(JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v))));

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
  const ca = getVenue(CHAIN, "caswap") as V2Venue;
  const { wrapped, factory } = await v2Wiring(ca);
  log.push({ step: "CaSwap wiring (read from router)", detail: { router: ca.router, factory, wrapped } });
  const before = await readV2Pair(ca, MSTT, wrapped);
  const mAmt = parseUnits("50", 18);
  const pool = before && before.reserve0 > 0n ? (before.token0.toLowerCase() === MSTT.toLowerCase() ? { reserveA: before.reserve0, reserveB: before.reserve1, totalSupply: before.totalSupply } : { reserveA: before.reserve1, reserveB: before.reserve0, totalSupply: before.totalSupply }) : null;
  const plan = planAddV2(mAmt, pool ? null : parseUnits("0.01", 18), pool, 100, { a: await readBalance(CHAIN, MSTT, me), b: await readBalance(CHAIN, "native", me) });
  await approveExact(MSTT, ca.router, plan.amountADesired, "CaSwap add");
  await send(`CASWAP ${plan.newPair ? "CREATE PAIR + " : ""}ADD LIQUIDITY (addLiquidityETH MSTT + tBOT)`, { address: ca.router, abi: V2_ROUTER_ABI, functionName: "addLiquidityETH", value: plan.amountBDesired, args: [MSTT, plan.amountADesired, plan.amountAMin, plan.amountBMin, me, deadlineFrom(now(), 20)] }, plan);
  await clearResidual(MSTT, ca.router, "CaSwap add");
  const pair = (await readV2Pair(ca, MSTT, wrapped))!;
  const found = (await discoverV2Positions(ca, me)).find((p) => p.pair.toLowerCase() === pair.pair!.toLowerCase());
  if (!found) throw new Error("CaSwap LP discovery failed");
  log.push({ step: "CASWAP LP DISCOVERY", detail: j({ pair: found.pair, lp: found.lpBalance, shareBps: found.shareBps }) });
  const mIs0 = pair.token0.toLowerCase() === MSTT.toLowerCase();
  const rp = planRemoveV2(found.lpBalance, { pct: 50 }, { reserveA: mIs0 ? pair.reserve0 : pair.reserve1, reserveB: mIs0 ? pair.reserve1 : pair.reserve0, totalSupply: pair.totalSupply }, 100);
  await approveExact(pair.pair!, ca.router, rp.liquidity, "CaSwap remove");
  await send("CASWAP REMOVE LIQUIDITY (removeLiquidityETH 50%)", { address: ca.router, abi: V2_ROUTER_ABI, functionName: "removeLiquidityETH", args: [MSTT, rp.liquidity, rp.amountAMin, rp.amountBMin, me, deadlineFrom(now(), 20)] }, rp);
  await clearResidual(pair.pair!, ca.router, "CaSwap remove");
  writeFileSync("docs/liquidity/testnet-rehearsal-caswap.json", JSON.stringify({ chainId: CHAIN, wallet: me, at: new Date().toISOString(), steps: log }, null, 2));
  console.log("DONE");
}
main().catch((e) => { writeFileSync("docs/liquidity/testnet-rehearsal-caswap.partial.json", JSON.stringify({ error: String(e?.message ?? e), steps: log }, null, 2)); console.error("FAILED", e?.shortMessage ?? e?.message ?? e); process.exit(1); });
