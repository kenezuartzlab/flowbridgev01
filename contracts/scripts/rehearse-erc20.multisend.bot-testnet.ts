/**
 * BOT Testnet ERC-20 rehearsal + live negative acceptance for MultiSend V1.
 *
 * Positive: Distribute, Consolidate and Advanced group shapes with a plain
 * ERC-20, proving exact recipient credit, the 1 bps fee charged in the
 * transferred token, exact allowance consumption and zero contract custody.
 * Negative: every rejection path is asserted against live chain state with
 * eth_call simulation, so no unsafe transaction is ever broadcast.
 *
 * Testnet only (chain 968). Requires the approved signer and --broadcast.
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
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const REPO = resolve(join(import.meta.dirname ?? ".", "../.."));
const config = JSON.parse(readFileSync(join(REPO, "contracts/config/multisend-bot-testnet.json"), "utf8"));
const artifact = JSON.parse(
  readFileSync(join(REPO, (process.env["MULTISEND_ARTIFACT"] ?? "contracts/production/multisend-v1/artifacts/FlowBridgeMultiSend.json")), "utf8"),
);
const tokenArtifact = JSON.parse(
  readFileSync(join(REPO, "contracts/production/multisend-v1/test-assets/artifacts/MultiSendTestToken.json"), "utf8"),
);
const manifestPath = join(REPO, (process.env["MULTISEND_MANIFEST"] ?? "contracts/deployments/multisend-bot-testnet.json"));
if (!existsSync(manifestPath)) throw new Error("DEPLOYMENT_MANIFEST_MISSING");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (!process.argv.includes("--broadcast")) throw new Error("BROADCAST_FLAG_REQUIRED");
if (config.chainId !== 968) throw new Error("TESTNET_ONLY");

const rawKey = process.env["DEPLOYER_PRIVATE_KEY"];
if (!rawKey) throw new Error("APPROVED_SIGNER_UNAVAILABLE");
const account = privateKeyToAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`);
if (account.address.toLowerCase() !== String(config.initialOwner).toLowerCase()) {
  throw new Error("SIGNER_IS_NOT_APPROVED_OWNER");
}

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

const contract = getAddress(manifest.address) as Address;
const abi = artifact.abi;
const feeRecipient = getAddress(manifest.feeRecipient) as Address;

const read = <T>(functionName: string, args: unknown[] = []) =>
  publicClient.readContract({ address: contract, abi, functionName, args }) as Promise<T>;

const feeBps = Number(await read<number>("feeBps"));
const configNonce = BigInt(await read<bigint>("configNonce"));
const maxRecipients = Number(await read<number>("maxRecipients"));
if (await read<boolean>("paused")) throw new Error("CONTRACT_PAUSED");

/* ------------------------------------------------------------ test token -- */
const tokenManifestPath = join(REPO, "contracts/deployments/multisend-testtoken-bot-testnet.json");
const DECIMALS = 18;
const SUPPLY = parseUnits("1000000", DECIMALS);
let token: Address;
let tokenDeployTx: string;

if (existsSync(tokenManifestPath)) {
  const tokenManifest = JSON.parse(readFileSync(tokenManifestPath, "utf8"));
  token = getAddress(tokenManifest.address) as Address;
  tokenDeployTx = tokenManifest.deployTxHash;
} else {
  const hash = await walletClient.deployContract({
    abi: tokenArtifact.abi,
    bytecode: `0x${tokenArtifact.bytecode.replace(/^0x/, "")}` as `0x${string}`,
    args: [account.address, SUPPLY],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success" || !receipt.contractAddress) throw new Error("TEST_TOKEN_DEPLOY_FAILED");
  token = getAddress(receipt.contractAddress) as Address;
  tokenDeployTx = hash;
  writeFileSync(
    tokenManifestPath,
    JSON.stringify(
      {
        purpose: "MultiSend V1 BOT Testnet ERC-20 rehearsal asset only — never mainnet, never product code",
        network: "bot-testnet",
        chainId: 968,
        address: token,
        symbol: "MSTT",
        decimals: DECIMALS,
        totalSupply: SUPPLY.toString(),
        holder: account.address,
        deployTxHash: hash,
        deployedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`test token deployed: ${token}`);
}

const tokenAbi = tokenArtifact.abi;
const tokenBalance = (who: Address) =>
  publicClient.readContract({ address: token, abi: tokenAbi, functionName: "balanceOf", args: [who] }) as Promise<bigint>;
/** RPC nodes can briefly serve a stale block after a receipt; poll the expected state. */
async function settle<T>(read: () => Promise<T>, ok: (value: T) => boolean, label: string): Promise<T> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const value = await read();
    if (ok(value)) return value;
    await new Promise((r) => setTimeout(r, 1_500));
  }
  throw new Error(label);
}

const tokenAllowance = () =>
  publicClient.readContract({
    address: token,
    abi: tokenAbi,
    functionName: "allowance",
    args: [account.address, contract],
  }) as Promise<bigint>;

/* ------------------------------------------------------------- positives -- */
const recipient = (label: string) =>
  getAddress(`0x${keccak256(toHex(`flowbridge-multisend-erc20:${label}`)).slice(26)}`) as Address;
const clientBatchId = keccak256(toHex(`multisend-erc20-rehearsal-${Date.now()}`));
const unit = (value: string) => parseUnits(value, DECIMALS);
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 1800);

const groups = [
  {
    mode: "distribute",
    recipients: [recipient("d1"), recipient("d2"), recipient("d3")],
    amounts: [unit("10"), unit("20"), unit("5.5")],
  },
  { mode: "consolidate", recipients: [recipient("destination")], amounts: [unit("30")] },
  { mode: "advanced", recipients: [recipient("a1"), recipient("a2")], amounts: [unit("15"), unit("25")] },
  { mode: "duplicate-recipients", recipients: [recipient("dup"), recipient("dup")], amounts: [unit("1"), unit("2")] },
];

const positives: unknown[] = [];
for (const group of groups) {
  const recipientsTotal = group.amounts.reduce((sum, amount) => sum + amount, 0n);
  const fee = await read<bigint>("quoteFee", [recipientsTotal]);
  const required = await read<bigint>("quoteRequiredSpend", [recipientsTotal]);
  if (required !== recipientsTotal + fee) throw new Error(`QUOTE_MISMATCH:${group.mode}`);

  // Exact allowance only — never unlimited.
  const approveHash = await walletClient.writeContract({
    address: token,
    abi: tokenAbi,
    functionName: "approve",
    args: [contract, required],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });
  await settle(tokenAllowance, (v) => v === required, `ALLOWANCE_NOT_EXACT:${group.mode}`);

  const uniqueRecipients = [...new Set(group.recipients)];
  const before = await Promise.all(uniqueRecipients.map(tokenBalance));
  const feeBefore = await tokenBalance(feeRecipient);

  const args = [clientBatchId, token, group.recipients, group.amounts, feeBps, configNonce, deadline()] as const;
  const gas = await publicClient.estimateContractGas({
    address: contract,
    abi,
    functionName: "sendToken",
    args,
    account,
  });
  const hash = await walletClient.writeContract({ address: contract, abi, functionName: "sendToken", args });
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
    feeAsset: "MSTT (same token as the transfer)",
    gasEstimated: gas.toString(),
    gasUsed: receipt.gasUsed.toString(),
    exactRecipientCredit: true,
    exactAllowanceConsumed: true,
    contractTokenBalanceAfter: "0",
    status: "PASS",
  });
  console.log(`${group.mode}: ${hash}`);
}

/* ------------------------------------------------------------- negatives -- */
const negatives: { case: string; expected: string; status: string; detail?: string }[] = [];

async function expectRejection(name: string, expected: string, run: () => Promise<unknown>) {
  try {
    await run();
    negatives.push({ case: name, expected, status: "FAIL", detail: "call was accepted" });
    throw new Error(`NEGATIVE_CASE_ACCEPTED:${name}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("NEGATIVE_CASE_ACCEPTED")) throw error;
    const detail = (error as Error).message.split("\n").find((l) => /Error:|reverted|revert/i.test(l))?.trim();
    negatives.push({ case: name, expected, status: "PASS", detail: detail?.slice(0, 160) });
    console.log(`rejected ${name}`);
  }
}

const simulate = (overrides: {
  recipients: Address[];
  amounts: bigint[];
  fee?: number;
  nonce?: bigint;
  deadline?: bigint;
  tokenAddress?: Address;
}) =>
  publicClient.simulateContract({
    address: contract,
    abi,
    functionName: "sendToken",
    account,
    args: [
      clientBatchId,
      overrides.tokenAddress ?? token,
      overrides.recipients,
      overrides.amounts,
      overrides.fee ?? feeBps,
      overrides.nonce ?? configNonce,
      overrides.deadline ?? deadline(),
    ],
  });

// The current allowance is zero after every positive group, which is exactly the
// "insufficient approval" condition — assert it first, then approve per case.
await expectRejection("erc20-insufficient-allowance", "transferFrom rejected without approval", () =>
  simulate({ recipients: [recipient("n1")], amounts: [unit("5")] }),
);

const big = unit("10");
const approveForNegatives = await walletClient.writeContract({
  address: token,
  abi: tokenAbi,
  functionName: "approve",
  args: [contract, unit("10000000")],
});
await publicClient.waitForTransactionReceipt({ hash: approveForNegatives });

await expectRejection("zero-recipient-address", "InvalidRecipient", () =>
  simulate({ recipients: ["0x0000000000000000000000000000000000000000"], amounts: [big] }),
);
await expectRejection("zero-transfer-amount", "InvalidAmount", () =>
  simulate({ recipients: [recipient("n2")], amounts: [0n] }),
);
await expectRejection("self-recipient", "RecipientIsSender", () =>
  simulate({ recipients: [account.address], amounts: [big] }),
);
await expectRejection("malformed-length-mismatch", "LengthMismatch", () =>
  simulate({ recipients: [recipient("n3"), recipient("n4")], amounts: [big] }),
);
await expectRejection("empty-batch", "EmptyBatch", () => simulate({ recipients: [], amounts: [] }));
await expectRejection(`over-${maxRecipients}-recipients`, "TooManyRecipients", () =>
  simulate({
    recipients: Array.from({ length: maxRecipients + 1 }, (_, i) => recipient(`bulk${i}`)),
    amounts: Array.from({ length: maxRecipients + 1 }, () => unit("0.001")),
  }),
);
await expectRejection("insufficient-token-balance", "transferFrom balance check", () =>
  simulate({ recipients: [recipient("n5")], amounts: [unit("999000000")] }),
);
await expectRejection("expired-deadline", "TransactionExpired", () =>
  simulate({ recipients: [recipient("n6")], amounts: [big], deadline: BigInt(Math.floor(Date.now() / 1000) - 60) }),
);
await expectRejection("fee-changed-after-review", "FeeChanged", () =>
  simulate({ recipients: [recipient("n7")], amounts: [big], fee: feeBps + 1 }),
);
await expectRejection("configuration-changed-after-review", "ConfigChanged", () =>
  simulate({ recipients: [recipient("n8")], amounts: [big], nonce: configNonce + 1n }),
);
await expectRejection("zero-token-address", "InvalidToken", () =>
  simulate({
    recipients: [recipient("n9")],
    amounts: [big],
    tokenAddress: "0x0000000000000000000000000000000000000000",
  }),
);
await expectRejection("non-token-address-as-token", "no ERC-20 at address", () =>
  simulate({ recipients: [recipient("n10")], amounts: [big], tokenAddress: feeRecipient }),
);
await expectRejection("unauthorized-fee-change", "Ownable unauthorized (non-owner simulation)", () =>
  publicClient.simulateContract({
    address: contract,
    abi,
    functionName: "setFeeBps",
    account: recipient("attacker"),
    args: [100],
  }),
);
await expectRejection("unauthorized-pause", "Ownable unauthorized (non-owner simulation)", () =>
  publicClient.simulateContract({ address: contract, abi, functionName: "pause", account: recipient("attacker"), args: [] }),
);
await expectRejection("unauthorized-rescue", "Ownable unauthorized (non-owner simulation)", () =>
  publicClient.simulateContract({
    address: contract,
    abi,
    functionName: "rescueToken",
    account: recipient("attacker"),
    args: [token, recipient("attacker"), 1n],
  }),
);

// MAX behaviour: the largest recipient total that still fits the balance with the fee.
const holderBalance = await tokenBalance(account.address);
const BPS = 10_000n;
let maxTotal = (holderBalance * BPS) / (BPS + BigInt(feeBps));
while ((await read<bigint>("quoteRequiredSpend", [maxTotal + 1n])) <= holderBalance) maxTotal += 1n;
while (maxTotal > 0n && (await read<bigint>("quoteRequiredSpend", [maxTotal])) > holderBalance) maxTotal -= 1n;
const maxRequired = await read<bigint>("quoteRequiredSpend", [maxTotal]);
if (maxRequired > holderBalance) throw new Error("MAX_EXCEEDS_BALANCE");
await simulate({ recipients: [recipient("max")], amounts: [maxTotal] });
await expectRejection("max-plus-one-base-unit", "balance exceeded by one unit above MAX", () =>
  simulate({ recipients: [recipient("max")], amounts: [maxTotal + 1n] }),
);

// Leave no standing approval behind.
const revoke = await walletClient.writeContract({
  address: token,
  abi: tokenAbi,
  functionName: "approve",
  args: [contract, 0n],
});
await publicClient.waitForTransactionReceipt({ hash: revoke });
await settle(tokenAllowance, (v) => v === 0n, "ALLOWANCE_NOT_REVOKED");

const report = {
  gate: "MULTISEND_V1_BOT_TESTNET_ERC20_AND_ADVERSARIAL_REHEARSAL",
  verdict: negatives.every((n) => n.status === "PASS") ? "PASS" : "FAIL",
  chainId: 968,
  contract,
  token,
  tokenSymbol: "MSTT",
  tokenDecimals: DECIMALS,
  tokenDeployTxHash: tokenDeployTx,
  source: account.address,
  feeRecipient,
  feeBps,
  configNonce: configNonce.toString(),
  maxRecipients,
  clientBatchId,
  positives,
  negatives,
  maxBehaviour: {
    holderBalance: holderBalance.toString(),
    maxRecipientsTotal: maxTotal.toString(),
    requiredSpendAtMax: maxRequired.toString(),
    simulatedAtMax: "PASS",
    oneUnitAboveMax: "REJECTED",
  },
  residualAllowance: "0",
  contractTokenBalance: (await tokenBalance(contract)).toString(),
  executedAt: new Date().toISOString(),
};
const outputPath = join(REPO, "contracts/production/multisend-v1/release/bot-testnet-rehearsal-erc20.json");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ verdict: report.verdict, token, positives: positives.length, negatives: negatives.length }, null, 2));
