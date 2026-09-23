/**
 * FlowBridge MultiSend V1 — BNB Smart Chain Mainnet (56) deployment recorder.
 *
 * Read-only. Reconstructs the deployment manifest for an already-broadcast
 * creation transaction (the deploy script's receipt poll was cut off by an RPC
 * archive restriction). Never signs or broadcasts anything.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPublicClient, defineChain, getAddress, http } from "viem";

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
if (existsSync(manifestPath)) throw new Error("DEPLOYMENT_MANIFEST_ALREADY_EXISTS");

const hash = process.argv[2] as `0x${string}`;
if (!hash?.startsWith("0x")) throw new Error("DEPLOY_TX_HASH_REQUIRED");
const owner = getAddress(config.initialOwner);
const feeRecipient = getAddress(config.feeRecipient);
const rpc = process.env["BNB_MAINNET_RPC_URL"] ?? config.rpcUrl;
const chain = defineChain({
  id: 56,
  name: "BNB Smart Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: { default: { http: [rpc] } },
});
const publicClient = createPublicClient({ chain, transport: http(rpc) });
if ((await publicClient.getChainId()) !== 56) throw new Error("RPC_CHAIN_MISMATCH");

const receipt = await publicClient.getTransactionReceipt({ hash });
if (receipt.status !== "success" || !receipt.contractAddress) throw new Error("DEPLOYMENT_REVERTED");
const address = getAddress(receipt.contractAddress);
const tx = await publicClient.getTransaction({ hash });
const code = await publicClient.getCode({ address });
if (!code || code === "0x") throw new Error("NO_DEPLOYED_CODE");

const encode = (a: string) => a.replace(/^0x/, "").toLowerCase().padStart(64, "0");
const expectedCreation = `${artifact.bytecode.object}${encode(owner)}${encode(feeRecipient)}`;
if (tx.input.toLowerCase() !== expectedCreation.toLowerCase())
  throw new Error("CREATION_INPUT_DIVERGES_FROM_FROZEN_BUILD");

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
const manifest = {
  release: "MultiSend V1 (RC2 build line) — BNB Smart Chain Mainnet",
  network: "bnb-mainnet",
  chainId: 56,
  address,
  deployer: getAddress(tx.from),
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
