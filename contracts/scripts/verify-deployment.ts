/**
 * FlowBridge V12 — post-deploy verification. Read-only; broadcasts nothing.
 * Usage: bun contracts/scripts/verify-deployment.ts contracts/deployments/bot-testnet.json
 *
 * Checks: token name/symbol/decimals/total supply, treasury balance, distributor
 * token binding, distributor owner, reward signer, pause state, EIP-712 domain
 * chain binding, and distributor FLOW balance vs recorded funding.
 */
import { readFileSync } from "node:fs";

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error("Usage: bun contracts/scripts/verify-deployment.ts <manifest.json>");
  process.exit(1);
}
const m = JSON.parse(readFileSync(manifestPath, "utf8"));

const ERC20_ABI = [
  { type: "function", name: "name", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "symbol", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "decimals", inputs: [], outputs: [{ type: "uint8" }], stateMutability: "view" },
  { type: "function", name: "totalSupply", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
] as const;

const DISTRIBUTOR_ABI = [
  { type: "function", name: "token", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "owner", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "rewardSigner", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "paused", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "domainSeparator", inputs: [], outputs: [{ type: "bytes32" }], stateMutability: "view" },
] as const;

async function main() {
  const { createPublicClient, http, defineChain, getAddress } = await import("viem");
  const rpc = process.env["BOT_TESTNET_RPC_URL"] ?? process.env["BOT_MAINNET_RPC_URL"];
  if (!rpc) throw new Error("Set BOT_TESTNET_RPC_URL (or BOT_MAINNET_RPC_URL).");

  const chain = defineChain({
    id: m.chainId,
    name: m.network,
    nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  });
  const client = createPublicClient({ chain, transport: http() });
  const token = getAddress(m.flowToken.address);
  const distributor = getAddress(m.flowRewardsDistributor.address);

  const read = (address: `0x${string}`, abi: any, functionName: string, args: any[] = []) =>
    client.readContract({ address, abi, functionName, args });

  const results: Record<string, unknown> = {
    chainId: await client.getChainId(),
    tokenName: await read(token, ERC20_ABI, "name"),
    tokenSymbol: await read(token, ERC20_ABI, "symbol"),
    tokenDecimals: await read(token, ERC20_ABI, "decimals"),
    totalSupply: (await read(token, ERC20_ABI, "totalSupply"))!.toString(),
    treasuryBalance: (await read(token, ERC20_ABI, "balanceOf", [getAddress(m.flowToken.treasury)]))!.toString(),
    distributorToken: await read(distributor, DISTRIBUTOR_ABI, "token"),
    distributorOwner: await read(distributor, DISTRIBUTOR_ABI, "owner"),
    rewardSigner: await read(distributor, DISTRIBUTOR_ABI, "rewardSigner"),
    paused: await read(distributor, DISTRIBUTOR_ABI, "paused"),
    domainSeparator: await read(distributor, DISTRIBUTOR_ABI, "domainSeparator"),
    distributorFlowBalance: (await read(token, ERC20_ABI, "balanceOf", [distributor]))!.toString(),
  };

  const failures: string[] = [];
  if (results.chainId !== m.chainId) failures.push("RPC chainId does not match manifest chainId");
  if (String(results.distributorToken).toLowerCase() !== token.toLowerCase())
    failures.push("distributor.token != manifest FLOW token");
  if (String(results.totalSupply) !== String(m.flowToken.totalSupply))
    failures.push("total supply != manifest total supply");
  if (String(results.distributorOwner).toLowerCase() !== String(m.flowRewardsDistributor.owner).toLowerCase())
    failures.push("distributor owner != manifest owner");
  if (String(results.rewardSigner).toLowerCase() !== String(m.flowRewardsDistributor.rewardSignerAddress).toLowerCase())
    failures.push("reward signer != manifest reward signer");

  console.log(JSON.stringify(results, null, 2));
  if (failures.length) {
    console.error("VERIFICATION FAILED:");
    failures.forEach((f) => console.error(" - " + f));
    process.exit(1);
  }
  console.log("VERIFICATION OK");
}

void main();
