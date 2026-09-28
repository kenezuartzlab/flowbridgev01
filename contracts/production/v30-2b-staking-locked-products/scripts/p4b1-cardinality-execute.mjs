/**
 * V30.2B P4B.1 — APPROVED execution: increaseObservationCardinalityNext(128)
 * on the canonical FLOW/USDT 1% pool, BOT Mainnet 677.
 * Exactly ONE transaction is sent. Preflight + simulation must PASS first.
 *   bun contracts/production/v30-2b-staking-locked-products/scripts/p4b1-cardinality-execute.mjs
 */
import { createPublicClient, createWalletClient, http, parseAbi, getAddress, encodeFunctionData, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { writeFileSync } from "node:fs";

const RPC = process.env.BOT_RPC || "https://rpc.botchain.ai";
const POOL = getAddress("0xDaCFc2574b6110892351Bd31afb36F95E7206162");
const TARGET = 128;
const VAULT = getAddress("0x15e7B1b4b16a43E6CE2E1f460dBE4201E9B6790D");
const CONTROLLER = getAddress("0x44b9b880C6188D8b8dbe4f68216aE28a5A1253bF");
const PUBLISHER = getAddress("0x05F7E3eA71093D8224ABB9DE078D1a2e480faB22");
const EPOCH_ROLE = keccak256(toBytes("EPOCH_ROLE"));
const PUBLISHER_ROLE = keccak256(toBytes("PUBLISHER_ROLE"));
const STAKING_ABI = parseAbi([
  "function oracle() view returns (address)",
  "function hasRole(bytes32,address) view returns (bool)",
]);
const CHAIN = { id: 677, name: "BOT", nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };

const POOL_ABI = parseAbi([
  "function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)",
  "function liquidity() view returns (uint128)",
  "function increaseObservationCardinalityNext(uint16)",
]);

const key = process.env.DEPLOYER_PRIVATE_KEY;
if (!key) throw new Error("STOP: DEPLOYER_PRIVATE_KEY not set");
const account = privateKeyToAccount(key.startsWith("0x") ? key : "0x" + key);

const pub = createPublicClient({ chain: CHAIN, transport: http(RPC, { timeout: 30000 }) });
const wallet = createWalletClient({ account, chain: CHAIN, transport: http(RPC, { timeout: 30000 }) });

const ev = { gate: "V30.2B-P4B.1-CARDINALITY-EXECUTE", chainId: await pub.getChainId(), pool: POOL, target: TARGET, signer: account.address };
if (ev.chainId !== 677) throw new Error("STOP: chain " + ev.chainId);

// --- BEFORE: re-read state ---
const before0 = await pub.readContract({ address: POOL, abi: POOL_ABI, functionName: "slot0" });
const beforeLiq = await pub.readContract({ address: POOL, abi: POOL_ABI, functionName: "liquidity" });
ev.before = {
  observationIndex: before0[2], observationCardinality: before0[3], observationCardinalityNext: before0[4],
  unlocked: before0[6], tick: before0[1], sqrtPriceX96: before0[0].toString(), liquidity: beforeLiq.toString(),
};
if (ev.before.observationCardinalityNext !== 1) throw new Error("STOP: cardinalityNext != 1");
if (!ev.before.unlocked) throw new Error("STOP: pool locked");

// --- SIMULATE exact transaction ---
const data = encodeFunctionData({ abi: POOL_ABI, functionName: "increaseObservationCardinalityNext", args: [TARGET] });
await pub.call({ account: account.address, to: POOL, data });
const gas = await pub.estimateGas({ account: account.address, to: POOL, data });
ev.simulation = { pass: true, gasEstimate: gas.toString() };
console.log("SIMULATION PASS, gas", gas.toString());

// --- ONE wallet transaction ---
const hash = await wallet.sendTransaction({ to: POOL, data, gas: (gas * 120n) / 100n });
ev.txHash = hash;
console.log("TX SENT", hash);
const receipt = await pub.waitForTransactionReceipt({ hash });
ev.receipt = { status: receipt.status, blockNumber: receipt.blockNumber.toString(), gasUsed: receipt.gasUsed.toString() };
if (receipt.status !== "success") throw new Error("STOP: tx status " + receipt.status);

// --- AFTER: verify ---
const after0 = await pub.readContract({ address: POOL, abi: POOL_ABI, functionName: "slot0" });
const afterLiq = await pub.readContract({ address: POOL, abi: POOL_ABI, functionName: "liquidity" });
ev.after = {
  observationIndex: after0[2], observationCardinality: after0[3], observationCardinalityNext: after0[4],
  unlocked: after0[6], tick: after0[1], sqrtPriceX96: after0[0].toString(), liquidity: afterLiq.toString(),
};
ev.checks = {
  txSuccess: receipt.status === "success",
  cardinalityNextIs128: ev.after.observationCardinalityNext === 128,
  liquidityUnchanged: ev.before.liquidity === ev.after.liquidity,
  tickUnchanged: ev.before.tick === ev.after.tick,
  sqrtPriceUnchanged: ev.before.sqrtPriceX96 === ev.after.sqrtPriceX96,
  stillUnlocked: ev.after.unlocked === true,
};

// --- staking surface unchanged: oracle still 0x0, roles still unassigned ---
const oracle = await pub.readContract({ address: VAULT, abi: STAKING_ABI, functionName: "oracle" });
const epochGranted = await pub.readContract({ address: VAULT, abi: STAKING_ABI, functionName: "hasRole", args: [EPOCH_ROLE, CONTROLLER] });
const publisherGranted = await pub.readContract({ address: CONTROLLER, abi: STAKING_ABI, functionName: "hasRole", args: [PUBLISHER_ROLE, PUBLISHER] });
ev.staking = { oracle, epochRoleToController: epochGranted, publisherRoleToPublisher: publisherGranted };
ev.checks.oracleStillZero = oracle === "0x0000000000000000000000000000000000000000";
ev.checks.rolesUnchanged = epochGranted === false && publisherGranted === false;
if (!ev.checks.cardinalityNextIs128) throw new Error("STOP: cardinalityNext != 128 after tx");

writeFileSync("contracts/production/v30-2b-staking-locked-products/P4B1_CARDINALITY_EXECUTION.json", JSON.stringify(ev, null, 2));
console.log(JSON.stringify(ev, null, 2));
