/**
 * FlowBridge MultiSend V1 — BNB Smart Chain Mainnet (97) predeployment gate.
 *
 * Read-only. No signing, no broadcast. Every check must pass before the
 * BNB Mainnet creation transaction may be prepared. The build line is the
 * accepted BOT RC2 release: identical source, bundle, compiler, optimizer,
 * viaIR, EVM target, metadata and ABI.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPublicClient, defineChain, getAddress, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const REPO = resolve(join(import.meta.dirname ?? ".", "../.."));
const config = JSON.parse(
  readFileSync(join(REPO, "contracts/config/multisend-bnb-mainnet.json"), "utf8"),
);
const artifact = JSON.parse(
  readFileSync(
    join(REPO, "contracts/production/multisend-v1/candidate-rc2/artifacts/FlowBridgeMultiSend.json"),
    "utf8",
  ),
);
const botTestnet = JSON.parse(
  readFileSync(join(REPO, "contracts/deployments/multisend-rc2-bot-testnet.json"), "utf8"),
);
const botMainnet = JSON.parse(
  readFileSync(join(REPO, "contracts/deployments/multisend-bot-mainnet.json"), "utf8"),
);
const bundle = readFileSync(join(REPO, artifact.bundle.path), "utf8");
const sha = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");

const checks: { id: string; ok: boolean; detail: string }[] = [];
const add = (id: string, ok: boolean, detail: string) => checks.push({ id, ok, detail });

add("CHAIN_ID_56_CONFIGURED", config.chainId === 56, `config chain ${config.chainId}`);
add("DEPLOYMENT_APPROVED", config.deploymentApproved === true, "owner approval flag");
add(
  "SOURCE_HASH_MATCHES_ACCEPTED_RELEASE",
  artifact.sourceSha256 === botTestnet.sourceSha256 &&
    artifact.sourceSha256 === botMainnet.sourceSha256,
  artifact.sourceSha256,
);
add(
  "ABI_MATCHES_ACCEPTED_RELEASE",
  artifact.abiSha256 === botTestnet.abiSha256 && artifact.abiSha256 === botMainnet.abiSha256,
  artifact.abiSha256,
);
add(
  "CREATION_BYTECODE_REPRODUCED",
  artifact.creationBytecodeSha256 === botTestnet.creationBytecodeSha256,
  artifact.creationBytecodeSha256,
);
add(
  "RUNTIME_BYTECODE_REPRODUCED",
  artifact.runtimeBytecodeSha256 === botTestnet.frozenRuntimeBytecodeSha256 &&
    artifact.runtimeBytecodeSha256 === botMainnet.frozenRuntimeBytecodeSha256,
  artifact.runtimeBytecodeSha256,
);
add("BUNDLE_HASH_MATCHES", sha(bundle) === botTestnet.bundle.sha256, botTestnet.bundle.sha256);
add(
  "BUNDLE_SELF_CONTAINED",
  artifact.bundle.selfContained === true && artifact.bundle.importCallbackUsed === false,
  `${artifact.bundle.sourceCount} inlined sources, OZ ${artifact.bundle.openzeppelin}`,
);
add("DOUBLE_BUILD_IDENTICAL", artifact.doubleBuildIdentical === true, "deterministic rebuild");
const c = artifact.compiler;
const t = botTestnet.compiler;
add(
  "COMPILER_SETTINGS_IDENTICAL",
  c.version === t.version &&
    c.optimizer.enabled === t.optimizer.enabled &&
    c.optimizer.runs === t.optimizer.runs &&
    c.viaIR === t.viaIR &&
    c.evmVersion === t.evmVersion &&
    c.metadata.bytecodeHash === t.metadata.bytecodeHash,
  `${c.version} optimizer ${c.optimizer.enabled}/${c.optimizer.runs} viaIR ${c.viaIR} ${c.evmVersion} metadata ${c.metadata.bytecodeHash}`,
);
add(
  "CONTRACT_SIZE_UNDER_EIP170",
  artifact.runtimeBytes < 24576,
  `${artifact.runtimeBytes} bytes, headroom ${artifact.eip170HeadroomBytes}`,
);
add("CONFIG_FEE_BPS_1", config.feeBps === 1, "0.01% service fee");
add("CONFIG_MAX_RECIPIENTS_100", config.maxRecipients === 100, "recipient cap");

const owner = getAddress(config.initialOwner);
const feeRecipient = getAddress(config.feeRecipient);
const deployer = getAddress(config.approvedDeployer);
add("OWNER_SET", owner.length === 42, owner);
add("FEE_RECIPIENT_SET", feeRecipient.length === 42, feeRecipient);
add(
  "FEE_RECIPIENT_DISTINCT_FROM_DEPLOYER",
  feeRecipient.toLowerCase() !== deployer.toLowerCase(),
  "fee recipient must not be a sending wallet (FeeRecipientIsSender)",
);
add(
  "APPROVED_PRODUCTION_OWNER_EXACT",
  owner.toLowerCase() === String(botMainnet.owner).toLowerCase(),
  `owner matches the approved FlowBridge production owner ${botMainnet.owner}`,
);
add(
  "APPROVED_PRODUCTION_FEE_RECIPIENT_EXACT",
  feeRecipient.toLowerCase() === String(botMainnet.feeRecipient).toLowerCase(),
  `fee recipient matches the approved FlowBridge production treasury ${botMainnet.feeRecipient}`,
);
const bnbTestnet = JSON.parse(
  readFileSync(join(REPO, "contracts/deployments/multisend-bnb-testnet.json"), "utf8"),
);
const testOnlyAddresses = new Set(
  [
    bnbTestnet.owner,
    bnbTestnet.feeRecipient,
    bnbTestnet.address,
    botTestnet.owner,
    botTestnet.feeRecipient,
    botTestnet.address,
    "0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e", // MSTT — TEST ONLY token, never mainnet
  ].map((a: string) => String(a).toLowerCase()),
);
add(
  "NO_TEST_ONLY_ADDRESS_REUSE",
  !testOnlyAddresses.has(owner.toLowerCase()) &&
    !testOnlyAddresses.has(feeRecipient.toLowerCase()) &&
    !testOnlyAddresses.has(deployer.toLowerCase() === deployer.toLowerCase() ? "" : ""),
  "no testnet wallet and no test token address enters the mainnet configuration",
);
add(
  "CONFIG_CONTAINS_NO_TEST_TOKEN",
  !JSON.stringify(config).toLowerCase().includes("0xa861152ca3676bccf7b5fdafb9eb6a57b9d32d0e") &&
    !/mstt/i.test(JSON.stringify(config)),
  "MSTT / test-token address absent from mainnet config",
);


const encode = (a: string) => a.replace(/^0x/, "").toLowerCase().padStart(64, "0");
const abiEncodedArgs = `0x${encode(owner)}${encode(feeRecipient)}`;
add(
  "CONSTRUCTOR_ARGS_ENCODED",
  abiEncodedArgs.length === 2 + 128,
  abiEncodedArgs,
);

const manifestPath = join(REPO, "contracts/deployments/multisend-bnb-mainnet.json");
add("BNB_MAINNET_SLOT_UNDEPLOYED", !existsSync(manifestPath), "no existing BNB testnet manifest");

const rawKey = process.env["DEPLOYER_PRIVATE_KEY"];
add("APPROVED_SIGNER_AVAILABLE", Boolean(rawKey), "signer present server-side (value never read out)");
let signer: string | null = null;
if (rawKey) {
  signer = privateKeyToAccount(
    (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`,
  ).address;
  add(
    "SIGNER_IS_APPROVED_DEPLOYER",
    signer.toLowerCase() === deployer.toLowerCase(),
    `signer ${signer}`,
  );
}

const rpc = process.env["BNB_MAINNET_RPC_URL"] ?? config.rpcUrl;
const chain = defineChain({
  id: 56,
  name: "BNB Smart Chain Mainnet",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
const client = createPublicClient({ chain, transport: http(rpc) });
const rpcChainId = await client.getChainId();
add("RPC_CHAIN_IS_56", rpcChainId === 56, `RPC reports ${rpcChainId}`);

if (rpcChainId === 56 && signer) {
  const balanceWei = await client.getBalance({ address: signer as `0x${string}` });
  const gasPrice = await client.getGasPrice();
  const creation = `${artifact.bytecode.object}${encode(owner)}${encode(feeRecipient)}`;
  const estimatedGas = await client.estimateGas({
    account: signer as `0x${string}`,
    data: creation as `0x${string}`,
  });
  const required = (estimatedGas * gasPrice * 15n) / 10n;
  add(
    "DEPLOYER_GAS_SUFFICIENT",
    balanceWei >= required,
    `balance ${balanceWei} wei, estimate ${estimatedGas} gas @ ${gasPrice} wei, required (1.5x) ${required}`,
  );
}

const failures = checks.filter((x) => !x.ok);
console.log(
  JSON.stringify(
    {
      verdict: failures.length
        ? "FLOWBRIDGE MULTISEND BNB MAINNET PREDEPLOYMENT BLOCKED"
        : "FLOWBRIDGE MULTISEND BNB MAINNET PREDEPLOYMENT PASS",
      chainId: rpcChainId,
      owner,
      feeRecipient,
      deployer,
      checks,
      failures: failures.map((f) => `${f.id}: ${f.detail}`),
    },
    null,
    2,
  ),
);
if (failures.length) process.exit(1);
