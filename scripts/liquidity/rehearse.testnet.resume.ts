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
  const v3 = getVenue(CHAIN, "bdex-v3") as V3Venue;
  const prev = JSON.parse((await import("node:fs")).readFileSync("docs/liquidity/testnet-rehearsal.partial.json", "utf8")).steps;
  log.push(...prev.filter((s: any) => s.step !== "Fee-generating swap skipped"));
  for (const [step, hash] of [["Fee-generating swap 1 MSTT → FLOW (BDEX V3 SwapRouter)", "0xeff1c11b779f793c0fcfc49a9b624a0ef4211f3057b45f9bf4d5d78a5c87dd34"], ["BDEX V3 INCREASE", "0x0ee45a96025b5ab1071e5be2f8a9ef867d65391ad4a5e28a8456c8f25ca6a0cc"]]) {
    const r = await pub.getTransactionReceipt({ hash: hash as Hex });
    if (r.status !== "success") throw new Error(step + " not successful");
    log.push({ step, hash, status: r.status, detail: "recovered from chain (script logging bug after mining)" });
  }
  await clearResidual(MSTT, "0x07032d47A1b9f8460cBeE9dC17c1d3E438693929", "Fee-generating swap");
  const pool3 = await readV3Pool(v3, MSTT, FLOW, 3000);
  const all = await discoverV3Positions(v3, me);
  let pos = all.find((p) => p.pool?.toLowerCase() === pool3.pool!.toLowerCase() && p.liquidity > 0n)!;
  const id = pos.tokenId;
  const [t0, t1] = [pos.token0.address, pos.token1.address];
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
  writeFileSync("docs/liquidity/testnet-rehearsal.partial2.json", JSON.stringify({ error: String(e?.message ?? e), steps: log }, null, 2));
  console.error("FAILED", e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
