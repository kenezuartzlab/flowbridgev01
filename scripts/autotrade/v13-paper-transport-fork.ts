// AutoTrade V1.3 LOCAL FORK ONLY. All writes target literal 127.0.0.1:8547.
// Uses Anvil's public disposable test key #0; no external wallet or mainnet write.
import { mkdirSync, writeFileSync } from "node:fs";
import {
  createPublicClient, createWalletClient, http, keccak256, parseAbi, parseUnits,
  type Address, type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MAINNET_CONTRACTS as M } from "@/lib/contracts";
import { CA_WBOT_BDEX_V3_POOL, type ComparedRoute } from "@/lib/swap/routeComparison";
import { newOrder, parsePrice, splitRouterFee, type Order, type Quote, type Rational } from "@/lib/autotrade/engine";
import { ROUTER_V4, ROUTER_V4_FEE_BPS_BDEX_V3, pairById } from "@/lib/autotrade/config";
import { legPath, legTokens } from "@/lib/autotrade/path";
import {
  LEG_SELECTORS, buildLegCall, nativeReceived, planAmounts, receivedFromLogs, verifyDeployment,
} from "@/lib/autotrade/executor";
import {
  processTransportedPaperOrder, type PaperEffect, type PaperExecutionStore, type PaperLease,
  type PaperReceipt, type PaperTransport, type PreparedPaperEffect,
} from "@/lib/autotrade/paperExecutor";

const URL = "http://127.0.0.1:8547" as const;
if (URL !== "http://127.0.0.1:8547") throw new Error("LOOPBACK_ONLY");
const chain = { id: 677, name: "bot-local-fork", nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 }, rpcUrls: { default: { http: [URL] } } } as const;
const pc = createPublicClient({ chain, transport: http(URL, { timeout: 30_000, retryCount: 0 }) });
const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const wallet = createWalletClient({ chain, account, transport: http(URL, { timeout: 30_000, retryCount: 0 }) });
const moverAccount = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const moverWallet = createWalletClient({ chain, account: moverAccount, transport: http(URL, { timeout: 30_000, retryCount: 0 }) });
const ERC20 = parseAbi(["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)"]);
const V4 = parseAbi(["function owner() view returns (address)", "function paused() view returns (bool)", "function routerCount() view returns (uint256)", "function routers(uint256) view returns (address,uint8,address,bool,string,string)", "function routerFeeBps(uint256) view returns (uint256)"]);
const QUOTER = parseAbi(["function quoteExactInput(bytes path,uint256 amountIn) returns (uint256,uint160[],uint32[],uint256)"]);
const rpc = (method: string, params: unknown[] = []) => pc.request({ method: method as never, params: params as never });
const balance = (token: string, owner: Address) => pc.readContract({ address: token.toLowerCase() as Address, abi: ERC20, functionName: "balanceOf", args: [owner] });

class ForkMemoryStore implements PaperExecutionStore {
  readonly rows = new Map<string, PaperEffect>();
  nonce: number;
  constructor(nextNonce: number) { this.nonce = nextNonce; }
  async reserve(args: Parameters<PaperExecutionStore["reserve"]>[0]): Promise<PaperEffect> {
    const existing = this.rows.get(args.key);
    if (existing) return existing;
    if ([...this.rows.values()].some((e) => ["RESERVED", "SIGNED", "BROADCAST", "MINED"].includes(e.state))) throw new Error("OPEN_EFFECT");
    const row: PaperEffect = {
      key: args.key, parentKey: args.parentKey, side: args.side, nonce: this.nonce++, state: "RESERVED",
      txHash: null, signedRaw: null, minedBlock: null, minedHash: null, storedCall: args.storedCall, fencing: args.lease.fencing,
    };
    this.rows.set(args.key, row);
    return row;
  }
  async advance(args: Parameters<PaperExecutionStore["advance"]>[0]): Promise<void> {
    const current = this.rows.get(args.effect.key);
    if (!current || current.fencing > args.lease.fencing) throw new Error("FENCE_LOST");
    this.rows.set(current.key, { ...current, ...args.patch });
  }
  async effects(): Promise<PaperEffect[]> { return [...this.rows.values()]; }
}

/** Real local EVM transport. Signed bytes come only from Anvil's public test account. */
class AnvilTransport implements PaperTransport {
  readonly kind = "fork" as const;
  readonly account = account.address;
  private readonly before = new Map<string, { native: boolean; token: string; balance: bigint }>();
  async prepare(args: {
    key: string; call: { to: Hex; data: Hex; value: bigint }; nonce: number; quotedOut: bigint; maxGasWei: bigint;
  }): Promise<PreparedPaperEffect> {
    const gasPrice = await pc.getGasPrice();
    const estimated = await pc.estimateGas({ account: this.account, to: args.call.to, data: args.call.data, value: args.call.value });
    const gas = estimated * 120n / 100n;
    if (gas * gasPrice > args.maxGasWei) throw new Error("GAS_CAP");
    const raw = await wallet.signTransaction({ to: args.call.to, data: args.call.data, value: args.call.value, nonce: args.nonce, gas, gasPrice });
    const txHash = keccak256(raw);
    const side = args.key.includes(":approve:") || args.key.includes(":revoke:") ? null : args.key.includes(":buy:") ? "buy" : "sell";
    if (side) {
      const pair = pairById("CA/BOT")!;
      const output = side === "buy" ? pair.base : pair.quote;
      this.before.set(txHash, {
        native: !!output.native, token: output.address,
        balance: output.native ? await pc.getBalance({ address: this.account }) : await balance(output.address, this.account),
      });
    }
    return { raw, txHash, gas, maxFeePerGas: gasPrice };
  }
  async broadcast(args: { raw: Hex | null; txHash: string }): Promise<void> {
    if (!args.raw) throw new Error("SIGNED_PAYLOAD_REQUIRED");
    const hash = await pc.sendRawTransaction({ serializedTransaction: args.raw });
    if (hash !== args.txHash) throw new Error("TX_HASH_MISMATCH");
  }
  async receipt(txHash: string): Promise<PaperReceipt | null> {
    const receipt = await pc.waitForTransactionReceipt({ hash: txHash as Hex, timeout: 5_000, pollingInterval: 50 }).catch(() => null);
    if (!receipt) return null;
    let confirmations = Number(BigInt(await rpc("eth_blockNumber") as string) - receipt.blockNumber + 1n);
    if (receipt.status === "success" && confirmations < 6) {
      await rpc("anvil_mine", ["0x6", "0x0"]);
      confirmations = Number(BigInt(await rpc("eth_blockNumber") as string) - receipt.blockNumber + 1n);
    }
    let actualOut = 0n;
    const before = this.before.get(txHash);
    if (receipt.status === "success" && before) {
      actualOut = before.native
        ? nativeReceived(before.balance, await pc.getBalance({ address: this.account }), receipt.gasUsed, receipt.effectiveGasPrice)
        : receivedFromLogs(receipt.logs.map((l) => ({ address: l.address, topics: [...l.topics], data: l.data })), before.token, this.account);
    }
    return { status: receipt.status, confirmations, actualOut, block: Number(receipt.blockNumber), blockHash: receipt.blockHash };
  }
  async canonicalBlockHash(block: number): Promise<string | null> {
    return (await pc.getBlock({ blockNumber: BigInt(block) }).catch(() => null))?.hash ?? null;
  }
}

async function quote(order: Order, side: "buy" | "sell", gasPriceWei: bigint): Promise<Quote> {
  const total = side === "buy" ? order.spec.budgetQuote : order.acquiredBase;
  const amountIn = splitRouterFee(total, ROUTER_V4_FEE_BPS_BDEX_V3).swapAmount;
  const result = (await pc.simulateContract({ address: M.bdexV3Quoter.toLowerCase() as Address, abi: QUOTER, functionName: "quoteExactInput", args: [legPath(order.spec.pair, side), amountIn] })).result;
  const amountOut = result[0];
  const route: ComparedRoute = {
    key: `local-bdex:${side}`, venue: "BDEX V3", executionClass: "REGISTERED_EXECUTABLE", routerId: 0,
    router: M.bdexV3Router.toLowerCase(), factory: M.bdexV3Factory.toLowerCase(), pool: CA_WBOT_BDEX_V3_POOL.toLowerCase(),
    wrappedNative: M.wbot.toLowerCase(), caller: ROUTER_V4.toLowerCase(), path: legTokens(order.spec.pair, side).map((a) => a.toLowerCase()),
    amountIn, amountOut, gasUnits: result[3] + 180_000n, gasPriceWei,
    gasCostInOutput: order.spec.pair.quote.native && side === "sell" ? (result[3] + 180_000n) * gasPriceWei : null,
    priceImpactBps: 0, externalDirectionalFeeBps: 0, feeMutable: false, registered: true,
    identityVerified: true, wrapperVerified: true, feeVerified: true, liquidityVerified: true, approvalVerified: true,
    block: Number(await pc.getBlockNumber()), rejections: [],
  };
  return { amountIn, amountOut, block: route.block, headBlock: route.block, fetchedAt: Date.now(), crossCheckOut: amountOut,
    priceImpactBps: 0, gasUnits: route.gasUnits, gasPriceWei, route, quoteOnlyAlternatives: [] };
}

async function main() {
  if (await pc.getChainId() !== 677) throw new Error("CHAIN_ID");
  const head = await pc.getBlock();
  const code = (await pc.getCode({ address: ROUTER_V4 }))!;
  const entry = await pc.readContract({ address: ROUTER_V4, abi: V4, functionName: "routers", args: [0n] });
  const deployment = {
    chainId: 677, codeKeccak: keccak256(code), paused: await pc.readContract({ address: ROUTER_V4, abi: V4, functionName: "paused" }),
    owner: await pc.readContract({ address: ROUTER_V4, abi: V4, functionName: "owner" }),
    routerCount: Number(await pc.readContract({ address: ROUTER_V4, abi: V4, functionName: "routerCount" })),
    entry: { router: entry[0], rtype: entry[1], wrappedNative: entry[2], active: entry[3] },
    routerFeeBps: Number(await pc.readContract({ address: ROUTER_V4, abi: V4, functionName: "routerFeeBps", args: [0n] })),
    selectorsInCode: Object.fromEntries(Object.values(LEG_SELECTORS).map((s) => [s, code.includes(s.slice(2))])),
  };
  const deploymentErrors = verifyDeployment(deployment, { routerId: 0, v3Router: M.bdexV3Router, wbot: M.wbot, feeBps: 1 });
  if (deploymentErrors.length) throw new Error(`DEPLOYMENT:${deploymentErrors.join(",")}`);
  await rpc("anvil_setBalance", [account.address, "0x" + parseUnits("1000", 18).toString(16)]);
  await rpc("anvil_setBalance", [moverAccount.address, "0x" + parseUnits("1000", 18).toString(16)]);
  const pair = pairById("CA/BOT")!;
  const budget = parseUnits("1", 18);
  const provisional = newOrder(crypto.randomUUID(), {
    pair, mode: "paper", budgetQuote: budget, maxBuyPrice: parsePrice("0.000000000000000001"), minSellPrice: parsePrice("0.000000000000000001"),
    stopPrice: null, slippageBps: 100, maxGasWeiPerLeg: parseUnits("0.05", 18), maxLossQuote: 0n,
    expiresAt: Date.now() + 300_000, repeat: false,
  }, Date.now());
  const buyQuote = await quote(provisional, "buy", await pc.getGasPrice());
  // A deliberately conservative bound 10% below the contemporaneous executable quote.
  const bound: Rational = { num: budget * 1001n, den: buyQuote.amountOut * 1000n };
  const order = newOrder(provisional.id, { ...provisional.spec, maxBuyPrice: bound, minSellPrice: bound }, Date.now());
  const store = new ForkMemoryStore(await pc.getTransactionCount({ address: account.address, blockTag: "pending" }));
  const transport = new AnvilTransport();
  const lease: PaperLease = { holder: crypto.randomUUID(), fencing: 1, leaseUntilMs: Date.now() + 300_000 };
  const routerBefore = {
    native: await pc.getBalance({ address: ROUTER_V4 }),
    CA: await balance(M.caToken, ROUTER_V4), WBOT: await balance(M.wbot, ROUTER_V4),
  };
  const bought = await processTransportedPaperOrder({ order, quote: buyQuote, now: Date.now(), store, transport, lease });
  if (bought.order.state !== "HOLDING") throw new Error(`BUY_${bought.order.state}`);
  // Move the LOCAL market with a separate disposable-account trade. The worker's
  // sell remains bound by the original order; no price or order record is rewritten.
  const moverPlan = planAmounts(parseUnits("100", 18), ROUTER_V4_FEE_BPS_BDEX_V3);
  const moverCall = buildLegCall(pair, "buy", moverPlan, 1n, moverAccount.address, head.timestamp + 900n);
  const marketMoveHash = await moverWallet.sendTransaction({ to: moverCall.to, data: moverCall.data, value: moverCall.value, gas: 600_000n });
  const marketMoveReceipt = await pc.waitForTransactionReceipt({ hash: marketMoveHash });
  if (marketMoveReceipt.status !== "success") throw new Error("LOCAL_MARKET_MOVE_REVERTED");
  const sellQuote = await quote(bought.order, "sell", await pc.getGasPrice());
  const sold = await processTransportedPaperOrder({ order: bought.order, quote: sellQuote, now: Date.now(), store, transport, lease });
  if (sold.order.state !== "COMPLETED") throw new Error(`SELL_${sold.order.state}`);
  const routerAfter = {
    native: await pc.getBalance({ address: ROUTER_V4 }),
    CA: await balance(M.caToken, ROUTER_V4), WBOT: await balance(M.wbot, ROUTER_V4),
  };
  const traderAllowance = await pc.readContract({ address: M.caToken.toLowerCase() as Address, abi: ERC20, functionName: "allowance", args: [account.address, ROUTER_V4] });
  const routerAllowance = await pc.readContract({ address: M.caToken.toLowerCase() as Address, abi: ERC20, functionName: "allowance", args: [ROUTER_V4, M.bdexV3Router.toLowerCase() as Address] });
  if (routerBefore.native !== routerAfter.native || routerBefore.CA !== routerAfter.CA || routerBefore.WBOT !== routerAfter.WBOT || traderAllowance !== 0n || routerAllowance !== 0n) throw new Error("RESIDUAL_OR_ALLOWANCE");
  const evidence = {
    kind: "LOCAL_ANVIL_FORK_ONLY", mainnetWrites: 0, externalWalletSignatures: 0,
    fork: { chainId: 677, number: head.number, hash: head.hash, time: new Date(Number(head.timestamp) * 1000).toISOString() },
    deployment, account: account.address, pair: pair.id, mode: "paper",
    buy: { quotedOut: buyQuote.amountOut, actualOut: bought.order.legs[0]?.actualOut, maxBuyPrice: bound, txHash: bought.order.legs[0]?.txHash },
    localMarketMove: { account: moverAccount.address, txHash: marketMoveHash, budget: parseUnits("100", 18), purpose: "Raise the local CA/BOT price after entry so the unchanged sell minimum is genuinely met" },
    sell: { quotedOut: sellQuote.amountOut, actualOut: sold.order.legs[1]?.actualOut, minSellPrice: bound, txHash: sold.order.legs[1]?.txHash },
    finalState: sold.order.state, effects: [...store.rows.values()].map((e) => ({ key: e.key, side: e.side, nonce: e.nonce, state: e.state, txHash: e.txHash, minedBlock: e.minedBlock, minedHash: e.minedHash })),
    routerResidualBefore: routerBefore, routerResidualAfter: routerAfter, traderAllowance, routerAllowance,
    route: { selected: "BDEX V3 routerId 0", caPool: CA_WBOT_BDEX_V3_POOL, feeTier: 10000, quoteOnlyAlternativesExecuted: 0 },
  };
  mkdirSync("docs/security/autotrade-v1_3", { recursive: true });
  writeFileSync("docs/security/autotrade-v1_3/fork-transport.json", JSON.stringify(evidence, (_k, v) => typeof v === "bigint" ? v.toString() : v, 2));
  console.log(JSON.stringify(evidence, (_k, v) => typeof v === "bigint" ? v.toString() : v, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
