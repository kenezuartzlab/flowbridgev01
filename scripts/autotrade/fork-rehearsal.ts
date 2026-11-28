// AutoTrade V1.1 LOCAL FORK rehearsal (Anvil fork of BOT Mainnet 677). Zero mainnet
// writes: every tx goes to http://127.0.0.1:8547. Uses Anvil's public test key only.
// Run: anvil --fork-url https://rpc.botchain.ai --chain-id 677 --port 8547
//      bun scripts/autotrade/fork-rehearsal.ts > docs/security/autotrade-v1_1/fork_rehearsal.json
import { createPublicClient, createWalletClient, http, parseAbi, keccak256, type Hex, encodeFunctionData, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MAINNET_CONTRACTS as M } from "@/lib/contracts";
import { AUTOTRADE_PAIRS, ROUTER_V4, pairById } from "@/lib/autotrade/config";
import { buyFloor, sellFloor, slippageFloor, parsePrice, type Rational } from "@/lib/autotrade/engine";
import { planAmounts, buildLegCall, assertAllowlisted, outboxApply, receivedFromLogs, nativeReceived, verifyDeployment, LEG_SELECTORS, type OutboxEntry } from "@/lib/autotrade/executor";
import { legPath } from "@/lib/autotrade/path";

const URL_ = "http://127.0.0.1:8547";
const chain = { id: 677, name: "bot-fork", nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 }, rpcUrls: { default: { http: [URL_] } } } as const;
const pc = createPublicClient({ chain, transport: http(URL_) });
const acct = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"); // Anvil test key #0 (public)
const wc = createWalletClient({ chain, account: acct, transport: http(URL_) });
const rpc = (method: string, params: any[] = []) => pc.request({ method: method as any, params: params as any });
const R = ROUTER_V4.toLowerCase() as Hex;
const ERC20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)", "function approve(address,uint256) returns (bool)"]);
const V4R = parseAbi(["function owner() view returns (address)", "function paused() view returns (bool)", "function routerCount() view returns (uint256)", "function routers(uint256) view returns (address,uint8,address,bool,string,string)", "function routerFeeBps(uint256) view returns (uint256)", "function feeTreasury() view returns (address)", "function pause()", "function unpause()",
  "function registerRouter(address,uint8,address,string,string) returns (uint256)",
  "function swapNativeToTokenSafe(uint256,uint256,address,uint24,uint256,address[],address,uint256,uint256) payable returns (uint256)",
  "function swapTokenToNativeSafe(uint256,address,uint24,uint256,uint256,address[],address,uint256,uint256) returns (uint256)",
  "function swapV2Safe(uint256,uint256,uint256,address[],address,uint256,uint256) returns (uint256[])",
  "function swapV3SingleSafe(uint256,address,address,uint24,uint256,uint256,address,uint256,uint256) returns (uint256)"]);
const QUOTER = parseAbi(["function quoteExactInput(bytes path,uint256 amountIn) returns (uint256,uint160[],uint32[],uint256)"]);
const out: any = { kind: "LOCAL_ANVIL_FORK_ONLY", mainnetWrites: 0, steps: [] as any[] };
const log = (name: string, data: any) => { out.steps.push({ name, ...JSON.parse(JSON.stringify(data, (_k, v) => typeof v === "bigint" ? v.toString() : v)) }); };
const T = (a: string) => a.toLowerCase() as Hex;
const bal = (tok: string, who: string) => pc.readContract({ address: T(tok), abi: ERC20, functionName: "balanceOf", args: [T(who)] });
const deadline = async () => (await pc.getBlock()).timestamp + 600n;
const quote = async (p: any, side: "buy" | "sell", amt: bigint) => (await pc.simulateContract({ address: T(M.bdexV3Quoter), abi: QUOTER, functionName: "quoteExactInput", args: [legPath(p, side), amt] })).result[0];
async function send(tx: { to: Hex; data: Hex; value?: bigint }, from?: Hex) {
  const hash = from ? await rpc("eth_sendTransaction", [{ from, to: tx.to, data: tx.data, value: "0x" + (tx.value ?? 0n).toString(16) }]) as Hex
    : await wc.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ?? 0n });
  return pc.waitForTransactionReceipt({ hash });
}
async function routerSnapshot() { const s: Record<string, bigint> = { native: await pc.getBalance({ address: R }) }; for (const t of [M.caToken, M.wbot, M.usdtBot, M.flowToken, M.caWbot]) s[t] = await bal(t, R); return s; }
const diff = (a: Record<string, bigint>, b: Record<string, bigint>) => Object.keys(a).filter((k) => a[k] !== b[k]);

async function leg(pairId: string, side: "buy" | "sell", total: bigint, bound: Rational | null, slipBps = 100, expectRevert = false) {
  const p = pairById(pairId)!; const feeBps = Number(await pc.readContract({ address: R, abi: V4R, functionName: "routerFeeBps", args: [0n] }));
  const plan = planAmounts(total, feeBps);
  const q = await quote(p, side, plan.swapAmount);
  const floor = bound ? (side === "buy" ? buyFloor(plan.pulled, bound, p) : sellFloor(plan.pulled, bound, p)) : 1n;
  const minOut = expectRevert ? floor : (floor > slippageFloor(q, slipBps) ? floor : slippageFloor(q, slipBps));
  const decision = q >= floor ? "SUBMIT" : "WAIT_PRICE_NOT_MET";
  const call = buildLegCall(p, side, plan, minOut, acct.address.toLowerCase() as Hex, await deadline()); assertAllowlisted(call);
  const tokOut = side === "buy" ? p.base : p.quote; const tokIn = side === "buy" ? p.quote : p.base;
  const treasury = await pc.readContract({ address: R, abi: V4R, functionName: "feeTreasury" });
  const tBefore = tokIn.native ? await pc.getBalance({ address: treasury }) : await bal(tokIn.address, treasury);
  const rBefore = await routerSnapshot();
  if (call.approval) await send({ to: call.approval.token, data: encodeFunctionData({ abi: ERC20, functionName: "approve", args: [R, call.approval.amount] }) });
  const nBefore = await pc.getBalance({ address: acct.address }); const inBefore = tokIn.native ? 0n : await bal(tokIn.address, acct.address);
  let receipt: any; let reverted = false; let revertReason = "";
  try { await pc.call({ account: acct.address, to: call.to, data: call.data, value: call.value }); receipt = await send(call); if (receipt.status !== "success") { reverted = true; revertReason = "MINED_REVERTED"; } } catch (e: any) { reverted = true; revertReason = (e.shortMessage ?? e.message).slice(0, 160); }
  const rAfter = await routerSnapshot();
  const tAfter = tokIn.native ? await pc.getBalance({ address: treasury }) : await bal(tokIn.address, treasury);
  const got = reverted ? 0n : tokOut.native ? nativeReceived(nBefore, await pc.getBalance({ address: acct.address }), receipt.gasUsed, receipt.effectiveGasPrice) : receivedFromLogs(receipt.logs, tokOut.address, acct.address);
  const spent = reverted ? 0n : tokIn.native ? call.value : inBefore - await bal(tokIn.address, acct.address);
  const allowLeft = tokIn.native ? 0n : await pc.readContract({ address: T(tokIn.address), abi: ERC20, functionName: "allowance", args: [acct.address, R] });
  if (reverted && call.approval) await send({ to: call.approval.token, data: encodeFunctionData({ abi: ERC20, functionName: "approve", args: [R, 0n] }) }); // emergency revoke
  const v3Allow = tokIn.native ? 0n : await pc.readContract({ address: T(tokIn.address), abi: ERC20, functionName: "allowance", args: [R, T(M.bdexV3Router)] });
  const r = { pair: pairId, side, fn: call.fn, budget: total, swapAmount: plan.swapAmount, fee: plan.fee, pulled: plan.pulled, quoted: q, floor, minOut, decision, reverted, revertReason,
    actualOut: got, actualSpent: spent, spentEqualsPulled: reverted || spent === plan.pulled, outAtLeastMin: reverted || got >= minOut, treasuryFeeDelta: tAfter - tBefore, feeOnce: reverted || tAfter - tBefore === plan.fee,
    routerResidualChanged: diff(rBefore, rAfter), traderAllowanceLeft: allowLeft, routerToV3Allowance: v3Allow, gasUsed: receipt?.gasUsed ?? null, block: receipt?.blockNumber ?? null };
  log(`leg ${pairId} ${side}${expectRevert ? " (forced floor)" : ""}`, r); return r;
}

async function main() {
  const head = await pc.getBlock(); const code = (await pc.getCode({ address: R }))!;
  out.fork = { chainId: await pc.getChainId(), forkHead: head.number, forkHash: head.hash, forkTime: new Date(Number(head.timestamp) * 1000).toISOString() };
  const owner = await pc.readContract({ address: R, abi: V4R, functionName: "owner" });
  const e0 = await pc.readContract({ address: R, abi: V4R, functionName: "routers", args: [0n] });
  const facts = { chainId: out.fork.chainId, codeKeccak: keccak256(code), paused: await pc.readContract({ address: R, abi: V4R, functionName: "paused" }), owner, routerCount: Number(await pc.readContract({ address: R, abi: V4R, functionName: "routerCount" })),
    entry: { router: e0[0], rtype: e0[1], wrappedNative: e0[2], active: e0[3] }, routerFeeBps: Number(await pc.readContract({ address: R, abi: V4R, functionName: "routerFeeBps", args: [0n] })),
    selectorsInCode: Object.fromEntries(Object.values(LEG_SELECTORS).map((s) => [s, code.includes(s.slice(2))])) };
  log("deployment identity", { facts, errors: verifyDeployment(facts, { routerId: 0, v3Router: M.bdexV3Router, wbot: M.wbot, feeBps: 1 }) });
  await rpc("anvil_setBalance", [acct.address, "0x" + (10n ** 22n).toString(16)]);

  // ---- AutoTrade legs (BDEX V3 registered venue) ----
  const usdtBuy = await leg("BOT/USDT", "sell", parseUnits("50", 18), null); // acquire USDT from native BOT (sell BOT)
  const mkt = (side: "buy", p: any, total: bigint, q: bigint) => q; void mkt;
  for (const id of ["CA/BOT", "CA/USDT", "BOT/USDT", "FLOW/USDT"]) {
    const p = pairById(id)!; const budget = id === "CA/BOT" ? parseUnits("1", 18) : parseUnits("5", 6);
    const plan = planAmounts(budget, 1); const q = await quote(p, "buy", plan.swapAmount);
    const unit = 10n ** BigInt(p.base.decimals); const qu = 10n ** BigInt(p.quote.decimals);
    // market price quote/base as rational; max buy = market * 1.03, adverse max buy = market * 0.9
    const mk = (mul: bigint): Rational => ({ num: plan.pulled * unit * mul, den: q * qu * 100n });
    await leg(id, "buy", budget, mk(90n), 100, true);                 // adverse: price not met -> on-chain floor reverts
    const b = await leg(id, "buy", budget, mk(103n));                 // exact price-bound buy
    const sellAmt = b.actualOut as bigint;
    const sq = await quote(p, "sell", planAmounts(sellAmt, 1).swapAmount);
    const sellMk = (mul: bigint): Rational => ({ num: sq * unit * mul, den: planAmounts(sellAmt, 1).pulled * qu * 100n });
    await leg(id, "sell", sellAmt, sellMk(110n), 100, true);          // sell min above market -> waits / floor reverts
    await leg(id, "sell", sellAmt, sellMk(97n));                      // sell exactly acquired amount at bound
    if (p.base.native) continue;
    log(`residual ${id}`, { traderBaseLeft: await bal(p.base.address, acct.address) });
  }
  void usdtBuy;

  // ---- pause race ----
  await rpc("anvil_impersonateAccount", [owner]); await rpc("anvil_setBalance", [owner, "0x" + (10n ** 20n).toString(16)]);
  await send({ to: R, data: encodeFunctionData({ abi: V4R, functionName: "pause" }) }, T(owner));
  const paused = await leg("BOT/USDT", "sell", parseUnits("1", 18), null);
  await send({ to: R, data: encodeFunctionData({ abi: V4R, functionName: "unpause" }) }, T(owner));
  log("pause race", { revertedWhilePaused: paused.reverted, reason: paused.revertReason });

  // ---- arbitrary target / unknown router id ----
  try { await pc.simulateContract({ account: acct.address, address: R, abi: V4R, functionName: "swapV3SingleSafe", args: [7n, T(M.usdtBot), T(M.wbot), 3000, 1n, 1n, acct.address, await deadline(), 0n] }); log("unknown routerId", { reverted: false }); }
  catch (e: any) { log("unknown routerId", { reverted: true, reason: (e.shortMessage ?? "").slice(0, 120) }); }
  try { assertAllowlisted({ to: M.bdexV3Router, data: "0x12345678" }); } catch (e: any) { log("executor arbitrary target", { rejected: e.message }); }

  // ---- nonce replacement ----
  await rpc("evm_setAutomine", [false]);
  const nonce = await pc.getTransactionCount({ address: acct.address, blockTag: "pending" });
  const gp = await pc.getGasPrice();
  const p = pairById("BOT/USDT")!; const plan = planAmounts(parseUnits("1", 18), 1);
  const call = buildLegCall(p, "sell", plan, 1n, acct.address.toLowerCase() as Hex, await deadline());
  const raw1 = await wc.signTransaction({ to: call.to, data: call.data, value: call.value, nonce, gas: 600_000n, gasPrice: gp });
  const h1 = await pc.sendRawTransaction({ serializedTransaction: raw1 });
  const raw2 = await wc.signTransaction({ to: acct.address, value: 0n, nonce, gas: 21_000n, gasPrice: gp * 3n });
  const h2 = await pc.sendRawTransaction({ serializedTransaction: raw2 });
  await rpc("evm_mine"); await rpc("evm_setAutomine", [true]);
  const r1 = await pc.getTransactionReceipt({ hash: h1 }).catch(() => null); const r2 = await pc.getTransactionReceipt({ hash: h2 }).catch(() => null);
  let ob: OutboxEntry = { idempotencyKey: "o:sell", nonce, state: "RESERVED", txHash: null, minedBlock: null, minedHash: null };
  ob = outboxApply(outboxApply(ob, { type: "signed", txHash: h1 }), { type: "broadcast" });
  if (!r1 && r2) ob = outboxApply(ob, { type: "nonceUsedByOther" });
  log("nonce replacement", { original: h1, originalMined: !!r1, replacement: h2, replacementMined: !!r2, outboxState: ob.state });

  // ---- reorg: snapshot, mine leg, revert, rebroadcast SAME signed bytes ----
  const snap = await rpc("evm_snapshot");
  const n2 = await pc.getTransactionCount({ address: acct.address, blockTag: "pending" });
  const raw = await wc.signTransaction({ to: call.to, data: call.data, value: call.value, nonce: n2, gas: 600_000n, gasPrice: gp });
  const h = await pc.sendRawTransaction({ serializedTransaction: raw }); const rc = await pc.waitForTransactionReceipt({ hash: h });
  ob = { idempotencyKey: "o2:sell", nonce: n2, state: "RESERVED", txHash: null, minedBlock: null, minedHash: null };
  ob = outboxApply(outboxApply(outboxApply(ob, { type: "signed", txHash: h }), { type: "broadcast" }), { type: "mined", block: Number(rc.blockNumber), blockHash: rc.blockHash, status: rc.status === "success" ? "success" : "reverted" });
  await rpc("evm_revert", [snap]);
  const gone = await pc.getTransactionReceipt({ hash: h }).catch(() => null);
  const hashNow = (await pc.getBlock({ blockNumber: rc.blockNumber }).catch(() => null))?.hash ?? null;
  ob = outboxApply(ob, { type: "head", head: Number(await pc.getBlockNumber()), hashAtMined: hashNow, minConf: 6 });
  const stateAfterReorg = ob.state;
  const h3 = await pc.sendRawTransaction({ serializedTransaction: raw }); const rc3 = await pc.waitForTransactionReceipt({ hash: h3 });
  log("reorg", { minedThenReorged: !gone, outboxAfterReorg: stateAfterReorg, rebroadcastSameHash: h3 === h, reincludedStatus: rc3.status, extraTxSigned: false });

  // ---- CaSwap V2 / BDEX V2 registry compatibility (fork-only owner tx) ----
  const reg = async (router: string, wn: string, name: string) => {
    const before = Number(await pc.readContract({ address: R, abi: V4R, functionName: "routerCount" }));
    const rc = await send({ to: R, data: encodeFunctionData({ abi: V4R, functionName: "registerRouter", args: [T(router), 0, T(wn), name, "2"] }) }, T(owner));
    return { id: before, status: rc.status };
  };
  const cas = await reg(M.caSwapRouter, M.caWbot, "CaSwap V2 (fork)");
  for (const amt of [10n ** 12n, 10n ** 15n, 10n ** 18n]) {
    const fee = amt / 10_000n * BigInt(0);
    try {
      const fb = Number(await pc.readContract({ address: R, abi: V4R, functionName: "routerFeeBps", args: [BigInt(cas.id)] }));
      const f = (amt * BigInt(fb || 10)) / 10_000n; // global fee applies when per-router unset
      const before = await bal(M.caToken, acct.address);
      const sim = await pc.simulateContract({ account: acct.address, address: R, abi: V4R, functionName: "swapNativeToTokenSafe", args: [BigInt(cas.id), amt, T(M.caToken), 0, 1n, [T(M.caWbot), T(M.caToken)], acct.address, await deadline(), f], value: amt + f }).catch(async (e) => {
        // fee may be global; retry by reading computeRouterFee
        throw e; });
      const rc = await wc.writeContract(sim.request); await pc.waitForTransactionReceipt({ hash: rc });
      log(`CaSwap native BOT->CA via V4 (${amt})`, { ok: true, caOut: (await bal(M.caToken, acct.address)) - before, feeArg: f });
    } catch (e: any) { log(`CaSwap native BOT->CA via V4 (${amt})`, { ok: false, reason: (e.shortMessage ?? e.message).slice(0, 160) }); }
    void fee;
  }
  const bdx = await reg(M.bdexV2Router, M.wbot, "BDEX V2 (fork)");
  log("fork-only registerRouter", { caswap: cas, bdexV2: bdx, note: "impersonated owner on LOCAL fork only; no mainnet transaction" });
  out.summary = { legs: out.steps.filter((s: any) => s.name.startsWith("leg")).length };
  console.log(JSON.stringify(out, (_k, v) => typeof v === "bigint" ? v.toString() : v, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });
