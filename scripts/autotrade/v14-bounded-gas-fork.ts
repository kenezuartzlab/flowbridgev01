// LOCAL ANVIL ONLY. Mock KMS broker uses the published disposable Anvil key, never a real credential.
import { mkdirSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, encodeFunctionData, http, keccak256, parseAbi, parseUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MAINNET_CONTRACTS as M } from "@/lib/contracts";
import { pairById, ROUTER_V4 } from "@/lib/autotrade/config";
import { buildLegCall, planAmounts, ROUTER_V4_RUNTIME_KECCAK } from "@/lib/autotrade/executor";
import { legPath } from "@/lib/autotrade/path";
import { executeManagedEffect, type ManagedEffectIO, type ManagedEffectRequest, type ManagedEffectRow } from "@/lib/autotrade/liveTransport";
import { boundedGasProposal, type GasFootprint } from "@/lib/autotrade/canaryTicket";
import { convertCapToBot } from "@/lib/autotrade/canaryPreparation";
import { brokerSign } from "@/lib/autotrade/managedSigner.server";
import { canaryReceiptOutput } from "@/lib/autotrade/managedRpc.server";

const URL = "http://127.0.0.1:8547";
const chain = { id: 677, name: "local-bot-fork", nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 }, rpcUrls: { default: { http: [URL] } } } as const;
const pc = createPublicClient({ chain, transport: http(URL, { retryCount: 0 }) });
const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const wallet = createWalletClient({ chain, account, transport: http(URL, { retryCount: 0 }) });
const rpc = (method: string, params: unknown[]) => pc.request({ method: method as never, params: params as never });
const QUOTER = parseAbi(["function quoteExactInput(bytes,uint256) returns (uint256,uint160[],uint32[],uint256)"]);
const ERC20 = parseAbi(["function approve(address,uint256) returns (bool)", "function allowance(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)"]);
const rows = new Map<string, ManagedEffectRow>();
let nonce = 0, signatures = 0, broadcasts = 0, injectCrash = true;
const gasFootprint: GasFootprint = { buy: 0n, approve: 0n, sell: 0n, revoke: 0n };
const receipts: { side: string; actualOut: string; gasUsed: string; hash: string }[] = [];
const signer = { origin: "https://offline-kms-fixture.example.org", credential: "offline-only", keyId: "anvil-disposable-fixture", account: account.address, custodyReviewed: true };

const io: ManagedEffectIO = {
  authorize: async () => { if (URL !== "http://127.0.0.1:8547" || await pc.getChainId() !== 677) throw new Error("LOCAL_ONLY"); },
  reserve: async r => {
    const old = rows.get(r.key); if (old) return old;
    if ([...rows.values()].some(e => !["FINAL", "REVERTED"].includes(e.state))) throw new Error("OPEN_EFFECT");
    const row: ManagedEffectRow = { key: r.key, nonce: nonce++, state: "RESERVED", raw: null, hash: null };
    rows.set(r.key, row); return row;
  },
  advance: async (old, next) => { if (rows.get(old.key)?.state !== old.state) throw new Error("FENCE_LOST"); rows.set(next.key, next); },
  sign: async (r, n) => brokerSign(signer, r, n, async () => io.authorize(r), async (_url, init) => {
    // No HTTP call to the fixture broker. Only local test-account signing occurs.
    const b = JSON.parse(String(init?.body)); signatures++;
    const raw = await wallet.signTransaction({ to: b.to, data: b.data, value: BigInt(b.value), nonce: b.nonce, gas: BigInt(b.gas), gasPrice: BigInt(b.maxFeePerGas) });
    return Response.json({ serializedTransaction: raw });
  }),
  broadcast: async raw => {
    broadcasts++;
    const hash = await pc.sendRawTransaction({ serializedTransaction: raw });
    if (injectCrash) { injectCrash = false; throw new Error("INJECTED_CRASH_AFTER_LOCAL_BROADCAST"); }
    return hash;
  },
  receipt: async (hash, r) => {
    const receipt = await pc.waitForTransactionReceipt({ hash, pollingInterval: 50, timeout: 10_000 });
    await rpc("anvil_mine", ["0x6", "0x0"]);
    const output = receipt.status === "success" ? canaryReceiptOutput({
      transactionHash: receipt.transactionHash, blockHash: receipt.blockHash, blockNumber: `0x${receipt.blockNumber.toString(16)}`,
      status: "0x1", from: receipt.from, to: receipt.to ?? "0x", logs: receipt.logs.map(l => ({ address: l.address, topics: [...l.topics], data: l.data })),
    }, r) : 0n;
    receipts.push({ side: r.side, actualOut: output.toString(), gasUsed: receipt.gasUsed.toString(), hash });
    return { final: true, status: receipt.status, actualOut: output };
  },
};

async function withGas(r: ManagedEffectRequest) {
  const units = await pc.estimateGas({ account: account.address, to: r.call.to, data: r.call.data, value: r.call.value });
  gasFootprint[r.side] = units;
  return { ...r, gas: (units * 120n + 99n) / 100n };
}

async function main() {
  if (await pc.getChainId() !== 677) throw new Error("CHAIN_ID");
  const head = await pc.getBlock();
  const code = await pc.getCode({ address: ROUTER_V4 });
  if (!code || keccak256(code) !== ROUTER_V4_RUNTIME_KECCAK) throw new Error("ROUTER_IDENTITY");
  await rpc("anvil_setBalance", [account.address, `0x${parseUnits("1000", 18).toString(16)}`]);
  nonce = Number(BigInt(await rpc("eth_getTransactionCount", [account.address, "pending"]) as string));
  const pair = pairById("CA/BOT"); if (!pair) throw new Error("PAIR");
  const balances = async () => ({ native: await pc.getBalance({ address: ROUTER_V4 }), ca: await pc.readContract({ address: M.caToken.toLowerCase() as Address, abi: ERC20, functionName: "balanceOf", args: [ROUTER_V4] }), wbot: await pc.readContract({ address: M.wbot.toLowerCase() as Address, abi: ERC20, functionName: "balanceOf", args: [ROUTER_V4] }) });
  const before = await balances();
  const gasPrice = await pc.getGasPrice();
  const make = async (side: "buy" | "sell", total: bigint) => {
    const plan = planAmounts(total, 1);
    const quote = (await pc.simulateContract({ address: M.bdexV3Quoter.toLowerCase() as Address, abi: QUOTER, functionName: "quoteExactInput", args: [legPath(pair, side), plan.swapAmount] })).result[0];
    const leg = buildLegCall(pair, side, plan, quote * 99n / 100n, account.address, head.timestamp + 900n);
    return { key: `local-v14:${side}`, orderId: "offline-disposable-canary-fixture", account: account.address, side, call: leg, leg, gas: 600_000n, maxFeePerGas: gasPrice, maxGasWei: parseUnits("0.05", 18), routeGuard: { verified: true, registered: true, quoteOnly: false, externalFeeBps: 0, feeMutable: false } } satisfies ManagedEffectRequest;
  };
  const capPair = pairById("BOT/USDT"); if (!capPair) throw new Error("CAP_PAIR");
  const price = (await pc.simulateContract({ address: M.bdexV3Quoter.toLowerCase() as Address, abi: QUOTER, functionName: "quoteExactInput", args: [legPath(capPair, "sell"), 10n ** 18n] })).result[0];
  const observedAt = Date.now();
  // Both observations are the same local fork: fixture-only, not independent verification.
  const tradeBudget = convertCapToBot({ primaryUsdt6PerBot: price, secondaryUsdt6PerBot: price, fetchedAt: observedAt, now: observedAt, verified: true });
  const buy = await withGas(await make("buy", tradeBudget)); // Disposable fixture, not owner order or target.
  try { await executeManagedEffect(buy, io); throw new Error("CRASH_NOT_INJECTED"); } catch (e) { if (!(e instanceof Error) || e.message !== "INJECTED_CRASH_AFTER_LOCAL_BROADCAST") throw e; }
  const bought = await executeManagedEffect(buy, io);
  if (!bought.actualOut || bought.state !== "FINAL" || signatures !== 1 || broadcasts !== 1) throw new Error("CRASH_RECOVERY");
  const sell = await make("sell", bought.actualOut);
  const approval = sell.leg.approval; if (!approval) throw new Error("APPROVAL");
  const effect = (side: "approve" | "revoke", amount: bigint): ManagedEffectRequest => ({ ...sell, key: `local-v14:${side}`, side, call: { to: approval.token, value: 0n, data: encodeFunctionData({ abi: ERC20, functionName: "approve", args: [ROUTER_V4, amount] }) } });
  await executeManagedEffect(await withGas(effect("approve", approval.amount)), io);
  const sold = await executeManagedEffect(await withGas(sell), io);
  await executeManagedEffect(await withGas(effect("revoke", 0n)), io);
  const after = await balances();
  const allowance = await pc.readContract({ address: approval.token, abi: ERC20, functionName: "allowance", args: [account.address, ROUTER_V4] });
  const routerAllowance = await pc.readContract({ address: approval.token, abi: ERC20, functionName: "allowance", args: [ROUTER_V4, M.bdexV3Router.toLowerCase() as Address] });
  if (sold.state !== "FINAL" || sold.actualOut === null || allowance !== 0n || routerAllowance !== 0n || before.native !== after.native || before.ca !== after.ca || before.wbot !== after.wbot || signatures !== 4 || broadcasts !== 4) throw new Error("END_STATE");
  const proposal = boundedGasProposal(gasFootprint, gasPrice, price);
  const evidence = { observedAt, priceUsdt6PerBot: price, tradeBudgetWei: tradeBudget, gasPriceWei: gasPrice, gasFootprint, proposal, totalExposureWei: tradeBudget + proposal.capWei, totalExposureUsdt6: 5_000_000n + proposal.capUsdt6, independentRpcVerified: false, quoteExpiresAt: observedAt + 10_000, kind: "LOCAL_FORK_MOCK_MANAGED_BROKER_ONLY", fork: { number: head.number, hash: head.hash, chainId: 677 }, routerRuntime: keccak256(code), mainnetWrites: 0, externalSignatures: 0, crashAfterBuyBroadcastRecovered: true, signatures, broadcasts, receipts, nonces: [...rows.values()].map(r => r.nonce), allowance, routerAllowance, routerBefore: before, routerAfter: after, ownerOrderCreated: false, actualManagedSignerProvisioned: false };
  mkdirSync("docs/security/autotrade-v1_4", { recursive: true });
  writeFileSync("docs/security/autotrade-v1_4/bounded-gas-fork.json", JSON.stringify(evidence, (_k, v) => typeof v === "bigint" ? v.toString() : v, 2));
  writeFileSync("src/lib/autotrade/canaryGasEvidence.generated.json", JSON.stringify({ basis: "LOCAL_FORK_ONLY", observedAt, block: head.number, blockHash: head.hash, gasFootprint }, (_k, v) => typeof v === "bigint" ? v.toString() : v, 2));
  console.log("V1.4 local managed-transport fixture PASS: four effects, crash recovery, canonical event outputs, zero residuals/allowances");
}
main().catch(e => { console.error(e); process.exitCode = 1; });