/**
 * Owner-only fee-recipient update, BOT Testnet (chain 968) only.
 *
 * The contract refuses any batch whose sender is the fee recipient, so testnet
 * rehearsals need the fee recipient to be a wallet other than the source wallet.
 * Requires the approved owner signer, an explicit --broadcast, and an approved
 * target address recorded in the testnet config.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createPublicClient, createWalletClient, defineChain, getAddress, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const REPO = resolve(join(import.meta.dirname ?? ".", "../.."));
const configPath = join(REPO, "contracts/config/multisend-bot-testnet.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const artifact = JSON.parse(readFileSync(join(REPO, "contracts/production/multisend-v1/artifacts/FlowBridgeMultiSend.json"), "utf8"));
const manifestPath = join(REPO, "contracts/deployments/multisend-bot-testnet.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (!process.argv.includes("--broadcast")) throw new Error("BROADCAST_FLAG_REQUIRED");
if (config.chainId !== 968) throw new Error("TESTNET_ONLY");

const target = getAddress(config.feeRecipient);
const rawKey = process.env["DEPLOYER_PRIVATE_KEY"];
if (!rawKey) throw new Error("APPROVED_SIGNER_UNAVAILABLE");
const account = privateKeyToAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`);
if (account.address.toLowerCase() !== String(config.initialOwner).toLowerCase()) throw new Error("SIGNER_IS_NOT_APPROVED_OWNER");
if (target.toLowerCase() === account.address.toLowerCase()) throw new Error("FEE_RECIPIENT_MUST_DIFFER_FROM_SOURCE");

const rpc = process.env["BOT_TESTNET_RPC_URL"] ?? config.rpcUrl;
const chain = defineChain({ id: 968, name: "BOT Chain Testnet", nativeCurrency: { name: "BOT", symbol: "tBOT", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const publicClient = createPublicClient({ chain, transport: http(rpc) });
const walletClient = createWalletClient({ account, chain, transport: http(rpc) });
if ((await publicClient.getChainId()) !== 968) throw new Error("RPC_CHAIN_MISMATCH");

const address = getAddress(manifest.address);
const read = (functionName: string) => publicClient.readContract({ address, abi: artifact.abi, functionName } as never) as Promise<unknown>;
const before = { feeRecipient: getAddress((await read("feeRecipient")) as string), configNonce: Number(await read("configNonce")) };

const hash = await walletClient.writeContract({ address, abi: artifact.abi, functionName: "setFeeRecipient", args: [target] });
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") throw new Error("SET_FEE_RECIPIENT_REVERTED");

const after = { feeRecipient: getAddress((await read("feeRecipient")) as string), configNonce: Number(await read("configNonce")) };
if (after.feeRecipient.toLowerCase() !== target.toLowerCase()) throw new Error("FEE_RECIPIENT_NOT_APPLIED");
if (after.configNonce !== before.configNonce + 1) throw new Error("CONFIG_NONCE_NOT_BUMPED");

manifest.feeRecipient = target;
manifest.live = { ...manifest.live, feeRecipient: target, configNonce: after.configNonce };
manifest.feeRecipientUpdates = [
  ...(manifest.feeRecipientUpdates ?? []),
  { from: before.feeRecipient, to: target, txHash: hash, blockNumber: receipt.blockNumber.toString(), at: new Date().toISOString() },
];
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(JSON.stringify({ verdict: "FEE_RECIPIENT_UPDATED", chainId: 968, address, txHash: hash, before, after }, null, 2));
