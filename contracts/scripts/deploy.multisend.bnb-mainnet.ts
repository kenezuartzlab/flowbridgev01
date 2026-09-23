/**
 * FlowBridge MultiSend V1 — BNB Smart Chain Mainnet (56) deployer.
 *
 * Deploys the frozen RC2 build line (unchanged source, self-contained
 * Standard-JSON bundle) with the approved FlowBridge production owner and fee recipient.
 * Requires --broadcast. Fails closed on any chain or state mismatch.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPublicClient, createWalletClient, defineChain, getAddress, http } from "viem";
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
const manifestPath = join(REPO, "contracts/deployments/multisend-bnb-mainnet.json");

if (!process.argv.includes("--broadcast")) throw new Error("BROADCAST_FLAG_REQUIRED");
if (config.chainId !== 56 || config.deploymentApproved !== true)
  throw new Error("DEPLOYMENT_NOT_APPROVED");
if (existsSync(manifestPath)) throw new Error("DEPLOYMENT_MANIFEST_ALREADY_EXISTS");
if (
  artifact.sourceSha256 !== botTestnet.sourceSha256 ||
  artifact.abiSha256 !== botTestnet.abiSha256 ||
  artifact.creationBytecodeSha256 !== botTestnet.creationBytecodeSha256 ||
  artifact.runtimeBytecodeSha256 !== botTestnet.frozenRuntimeBytecodeSha256
)
  throw new Error("BUILD_DIVERGES_FROM_ACCEPTED_RELEASE");

const rawKey = process.env["DEPLOYER_PRIVATE_KEY"];
if (!rawKey) throw new Error("APPROVED_SIGNER_UNAVAILABLE");
const account = privateKeyToAccount(
  (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`,
);
const owner = getAddress(config.initialOwner);
const feeRecipient = getAddress(config.feeRecipient);
if (account.address.toLowerCase() !== getAddress(config.approvedDeployer).toLowerCase())
  throw new Error("SIGNER_IS_NOT_APPROVED_DEPLOYER");

const rpc = process.env["BNB_MAINNET_RPC_URL"] ?? config.rpcUrl;
const chain = defineChain({
  id: 56,
  name: "BNB Smart Chain Mainnet",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
const publicClient = createPublicClient({ chain, transport: http(rpc) });
const walletClient = createWalletClient({ account, chain, transport: http(rpc) });
if ((await publicClient.getChainId()) !== 56) throw new Error("RPC_CHAIN_MISMATCH");

const hash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode: artifact.bytecode.object,
  args: [owner, feeRecipient],
});
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success" || !receipt.contractAddress)
  throw new Error("DEPLOYMENT_REVERTED");
const address = getAddress(receipt.contractAddress);
const code = await publicClient.getCode({ address });
if (!code || code === "0x") throw new Error("NO_DEPLOYED_CODE");

const read = (functionName: string) =>
  publicClient.readContract({ address, abi: artifact.abi, functionName } as never) as Promise<unknown>;
const live = {
  owner: getAddress((await read("owner")) as string),
  feeRecipient: getAddress((await read("feeRecipient")) as string),
  feeBps: Number(await read("feeBps")),
  maxFeeBps: Number(await read("MAX_FEE_BPS")),
  maxRecipients: Number(await read("maxRecipients")),
  configNonce: Number(await read("configNonce")),
  paused: Boolean(await read("paused")),
  runtimeBytes: (code.length - 2) / 2,
  nativeBalanceWei: (await publicClient.getBalance({ address })).toString(),
};
if (
  live.owner.toLowerCase() !== owner.toLowerCase() ||
  live.feeRecipient.toLowerCase() !== feeRecipient.toLowerCase() ||
  live.feeBps !== 1 ||
  live.maxFeeBps !== 100 ||
  live.maxRecipients !== 100 ||
  live.configNonce !== 0 ||
  live.paused ||
  live.nativeBalanceWei !== "0"
) {
  throw new Error(`POST_DEPLOY_STATE_MISMATCH:${JSON.stringify(live)}`);
}

const onChainRuntimeSha256 = createHash("sha256")
  .update(Buffer.from(code.slice(2), "hex"))
  .digest("hex");
const encode = (a: string) => a.replace(/^0x/, "").toLowerCase().padStart(64, "0");
const manifest = {
  release: "MultiSend V1 (RC2 build line) — BNB Smart Chain Mainnet",
  network: "bnb-mainnet",
  chainId: 56,
  address,
  deployer: account.address,
  owner,
  feeRecipient,
  deployTxHash: hash,
  blockNumber: receipt.blockNumber.toString(),
  gasUsed: receipt.gasUsed.toString(),
  sourceSha256: artifact.sourceSha256,
  abiSha256: artifact.abiSha256,
  creationBytecodeSha256: artifact.creationBytecodeSha256,
  frozenRuntimeBytecodeSha256: artifact.runtimeBytecodeSha256,
  onChainRuntimeBytecodeSha256: onChainRuntimeSha256,
  runtimeExactMatch: onChainRuntimeSha256 === artifact.runtimeBytecodeSha256,
  compiler: artifact.compiler,
  bundle: artifact.bundle,
  constructorArguments: {
    types: ["address initialOwner", "address initialFeeRecipient"],
    values: [owner, feeRecipient],
    abiEncoded: `0x${encode(owner)}${encode(feeRecipient)}`,
  },
  live,
  explorerVerified: false,
  acceptedBotTestnetRelease: botTestnet.address,
  deployedAt: new Date().toISOString(),
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      verdict: "BNB_MAINNET_DEPLOYED_CHAIN_STATE_PASS",
      chainId: 56,
      address,
      deployTxHash: hash,
      blockNumber: manifest.blockNumber,
      runtimeExactMatch: manifest.runtimeExactMatch,
      live,
    },
    null,
    2,
  ),
);
