/**
 * Live pause / unpause acceptance for MultiSend V1 on BOT Testnet (chain 968).
 *
 * Pauses the contract with the approved owner wallet, proves that a normal
 * batch is rejected while paused, unpauses, and proves execution resumes.
 * Always restores the unpaused state, including on failure.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPublicClient, createWalletClient, defineChain, getAddress, http, keccak256, parseEther, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const REPO = resolve(join(import.meta.dirname ?? ".", "../.."));
const config = JSON.parse(readFileSync(join(REPO, "contracts/config/multisend-bot-testnet.json"), "utf8"));
const artifact = JSON.parse(
  readFileSync(join(REPO, "contracts/production/multisend-v1/artifacts/FlowBridgeMultiSend.json"), "utf8"),
);
const manifestPath = join(REPO, "contracts/deployments/multisend-bot-testnet.json");
if (!existsSync(manifestPath)) throw new Error("DEPLOYMENT_MANIFEST_MISSING");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (!process.argv.includes("--broadcast")) throw new Error("BROADCAST_FLAG_REQUIRED");
if (config.chainId !== 968) throw new Error("TESTNET_ONLY");

const rawKey = process.env["DEPLOYER_PRIVATE_KEY"];
if (!rawKey) throw new Error("APPROVED_SIGNER_UNAVAILABLE");
const account = privateKeyToAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`);

const rpc = process.env["BOT_TESTNET_RPC_URL"] ?? config.rpcUrl;
const chain = defineChain({
  id: 968,
  name: "BOT Chain Testnet",
  nativeCurrency: { name: "BOT", symbol: "tBOT", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
const publicClient = createPublicClient({ chain, transport: http(rpc) });
const walletClient = createWalletClient({ account, chain, transport: http(rpc) });
if ((await publicClient.getChainId()) !== 968) throw new Error("RPC_CHAIN_MISMATCH");

const address = getAddress(manifest.address);
const abi = artifact.abi;
const owner = (await publicClient.readContract({ address, abi, functionName: "owner" })) as string;
if (owner.toLowerCase() !== account.address.toLowerCase()) throw new Error("SIGNER_IS_NOT_OWNER");

const paused = () => publicClient.readContract({ address, abi, functionName: "paused" }) as Promise<boolean>;
const feeBps = Number(await publicClient.readContract({ address, abi, functionName: "feeBps" }));
const configNonce = BigInt((await publicClient.readContract({ address, abi, functionName: "configNonce" })) as bigint);
const recipient = getAddress(`0x${keccak256(toHex("flowbridge-multisend-pausecheck")).slice(26)}`);
const amount = parseEther("0.0001");
const required = (await publicClient.readContract({
  address,
  abi,
  functionName: "quoteRequiredSpend",
  args: [amount],
})) as bigint;

const attempt = () =>
  publicClient.simulateContract({
    address,
    abi,
    functionName: "sendNative",
    account,
    args: [keccak256(toHex("pausecheck")), [recipient], [amount], feeBps, configNonce, BigInt(Math.floor(Date.now() / 1000) + 600)],
    value: required,
  });

async function settle(expected: boolean) {
  for (let i = 0; i < 12; i += 1) {
    if ((await paused()) === expected) return;
    await new Promise((r) => setTimeout(r, 1_500));
  }
  throw new Error(`PAUSE_STATE_NOT_${expected ? "PAUSED" : "LIVE"}`);
}

if (await paused()) throw new Error("ALREADY_PAUSED_UNEXPECTED_STARTING_STATE");
await attempt(); // must be accepted while live

let rejectedWhilePaused = false;
let pauseTx = "";
let unpauseTx = "";
try {
  pauseTx = await walletClient.writeContract({ address, abi, functionName: "pause" });
  await publicClient.waitForTransactionReceipt({ hash: pauseTx as `0x${string}` });
  await settle(true);
  try {
    await attempt();
  } catch {
    rejectedWhilePaused = true;
  }
} finally {
  unpauseTx = await walletClient.writeContract({ address, abi, functionName: "unpause" });
  await publicClient.waitForTransactionReceipt({ hash: unpauseTx as `0x${string}` });
  await settle(false);
}

if (!rejectedWhilePaused) throw new Error("PAUSED_CONTRACT_ACCEPTED_A_BATCH");
await attempt(); // must be accepted again after unpause

const report = {
  gate: "MULTISEND_V1_BOT_TESTNET_LIVE_PAUSE_ACCEPTANCE",
  verdict: "PASS",
  chainId: 968,
  contract: address,
  owner,
  pauseTxHash: pauseTx,
  unpauseTxHash: unpauseTx,
  acceptedWhileLive: true,
  rejectedWhilePaused: true,
  acceptedAfterUnpause: true,
  finalPaused: await paused(),
  executedAt: new Date().toISOString(),
};
writeFileSync(
  join(REPO, "contracts/production/multisend-v1/release/bot-testnet-pause-acceptance.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
