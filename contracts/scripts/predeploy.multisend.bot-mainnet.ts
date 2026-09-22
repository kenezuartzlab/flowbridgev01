/**
 * FlowBridge MultiSend V1 — BOT Mainnet (677) predeployment gate.
 *
 * Read-only. No signing, no broadcast. Every check must pass before the
 * mainnet creation transaction may be prepared.
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPublicClient, defineChain, getAddress, http } from "viem";
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
const testnet = JSON.parse(
  readFileSync(join(REPO, "contracts/deployments/multisend-rc2-bot-testnet.json"), "utf8"),
);
const bundlePath = join(REPO, artifact.bundle.path);
const bundle = readFileSync(bundlePath, "utf8");
const sha = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");

const checks: { id: string; ok: boolean; detail: string }[] = [];
const add = (id: string, ok: boolean, detail: string) => checks.push({ id, ok, detail });

add("CHAIN_ID_677_CONFIGURED", config.chainId === 677, `config chain ${config.chainId}`);
add("DEPLOYMENT_APPROVED", config.deploymentApproved === true, "owner approval flag");
add(
  "SOURCE_HASH_MATCHES_ACCEPTED_RELEASE",
  artifact.sourceSha256 === testnet.sourceSha256,
  artifact.sourceSha256,
);
add("ABI_MATCHES_ACCEPTED_RELEASE", artifact.abiSha256 === testnet.abiSha256, artifact.abiSha256);
add(
  "CREATION_BYTECODE_REPRODUCED",
  artifact.creationBytecodeSha256 === testnet.creationBytecodeSha256,
  artifact.creationBytecodeSha256,
);
add(
  "RUNTIME_BYTECODE_REPRODUCED",
  artifact.runtimeBytecodeSha256 === testnet.frozenRuntimeBytecodeSha256,
  artifact.runtimeBytecodeSha256,
);
add("BUNDLE_HASH_MATCHES", sha(bundle) === testnet.bundle.sha256, testnet.bundle.sha256);
add(
  "BUNDLE_SELF_CONTAINED",
  artifact.bundle.selfContained === true && artifact.bundle.importCallbackUsed === false,
  `${artifact.bundle.sourceCount} inlined sources, OZ ${artifact.bundle.openzeppelin}`,
);
add("DOUBLE_BUILD_IDENTICAL", artifact.doubleBuildIdentical === true, "deterministic rebuild");
const c = artifact.compiler;
const t = testnet.compiler;
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
add("PRODUCTION_OWNER_SET", owner.length === 42, owner);
add("PRODUCTION_FEE_RECIPIENT_SET", feeRecipient.length === 42, feeRecipient);
add(
  "FEE_RECIPIENT_DISTINCT_FROM_DEPLOYER",
  feeRecipient.toLowerCase() !== deployer.toLowerCase(),
  "fee recipient must not be a sending wallet (FeeRecipientIsSender)",
);
const testnetAddresses = new Set(
  [testnet.owner, testnet.feeRecipient, testnet.address, testnet.supersedes].map((a: string) =>
    a.toLowerCase(),
  ),
);
add(
  "NO_TESTNET_FEE_RECIPIENT_REUSE",
  !testnetAddresses.has(feeRecipient.toLowerCase()) && !testnetAddresses.has(owner.toLowerCase()),
  "production owner/fee recipient are not testnet addresses",
);

const manifestPath = join(REPO, "contracts/deployments/multisend-bot-mainnet.json");
add("MAINNET_SLOT_UNDEPLOYED", !existsSync(manifestPath), "no existing mainnet manifest");

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

const rpc = process.env["BOT_MAINNET_RPC_URL"] ?? config.rpcUrl;
const chain = defineChain({
  id: 677,
  name: "BOT Chain",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
const client = createPublicClient({ chain, transport: http(rpc) });
const rpcChainId = await client.getChainId();
add("RPC_CHAIN_IS_677", rpcChainId === 677, `RPC reports ${rpcChainId}`);

let balanceWei = 0n;
let gasPrice = 0n;
let estimatedGas = 0n;
if (rpcChainId === 677 && signer) {
  balanceWei = await client.getBalance({ address: signer as `0x${string}` });
  gasPrice = await client.getGasPrice();
  const data = readFileSync(
    join(
      REPO,
      "contracts/production/multisend-v1/candidate-rc2/unsigned-deployment-data.txt",
    ),
    "utf8",
  ).trim();
  // constructor args are re-encoded for mainnet owner/fee recipient
  const encode = (a: string) => a.replace(/^0x/, "").toLowerCase().padStart(64, "0");
  const creation = `${artifact.bytecode.object}${encode(owner)}${encode(feeRecipient)}`;
  if (data.length === 0) throw new Error("MISSING_UNSIGNED_DATA");
  estimatedGas = await client.estimateGas({
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

const failures = checks.filter((c) => !c.ok);
console.log(
  JSON.stringify(
    {
      verdict: failures.length
        ? "BOT MAINNET PREDEPLOYMENT GATE BLOCKED"
        : "BOT MAINNET PREDEPLOYMENT GATE PASS",
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
