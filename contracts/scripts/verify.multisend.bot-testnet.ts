/** Read-only post-deployment verifier for BOT Testnet chain 968. */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPublicClient, defineChain, getAddress, http, isAddress } from "viem";

const REPO = resolve(join(import.meta.dirname ?? ".", "../.."));
const config = JSON.parse(readFileSync(join(REPO, "contracts/config/multisend-bot-testnet.json"), "utf8"));
const artifact = JSON.parse(readFileSync(join(REPO, "contracts/production/multisend-v1/artifacts/FlowBridgeMultiSend.json"), "utf8"));
const manifestPath = join(REPO, "contracts/deployments/multisend-bot-testnet.json");
if (!existsSync(manifestPath)) {
  console.log("No MultiSend BOT Testnet deployment manifest exists. Nothing was verified or enabled.");
  process.exit(0);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (!isAddress(manifest.address ?? "")) throw new Error("INVALID_DEPLOYMENT_ADDRESS");

const chain = defineChain({ id: 968, name: "BOT Chain Testnet", nativeCurrency: { name: "BOT", symbol: "tBOT", decimals: 18 }, rpcUrls: { default: { http: [config.rpcUrl] } } });
const client = createPublicClient({ chain, transport: http(config.rpcUrl) });
if ((await client.getChainId()) !== 968) throw new Error("RPC_CHAIN_MISMATCH");
const address = getAddress(manifest.address);
const code = await client.getCode({ address });
if (!code || code === "0x") throw new Error("NO_RUNTIME_BYTECODE");

const read = (functionName: string) => client.readContract({ address, abi: artifact.abi, functionName } as never) as Promise<unknown>;
const live = {
  owner: getAddress((await read("owner")) as string),
  feeRecipient: getAddress((await read("feeRecipient")) as string),
  feeBps: Number(await read("feeBps")),
  maxRecipients: Number(await read("maxRecipients")),
  configNonce: Number(await read("configNonce")),
  paused: Boolean(await read("paused")),
  runtimeBytes: (code.length - 2) / 2,
};
const failures: string[] = [];
if (live.owner.toLowerCase() !== String(config.initialOwner).toLowerCase()) failures.push("owner mismatch");
if (live.feeRecipient.toLowerCase() !== String(config.feeRecipient).toLowerCase()) failures.push("fee recipient mismatch");
if (live.feeBps !== 1) failures.push("fee is not 1 bps");
if (live.maxRecipients !== 100) failures.push("recipient limit is not 100");
const expectedNonce = (manifest.feeRecipientUpdates ?? []).length;
if (live.configNonce !== expectedNonce) failures.push(`config nonce is ${live.configNonce}, expected ${expectedNonce} recorded configuration change(s)`);
if (live.paused) failures.push("contract is paused");
if (failures.length) throw new Error("POST_DEPLOY_VERIFICATION_FAILED: " + failures.join(", "));
console.log(JSON.stringify({ verdict: config.explorerVerified === true ? "PASS_VERIFIED" : "CHAIN_STATE_PASS_EXPLORER_VERIFICATION_PENDING", chainId: 968, address, live }, null, 2));