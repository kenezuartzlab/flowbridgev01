/**
 * BOT Mainnet (677) controlled native rehearsal for MultiSend V1.
 *
 * Minimal-value production rehearsal covering the three product shapes
 * (Distribute, Consolidate, Advanced) in one clientBatchId session, exactly as
 * the app groups them. Verifies exact recipient credit, the 0.01% fee paid to
 * the approved fee recipient, zero contract residual and event emission.
 * Requires the approved signer and --broadcast. Fails closed off chain 677.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  keccak256,
  parseEther,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const REPO = resolve(join(import.meta.dirname ?? ".", "../.."));
const config = JSON.parse(
  readFileSync(join(REPO, "contracts/config/multisend-bot-mainnet.json"), "utf8"),
);
const artifact = JSON.parse(
  readFileSync(
    join(
      REPO,
      "contracts/production/multisend-v1/candidate-rc2/artifacts/FlowBridgeMultiSend.json",
    ),
    "utf8",
  ),
);
const manifestPath = join(REPO, "contracts/deployments/multisend-bot-mainnet.json");
if (!existsSync(manifestPath)) throw new Error("DEPLOYMENT_MANIFEST_MISSING");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (!process.argv.includes("--broadcast")) throw new Error("BROADCAST_FLAG_REQUIRED");
if (config.chainId !== 677 || manifest.chainId !== 677) throw new Error("MAINNET_677_ONLY");

const rawKey = process.env["DEPLOYER_PRIVATE_KEY"];
if (!rawKey) throw new Error("APPROVED_SIGNER_UNAVAILABLE");
const account = privateKeyToAccount(
  (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`,
);
if (account.address.toLowerCase() !== String(config.approvedDeployer).toLowerCase())
  throw new Error("SIGNER_IS_NOT_APPROVED_WALLET");

const rpc = process.env["BOT_MAINNET_RPC_URL"] ?? config.rpcUrl;
const chain = defineChain({
  id: 677,
  name: "BOT Chain",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
const publicClient = createPublicClient({ chain, transport: http(rpc) });
const walletClient = createWalletClient({ account, chain, transport: http(rpc) });
if ((await publicClient.getChainId()) !== 677) throw new Error("RPC_CHAIN_MISMATCH");

const address = getAddress(manifest.address);
const read = (functionName: string, args?: readonly unknown[]) =>
  publicClient.readContract({ address, abi: artifact.abi, functionName, args } as never);
const feeBps = Number(await read("feeBps"));
const configNonce = BigInt((await read("configNonce")) as bigint);
const feeRecipient = getAddress((await read("feeRecipient")) as string);
if (Boolean(await read("paused"))) throw new Error("CONTRACT_PAUSED");
if (feeBps !== 1) throw new Error("UNEXPECTED_FEE_BPS");
if (feeRecipient.toLowerCase() !== String(config.feeRecipient).toLowerCase())
  throw new Error("UNEXPECTED_FEE_RECIPIENT");

/** Deterministic burner recipients derived from the session label. */
const recipient = (label: string) =>
  getAddress(`0x${keccak256(toHex(`flowbridge-multisend-mainnet-rehearsal:${label}`)).slice(26)}`);
const clientBatchId = keccak256(toHex(`multisend-mainnet-rehearsal-${Date.now()}`));
const deadline = BigInt(Math.floor(Date.now() / 1000) + 1800);

const groups = [
  {
    mode: "distribute",
    recipients: [recipient("d1"), recipient("d2"), recipient("d3")],
    amounts: [parseEther("0.0001"), parseEther("0.0002"), parseEther("0.00005")],
  },
  { mode: "consolidate", recipients: [recipient("destination")], amounts: [parseEther("0.0003")] },
  {
    mode: "advanced",
    recipients: [recipient("a1"), recipient("a2")],
    amounts: [parseEther("0.00015"), parseEther("0.00025")],
  },
];

const results: unknown[] = [];
for (const group of groups) {
  const recipientsTotal = group.amounts.reduce((sum, amount) => sum + amount, 0n);
  const fee = (await read("quoteFee", [recipientsTotal])) as bigint;
  const required = (await read("quoteRequiredSpend", [recipientsTotal])) as bigint;
  if (required !== recipientsTotal + fee) throw new Error(`QUOTE_MISMATCH:${group.mode}`);

  const args = [clientBatchId, group.recipients, group.amounts, feeBps, configNonce, deadline] as const;
  const before = await Promise.all(group.recipients.map((to) => publicClient.getBalance({ address: to })));
  const feeBefore = await publicClient.getBalance({ address: feeRecipient });
  const gas = await publicClient.estimateContractGas({
    address,
    abi: artifact.abi,
    functionName: "sendNative",
    args,
    value: required,
    account,
  });
  const hash = await walletClient.writeContract({
    address,
    abi: artifact.abi,
    functionName: "sendNative",
    args,
    value: required,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`REHEARSAL_REVERTED:${group.mode}`);

  const after = await Promise.all(group.recipients.map((to) => publicClient.getBalance({ address: to })));
  const exact = after.every((balance, index) => balance - before[index]! === group.amounts[index]!);
  if (!exact) throw new Error(`INEXACT_RECIPIENT_CREDIT:${group.mode}`);
  const feeAfter = await publicClient.getBalance({ address: feeRecipient });
  if (feeAfter - feeBefore !== fee) throw new Error(`FEE_NOT_CREDITED:${group.mode}`);
  if ((await publicClient.getBalance({ address })) !== 0n)
    throw new Error(`CONTRACT_RETAINED_CUSTODY:${group.mode}`);
  const events = receipt.logs.filter((l) => l.address.toLowerCase() === address.toLowerCase());
  if (events.length === 0) throw new Error(`NO_BATCH_EVENT:${group.mode}`);

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
    feeCreditedToApprovedRecipient: true,
    contractEventLogs: events.length,
    contractCustodyAfter: "0",
  });
  console.log(`${group.mode}: ${hash}`);
}

const report = {
  gate: "MULTISEND_V1_BOT_MAINNET_NATIVE_REHEARSAL",
  verdict: "PASS",
  chainId: 677,
  contract: address,
  source: account.address,
  feeRecipient,
  clientBatchId,
  feeBps,
  configNonce: configNonce.toString(),
  groups: results,
  executedAt: new Date().toISOString(),
};
const outputPath = join(
  REPO,
  "contracts/production/multisend-v1/release/bot-mainnet-rehearsal-native.json",
);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
