/** Local Anvil + isolated PostgreSQL + mocked HTTP broker; no external effects. */
import { mkdirSync, writeFileSync } from "node:fs";
import { createPublicClient, encodeFunctionData, http, keccak256, parseAbi, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MAINNET_CONTRACTS as M } from "@/lib/contracts";
import { pairById, ROUTER_V4 } from "@/lib/autotrade/config";
import { buildLegCall, planAmounts, ROUTER_V4_RUNTIME_KECCAK } from "@/lib/autotrade/executor";
import { legPath } from "@/lib/autotrade/path";
import { executeManagedEffect, type ManagedEffectIO, type ManagedEffectRequest } from "@/lib/autotrade/liveTransport";
import { ManagedExecutionStore } from "@/lib/autotrade/managedStore.server";
import { brokerSign } from "@/lib/autotrade/managedSigner.server";
import { canaryReceiptOutput } from "@/lib/autotrade/managedRpc.server";
import { managedDatabaseFixture, FIXTURE_ORDER, FIXTURE_HOLDER, FIXTURE_ATTEMPT } from "./managed-store-fixture";
const URL = "http://127.0.0.1:8547";
const pc = createPublicClient({ transport: http(URL, { retryCount: 0 }) });
const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const rpc = (method: string, params: unknown[]) => pc.request({ method: method as never, params: params as never });
const QUOTER = parseAbi(["function quoteExactInput(bytes,uint256) returns (uint256,uint160[],uint32[],uint256)"]);
const ERC20 = parseAbi(["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)"]);
async function main() {
  if (URL !== "http://127.0.0.1:8547" || await pc.getChainId() !== 677) throw new Error("LOCAL_ONLY");
  const head = await pc.getBlock(); const code = await pc.getCode({ address: ROUTER_V4 });
  if (!code || keccak256(code) !== ROUTER_V4_RUNTIME_KECCAK) throw new Error("ROUTER_IDENTITY");
  const fixture = await managedDatabaseFixture(); await fixture.reset();
  try {
    await rpc("anvil_setBalance", [account.address, `0x${parseUnits("1000", 18).toString(16)}`]);
    const store = new ManagedExecutionStore(fixture.client, { holder: FIXTURE_HOLDER, fencing: 1, attempt: FIXTURE_ATTEMPT }, async () => Number(BigInt(await rpc("eth_getTransactionCount", [account.address, "pending"]) as string)));
    const signer = { origin: "https://mock-broker.example.org", credential: "offline-only", keyId: "fixture", account: account.address, custodyReviewed: true };
    let signatures = 0, broadcasts = 0, crash = true;
    const receipts: { side: string; actualOut: string; block: string; gasUsed: string }[] = [];
    const io: Omit<ManagedEffectIO, "advance"> = {
      authorize: async r => { if (await pc.getChainId() !== 677) throw new Error("LOCAL_ONLY"); await store.authorize(r); }, reserve: store.reserve,
      sign: async (r, nonce) => brokerSign(signer, r, nonce, () => store.authorize(r), async (_url, init) => {
        signatures++; const p = JSON.parse(String(init?.body));
        return Response.json({ serializedTransaction: await account.signTransaction({ chainId: p.chainId, nonce: p.nonce, to: p.to, data: p.data, value: BigInt(p.value), gas: BigInt(p.gas), gasPrice: BigInt(p.maxFeePerGas) }) });
      }),
      broadcast: async raw => { broadcasts++; const hash = await pc.sendRawTransaction({ serializedTransaction: raw }); if (crash) { crash = false; throw new Error("LOCAL_CRASH_AFTER_BROADCAST"); } return hash; },
      receipt: async (hash, r) => {
        const receipt = await pc.waitForTransactionReceipt({ hash, pollingInterval: 50, timeout: 10000 });
        await rpc("anvil_mine", ["0x6", "0x0"]);
        const output = receipt.status === "success" ? canaryReceiptOutput({ transactionHash: receipt.transactionHash, blockHash: receipt.blockHash, blockNumber: `0x${receipt.blockNumber.toString(16)}`, status: "0x1", from: receipt.from, to: receipt.to ?? "0x", logs: receipt.logs.map(l => ({ address: l.address, topics: [...l.topics], data: l.data })) }, r) : 0n;
        receipts.push({ side: r.side, actualOut: output.toString(), block: receipt.blockNumber.toString(), gasUsed: receipt.gasUsed.toString() });
        return { final: true, status: receipt.status, actualOut: output, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash };
      },
    };
    const execute = (r: ManagedEffectRequest) => executeManagedEffect(r, { ...io, advance: store.advance(r) });
    const pair = pairById("CA/BOT"); if (!pair) throw new Error("PAIR");
    const gasPrice = await pc.getGasPrice();
    const make = async (side: "buy" | "sell", total: bigint): Promise<ManagedEffectRequest> => {
      const plan = planAmounts(total, 1);
      const out = (await pc.simulateContract({ address: M.bdexV3Quoter.toLowerCase() as Address, abi: QUOTER, functionName: "quoteExactInput", args: [legPath(pair, side), plan.swapAmount] })).result[0];
      const leg = buildLegCall(pair, side, plan, out * 99n / 100n, account.address, head.timestamp + 900n);
      return { key: `local-operational:${side}`, orderId: FIXTURE_ORDER, account: account.address, side, call: leg, leg, gas: 600000n, maxFeePerGas: gasPrice, maxGasWei: parseUnits("0.05", 18), routeGuard: { verified: true, registered: true, quoteOnly: false, externalFeeBps: 0, feeMutable: false } };
    };
    const balances = async () => ({ native: await pc.getBalance({ address: ROUTER_V4 }), ca: await pc.readContract({ address: M.caToken.toLowerCase() as Address, abi: ERC20, functionName: "balanceOf", args: [ROUTER_V4] }), wbot: await pc.readContract({ address: M.wbot.toLowerCase() as Address, abi: ERC20, functionName: "balanceOf", args: [ROUTER_V4] }) });
    const before = await balances();
    const buy = await make("buy", parseUnits("1", 18)); // Local fixture, not an owner price/order.
    await fixture.seed([buy]);
    try { await execute(buy); throw new Error("CRASH_NOT_INJECTED"); } catch (e) { if (!(e instanceof Error) || e.message !== "LOCAL_CRASH_AFTER_BROADCAST") throw e; }
    const bought = await execute(buy);
    if (!bought.actualOut || signatures !== 1 || broadcasts !== 1) throw new Error("RECOVERY_FAILED");
    const sell = await make("sell", bought.actualOut); const approval = sell.leg.approval; if (!approval) throw new Error("APPROVAL");
    const effect = (side: "approve" | "revoke", amount: bigint): ManagedEffectRequest => ({ ...sell, key: `local-operational:${side}`, side, call: { to: approval.token, value: 0n, data: encodeFunctionData({ abi: ERC20, functionName: "approve", args: [ROUTER_V4, amount] }) } });
    const approve = effect("approve", approval.amount), revoke = effect("revoke", 0n);
    await fixture.seed([approve, sell, revoke], 1);
    // High fee must fail before broker/nonce effect even with an otherwise executable fork route.
    try { await executeManagedEffect({ ...buy, routeGuard: { ...buy.routeGuard, externalFeeBps: 7300 } }, { ...io, authorize: async () => {}, advance: store.advance(buy) }); throw new Error("HIGH_FEE_ACCEPTED"); } catch (e) { if (!(e instanceof Error) || e.message !== "ROUTE_GUARD_REJECTED") throw e; }
    await execute(approve); const sold = await execute(sell); await execute(revoke);
    const allowance = await pc.readContract({ address: approval.token, abi: ERC20, functionName: "allowance", args: [account.address, ROUTER_V4] });
    const routerAllowance = await pc.readContract({ address: approval.token, abi: ERC20, functionName: "allowance", args: [ROUTER_V4, M.bdexV3Router.toLowerCase() as Address] });
    const after = await balances();
    const order = (await fixture.db.query<{ state: string; version: number }>("SELECT state,version FROM autotrade_orders")).rows[0];
    if (sold.state !== "FINAL" || order?.state !== "COMPLETED" || order.version !== 4 || signatures !== 4 || broadcasts !== 4 || allowance !== 0n || routerAllowance !== 0n || before.native !== after.native || before.ca !== after.ca || before.wbot !== after.wbot) throw new Error("FINAL_STATE_FAILED");
    const journal = (await fixture.db.query("SELECT nonce,state,actual_out,receipt_block,receipt_block_hash FROM autotrade_managed_effects ORDER BY nonce")).rows;
    const evidence = { kind: "LOCAL_ANVIL_ISOLATED_POSTGRES_MOCK_BROKER", fork: { block: head.number, hash: head.hash, chain: 677 }, routerRuntime: keccak256(code), signatures, broadcasts, receipts, journal, order, allowance, routerAllowance, zeroResiduals: true, crashRecovery: true, highFeeRejected: true, mainnetWrites: 0, externalSignatures: 0, actualAccountProvisioned: false };
    mkdirSync("docs/security/autotrade-operational", { recursive: true });
    writeFileSync("docs/security/autotrade-operational/fork.json", JSON.stringify(evidence, (_k, v) => typeof v === "bigint" ? v.toString() : v, 2));
    console.log("PASS: local fork + actual PostgreSQL durable journal + mock broker; four effects, crash recovery, fee cap, canonical amounts, zero residuals.");
  } finally { await fixture.db.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });