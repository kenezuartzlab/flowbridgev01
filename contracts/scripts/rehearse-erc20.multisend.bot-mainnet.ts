/**
 * BOT Mainnet (677) controlled ERC-20 rehearsal for MultiSend V1.
 *
 * Uses the approved production token FLOW with deliberately minimal amounts.
 * Positives: Distribute, Consolidate, Advanced and a duplicate-recipient batch,
 * proving exact recipient credit, the 1 bps fee charged in the transferred
 * token to the approved fee recipient, exact allowance consumption (never
 * unlimited, fully consumed afterwards) and zero contract custody.
 * Negatives are asserted by simulation only (eth_call) — nothing unsafe is
 * broadcast. Requires the approved signer and --broadcast. Fails closed off 677.
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
  parseUnits,
  toHex,
  zeroAddress,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const REPO = resolve(join(import.meta.dirname ?? ".", "../.."));
const config = JSON.parse(
  readFileSync(join(REPO, "contracts/config/multisend-bot-mainnet.json"), "utf8"),
);
const artifact = JSON.parse(
  readFileSync(
    join(REPO, "contracts/production/multisend-v1/candidate-rc2/artifacts/FlowBridgeMultiSend.json"),
    "utf8",
  ),
);
const manifestPath = join(REPO, "contracts/deployments/multisend-bot-mainnet.json");
if (!existsSync(manifestPath)) throw new Error("DEPLOYMENT_MANIFEST_MISSING");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (!process.argv.includes("--broadcast")) throw new Error("BROADCAST_FLAG_REQUIRED");
if (config.chainId !== 677 || manifest.chainId !== 677) throw new Error("MAINNET_677_ONLY");

/** Approved production ERC-20 for this rehearsal: FlowBridge FLOW. */
const TOKEN = getAddress("0xcaaB50F36252a57529AFeF651fa6B9f9281917fF") as Address;

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

const contract = getAddress(manifest.address) as Address;
const abi = artifact.abi;
const read = <T>(functionName: string, args: unknown[] = []) =>
  publicClient.readContract({ address: contract, abi, functionName, args }) as Promise<T>;

const feeBps = Number(await read<number>("feeBps"));
const configNonce = BigInt(await read<bigint>("configNonce"));
const feeRecipient = getAddress(await read<string>("feeRecipient")) as Address;
if (await read<boolean>("paused")) throw new Error("CONTRACT_PAUSED");
if (feeBps !== 1) throw new Error("UNEXPECTED_FEE_BPS");
if (feeRecipient.toLowerCase() !== String(config.feeRecipient).toLowerCase())
  throw new Error("UNEXPECTED_FEE_RECIPIENT");

const erc20Abi = [
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
] as const;

const decimals = Number(
  await publicClient.readContract({ address: TOKEN, abi: erc20Abi, functionName: "decimals" }),
);
const symbol = (await publicClient.readContract({
  address: TOKEN,
  abi: erc20Abi,
  functionName: "symbol",
})) as string;
const tokenBalance = (who: Address) =>
  publicClient.readContract({
    address: TOKEN,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [who],
  }) as Promise<bigint>;
const tokenAllowance = () =>
  publicClient.readContract({
    address: TOKEN,
    abi: erc20Abi,
    functionName: "allowance",
    args: [account.address, contract],
  }) as Promise<bigint>;

/** RPC nodes can briefly serve a stale block after a receipt; poll expected state. */
async function settle<T>(reader: () => Promise<T>, ok: (v: T) => boolean, label: string): Promise<T> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const value = await reader();
    if (ok(value)) return value;
    await new Promise((r) => setTimeout(r, 1_500));
  }
  throw new Error(label);
}

const recipient = (label: string) =>
  getAddress(`0x${keccak256(toHex(`flowbridge-multisend-mainnet-erc20:${label}`)).slice(26)}`) as Address;
const clientBatchId = keccak256(toHex(`multisend-mainnet-erc20-rehearsal-${Date.now()}`));
const unit = (value: string) => parseUnits(value, decimals);
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 1800);

const groups = [
  {
    mode: "distribute",
    recipients: [recipient("d1"), recipient("d2"), recipient("d3")],
    amounts: [unit("0.1"), unit("0.2"), unit("0.05")],
  },
  { mode: "consolidate", recipients: [recipient("destination")], amounts: [unit("0.3")] },
  {
    mode: "advanced",
    recipients: [recipient("a1"), recipient("a2")],
    amounts: [unit("0.15"), unit("0.25")],
  },
  {
    mode: "duplicate-recipients",
    recipients: [recipient("dup"), recipient("dup")],
    amounts: [unit("0.01"), unit("0.02")],
  },
];

const totalNeeded = groups.reduce(
  (sum, g) => sum + g.amounts.reduce((a, b) => a + b, 0n) * 10001n / 10000n + 1n,
  0n,
);
if ((await tokenBalance(account.address)) < totalNeeded) throw new Error("INSUFFICIENT_TOKEN_BALANCE");

const positives: unknown[] = [];
for (const group of groups) {
  const recipientsTotal = group.amounts.reduce((a, b) => a + b, 0n);
  const fee = await read<bigint>("quoteFee", [recipientsTotal]);
  const required = await read<bigint>("quoteRequiredSpend", [recipientsTotal]);
  if (required !== recipientsTotal + fee) throw new Error(`QUOTE_MISMATCH:${group.mode}`);

  // Exact allowance only — never unlimited.
  const approveHash = await walletClient.writeContract({
    address: TOKEN,
    abi: erc20Abi,
    functionName: "approve",
    args: [contract, required],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  await settle(tokenAllowance, (v) => v === required, `ALLOWANCE_NOT_EXACT:${group.mode}`);

  const uniqueRecipients = [...new Set(group.recipients)];
  const before = await Promise.all(uniqueRecipients.map(tokenBalance));
  const feeBefore = await tokenBalance(feeRecipient);

  const args = [clientBatchId, TOKEN, group.recipients, group.amounts, feeBps, configNonce, deadline()] as const;
  const gas = await publicClient.estimateContractGas({
    address: contract,
    abi,
    functionName: "sendToken",
    args,
    account,
  });
  const hash = await walletClient.writeContract({
    address: contract,
    abi,
    functionName: "sendToken",
    args,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`REHEARSAL_REVERTED:${group.mode}`);

  const expected = uniqueRecipients.map((to) =>
    group.recipients.reduce((sum, r, i) => (r === to ? sum + group.amounts[i]! : sum), 0n),
  );
  await settle(
    () => Promise.all(uniqueRecipients.map(tokenBalance)),
    (after) => after.every((balance, i) => balance - before[i]! === expected[i]!),
    `INEXACT_RECIPIENT_CREDIT:${group.mode}`,
  );
  await settle(() => tokenBalance(feeRecipient), (v) => v - feeBefore === fee, `FEE_NOT_EXACT:${group.mode}`);
  await settle(() => tokenBalance(contract), (v) => v === 0n, `CONTRACT_RETAINED_TOKENS:${group.mode}`);
  await settle(tokenAllowance, (v) => v === 0n, `ALLOWANCE_NOT_CONSUMED:${group.mode}`);

  positives.push({
    case: group.mode,
    txHash: hash,
    approvalTxHash: approveHash,
    blockNumber: receipt.blockNumber.toString(),
    recipients: group.recipients.length,
    recipientsTotal: recipientsTotal.toString(),
    serviceFee: fee.toString(),
    feeAsset: `${symbol} (same token as the transfer)`,
    gasEstimated: gas.toString(),
    gasUsed: receipt.gasUsed.toString(),
    exactRecipientCredit: true,
    exactAllowanceConsumed: true,
    contractTokenBalanceAfter: "0",
    status: "PASS",
  });
  console.log(`${group.mode}: ${hash}`);
}

/* ---------------------------------------------- simulated negative checks -- */
const negatives: { case: string; status: string; detail?: string }[] = [];
async function expectRejection(name: string, args: readonly unknown[]) {
  try {
    await publicClient.simulateContract({
      address: contract,
      abi,
      functionName: "sendToken",
      args,
      account,
    });
    negatives.push({ case: name, status: "FAIL", detail: "simulation accepted" });
    throw new Error(`NEGATIVE_CASE_ACCEPTED:${name}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("NEGATIVE_CASE_ACCEPTED")) throw error;
    const detail = (error as Error).message
      .split("\n")
      .find((l) => /Error:|revert/i.test(l))
      ?.trim();
    negatives.push({ case: name, status: "PASS", detail: detail?.slice(0, 160) });
    console.log(`rejected ${name}`);
  }
}

const base = [clientBatchId, TOKEN, [recipient("n1")], [unit("0.01")], feeBps, configNonce, deadline()] as const;
await expectRejection("zero-recipient", [base[0], TOKEN, [zeroAddress], [unit("0.01")], feeBps, configNonce, deadline()]);
await expectRejection("zero-amount", [base[0], TOKEN, [recipient("n2")], [0n], feeBps, configNonce, deadline()]);
await expectRejection("empty-batch", [base[0], TOKEN, [], [], feeBps, configNonce, deadline()]);
await expectRejection("length-mismatch", [base[0], TOKEN, [recipient("n3"), recipient("n4")], [unit("0.01")], feeBps, configNonce, deadline()]);
await expectRejection("stale-fee-snapshot", [base[0], TOKEN, [recipient("n5")], [unit("0.01")], feeBps + 1, configNonce, deadline()]);
await expectRejection("stale-config-nonce", [base[0], TOKEN, [recipient("n6")], [unit("0.01")], feeBps, configNonce + 1n, deadline()]);
await expectRejection("expired-deadline", [base[0], TOKEN, [recipient("n7")], [unit("0.01")], feeBps, configNonce, 1n]);
await expectRejection("insufficient-allowance", [base[0], TOKEN, [recipient("n8")], [unit("0.01")], feeBps, configNonce, deadline()]);

const report = {
  gate: "MULTISEND_V1_BOT_MAINNET_ERC20_REHEARSAL",
  verdict: "PASS",
  chainId: 677,
  contract,
  token: { address: TOKEN, symbol, decimals, approved: "FlowBridge production FLOW token" },
  source: account.address,
  feeRecipient,
  clientBatchId,
  feeBps,
  configNonce: configNonce.toString(),
  positives,
  negatives,
  residualAllowanceAfterAll: (await tokenAllowance()).toString(),
  contractTokenBalanceAfterAll: (await tokenBalance(contract)).toString(),
  executedAt: new Date().toISOString(),
};
const outputPath = join(
  REPO,
  "contracts/production/multisend-v1/release/bot-mainnet-rehearsal-erc20.json",
);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
