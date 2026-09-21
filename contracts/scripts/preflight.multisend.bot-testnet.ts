/** BOT Testnet MultiSend deployment preflight. Produces unsigned data only; never signs or broadcasts. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { encodeDeployData, getAddress, isAddress } from "viem";

const REPO = resolve(join(import.meta.dirname ?? ".", "../.."));
const configPath = join(REPO, "contracts/config/multisend-bot-testnet.json");
const artifactPath = join(REPO, "contracts/production/multisend-v1/artifacts/FlowBridgeMultiSend.json");
const outputPath = join(REPO, "contracts/production/multisend-v1/release/bot-testnet-preflight.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const stops: string[] = [];

if (config.chainId !== 968) stops.push("chainId must be 968");
if (config.network !== "bot-testnet") stops.push("network must be bot-testnet");
if (config.feeBps !== 1) stops.push("initial fee must remain 1 bps");
if (config.maxRecipients !== 100) stops.push("initial recipient limit must remain 100");
if (!isAddress(config.initialOwner ?? "")) stops.push("approved initialOwner is missing or invalid");
if (!isAddress(config.feeRecipient ?? "")) stops.push("approved feeRecipient is missing or invalid");
if (config.deploymentApproved !== true) stops.push("deploymentApproved is not true");
if (!existsSync(artifactPath)) stops.push("pinned compiler artifact is missing; run multisend:compile");

if (stops.length) {
  console.error("MULTISEND BOT TESTNET PREFLIGHT BLOCKED\n - " + stops.join("\n - "));
  process.exit(1);
}

const owner = getAddress(config.initialOwner);
const feeRecipient = getAddress(config.feeRecipient);

const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
const data = encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode.object, args: [owner, feeRecipient] });
const rpcResponse = await fetch(config.rpcUrl, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
});
const rpcJson = await rpcResponse.json();
if (Number(BigInt(rpcJson.result ?? "0x0")) !== 968) throw new Error("RPC_CHAIN_MISMATCH");

const report = {
  gate: "MULTISEND_V1_BOT_TESTNET_PREFLIGHT",
  verdict: "PASS_UNSIGNED_AWAITING_WALLET_AUTHORIZATION",
  chainId: 968,
  owner,
  feeRecipient,
  feeBps: 1,
  maxRecipients: 100,
  compiler: artifact.compiler,
  sourceSha256: artifact.sourceSha256,
  abiSha256: artifact.abiSha256,
  creationBytecodeSha256: artifact.creationBytecodeSha256,
  runtimeBytes: artifact.runtimeBytes,
  unsignedDeploymentDataSha256: createHash("sha256").update(data).digest("hex"),
  unsignedDeploymentData: data,
  generatedAt: new Date().toISOString(),
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ ...report, unsignedDeploymentData: "WRITTEN_TO_RELEASE_ARTIFACT" }, null, 2));