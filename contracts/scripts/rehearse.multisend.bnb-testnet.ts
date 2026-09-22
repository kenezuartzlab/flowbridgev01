/**
 * BNB Testnet native rehearsal for MultiSend V1.
 *
 * Executes one small native transfer batch per product mode shape:
 *  - Distribute  : one source -> many recipients, custom amounts
 *  - Consolidate : one source -> single destination (one source group of a many->one session)
 *  - Advanced    : one source -> many recipients as one group of a many->many session
 * All three groups in a session share one clientBatchId, exactly like the app.
 * Testnet only (chain 97). Requires the approved signer and --broadcast.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createPublicClient, createWalletClient, defineChain, getAddress, http, keccak256, parseEther, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const REPO = resolve(join(import.meta.dirname ?? ".", "../.."));
const config = JSON.parse(readFileSync(join(REPO, "contracts/config/multisend-bnb-testnet.json"), "utf8"));
const artifact = JSON.parse(readFileSync(join(REPO, (process.env["MULTISEND_ARTIFACT"] ?? "contracts/production/multisend-v1/candidate-rc2/artifacts/FlowBridgeMultiSend.json")), "utf8"));
const manifestPath = join(REPO, (process.env["MULTISEND_MANIFEST"] ?? "contracts/deployments/multisend-bnb-testnet.json"));
if (!existsSync(manifestPath)) throw new Error("DEPLOYMENT_MANIFEST_MISSING");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (!process.argv.includes("--broadcast")) throw new Error("BROADCAST_FLAG_REQUIRED");
if (config.chainId !== 97) throw new Error("TESTNET_ONLY");

const rawKey = process.env["DEPLOYER_PRIVATE_KEY"];
if (!rawKey) throw new Error("APPROVED_SIGNER_UNAVAILABLE");
const account = privateKeyToAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`);
if (account.address.toLowerCase() !== String(config.initialOwner).toLowerCase()) throw new Error("SIGNER_IS_NOT_APPROVED_OWNER");

const rpc = process.env["BNB_TESTNET_RPC_URL"] ?? config.rpcUrl;
const chain = defineChain({ id: 97, name: "BNB Smart Chain Testnet", nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const publicClient = createPublicClient({ chain, transport: http(rpc) });
const walletClient = createWalletClient({ account, chain, transport: http(rpc) });
if ((await publicClient.getChainId()) !== 97) throw new Error("RPC_CHAIN_MISMATCH");

const address = getAddress(manifest.address);
const feeBps = Number(await publicClient.readContract({ address, abi: artifact.abi, functionName: "feeBps" }));
const configNonce = BigInt(await publicClient.readContract({ address, abi: artifact.abi, functionName: "configNonce" }) as bigint);
const paused = Boolean(await publicClient.readContract({ address, abi: artifact.abi, functionName: "paused" }));
if (paused) throw new Error("CONTRACT_PAUSED");

/** Deterministic burner recipients derived from the session label — no user funds involved. */
const recipient = (label: string) => getAddress(`0x${keccak256(toHex(`flowbridge-multisend-rehearsal:${label}`)).slice(26)}`);
const clientBatchId = keccak256(toHex(`multisend-rehearsal-${Date.now()}`));
const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);

const groups = [
  { mode: "distribute", recipients: [recipient("d1"), recipient("d2"), recipient("d3")], amounts: [parseEther("0.001"), parseEther("0.002"), parseEther("0.0005")] },
  { mode: "consolidate", recipients: [recipient("destination")], amounts: [parseEther("0.003")] },
  { mode: "advanced", recipients: [recipient("a1"), recipient("a2")], amounts: [parseEther("0.0015"), parseEther("0.0025")] },
];

const results: unknown[] = [];
for (const group of groups) {
  const recipientsTotal = group.amounts.reduce((sum, amount) => sum + amount, 0n);
  const fee = (await publicClient.readContract({ address, abi: artifact.abi, functionName: "quoteFee", args: [recipientsTotal] })) as bigint;
  const required = (await publicClient.readContract({ address, abi: artifact.abi, functionName: "quoteRequiredSpend", args: [recipientsTotal] })) as bigint;
  if (required !== recipientsTotal + fee) throw new Error(`QUOTE_MISMATCH:${group.mode}`);

  const args = [clientBatchId, group.recipients, group.amounts, feeBps, configNonce, deadline] as const;
  const before = await Promise.all(group.recipients.map((to) => publicClient.getBalance({ address: to })));
  const gas = await publicClient.estimateContractGas({ address, abi: artifact.abi, functionName: "sendNative", args, value: required, account });
  const hash = await walletClient.writeContract({ address, abi: artifact.abi, functionName: "sendNative", args, value: required });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`REHEARSAL_REVERTED:${group.mode}`);

  const after = await Promise.all(group.recipients.map((to) => publicClient.getBalance({ address: to })));
  const exact = after.every((balance, index) => balance - before[index]! === group.amounts[index]!);
  if (!exact) throw new Error(`INEXACT_RECIPIENT_CREDIT:${group.mode}`);
  if ((await publicClient.getBalance({ address })) !== 0n) throw new Error(`CONTRACT_RETAINED_CUSTODY:${group.mode}`);

  results.push({
    mode: group.mode,
    txHash: hash,
    blockNumber: receipt.blockNumber.toString(),
    recipients: group.recipients.length,
    recipientsTotalWei: recipientsTotal.toString(),
    serviceFeeWei: fee.toString(),
    totalSpendWei: required.toString(),
    gasEstimated: gas.toString(),
    gasUsed: receipt.gasUsed.toString(),
    exactRecipientCredit: true,
    contractCustodyAfter: "0",
  });
  console.log(`${group.mode}: ${hash}`);
}

const report = {
  gate: "MULTISEND_V1_BNB_TESTNET_NATIVE_REHEARSAL",
  verdict: "PASS",
  chainId: 97,
  contract: address,
  source: account.address,
  clientBatchId,
  feeBps,
  configNonce: configNonce.toString(),
  groups: results,
  executedAt: new Date().toISOString(),
};
const outputPath = join(REPO, "contracts/production/multisend-v1/release/bnb-testnet-rehearsal-native.json");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
