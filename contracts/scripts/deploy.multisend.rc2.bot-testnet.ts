/** BOT Testnet-only MultiSend RC2 deployer (self-contained bundle build). Requires --broadcast. */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPublicClient, createWalletClient, defineChain, getAddress, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const REPO = resolve(join(import.meta.dirname ?? ".", "../.."));
const configPath = join(REPO, "contracts/config/multisend-bot-testnet.json");
const artifactPath = join(
  REPO,
  "contracts/production/multisend-v1/candidate-rc2/artifacts/FlowBridgeMultiSend.json",
);
const manifestPath = join(REPO, "contracts/deployments/multisend-rc2-bot-testnet.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
if (!process.argv.includes("--broadcast")) throw new Error("BROADCAST_FLAG_REQUIRED");
if (config.chainId !== 968 || config.deploymentApproved !== true)
  throw new Error("DEPLOYMENT_NOT_APPROVED");
if (existsSync(manifestPath)) throw new Error("DEPLOYMENT_MANIFEST_ALREADY_EXISTS");
if (artifact.compiler.viaIR !== true || artifact.bundle.selfContained !== true)
  throw new Error("UNEXPECTED_BUILD_SHAPE");

const rawKey = process.env["DEPLOYER_PRIVATE_KEY"];
if (!rawKey) throw new Error("APPROVED_SIGNER_UNAVAILABLE");
const account = privateKeyToAccount(
  (rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`,
);
const owner = getAddress(config.initialOwner);
const feeRecipient = getAddress(config.feeRecipient);
if (account.address.toLowerCase() !== owner.toLowerCase())
  throw new Error("SIGNER_IS_NOT_APPROVED_OWNER");

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
  maxRecipients: Number(await read("maxRecipients")),
  configNonce: Number(await read("configNonce")),
  paused: Boolean(await read("paused")),
  runtimeBytes: (code.length - 2) / 2,
};
if (
  live.owner.toLowerCase() !== owner.toLowerCase() ||
  live.feeRecipient.toLowerCase() !== feeRecipient.toLowerCase() ||
  live.feeBps !== 1 ||
  live.maxRecipients !== 100 ||
  live.configNonce !== 0 ||
  live.paused
) {
  throw new Error("POST_DEPLOY_STATE_MISMATCH");
}

const onChainRuntimeSha256 = createHash("sha256")
  .update(Buffer.from(code.slice(2), "hex"))
  .digest("hex");
const manifest = {
  release: "MultiSend V1 RC2 (self-contained Standard-JSON bundle)",
  network: "bot-testnet",
  chainId: 968,
  address,
  deployer: account.address,
  owner,
  feeRecipient,
  deployTxHash: hash,
  blockNumber: receipt.blockNumber.toString(),
  sourceSha256: artifact.sourceSha256,
  abiSha256: artifact.abiSha256,
  creationBytecodeSha256: artifact.creationBytecodeSha256,
  frozenRuntimeBytecodeSha256: artifact.runtimeBytecodeSha256,
  onChainRuntimeBytecodeSha256: onChainRuntimeSha256,
  runtimeExactMatch: onChainRuntimeSha256 === artifact.runtimeBytecodeSha256,
  compiler: artifact.compiler,
  bundle: artifact.bundle,
  constructorArguments: artifact.constructorArguments,
  live,
  explorerVerified: false,
  supersedes: "0x535dDDA826142AC42cE288154e9595f080940aE9",
  deployedAt: new Date().toISOString(),
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      verdict: "RC2_DEPLOYED_CHAIN_STATE_PASS",
      chainId: 968,
      address,
      deployTxHash: hash,
      runtimeExactMatch: manifest.runtimeExactMatch,
      live,
    },
    null,
    2,
  ),
);
