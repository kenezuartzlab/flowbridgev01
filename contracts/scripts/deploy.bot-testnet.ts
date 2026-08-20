/**
 * FlowBridge V12 — deterministic BOT Testnet (968) deployment script.
 *
 * THIS SCRIPT DOES NOT BROADCAST IN THE V12 GATE. It refuses to run unless the
 * approval-gated config values are filled AND --broadcast is passed explicitly.
 * Run with: bun contracts/scripts/deploy.bot-testnet.ts [--broadcast]
 *
 * It expects compiled artifacts (produced from these exact Solidity sources by
 * the operator's solc/foundry/hardhat toolchain) at contracts/artifacts/.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname ?? ".", "..");
const config = JSON.parse(readFileSync(join(ROOT, "config/bot-testnet.json"), "utf8"));

function requireApproved(path: string, value: unknown) {
  if (value === null || value === undefined || value === "") {
    throw new Error(`BLOCKED: ${path} requires explicit owner approval before deployment.`);
  }
  return value;
}

async function main() {
  const broadcast = process.argv.includes("--broadcast");

  const missing: string[] = [];
  for (const [path, value] of [
    ["token.name", config.token.name],
    ["token.symbol", config.token.symbol],
    ["token.totalSupply", config.token.totalSupply],
    ["token.treasury", config.token.treasury],
    ["distributor.owner", config.distributor.owner],
    ["distributor.rewardSigner", config.distributor.rewardSigner],
    ["distributor.initialFundingAmount", config.distributor.initialFundingAmount],
  ] as const) {
    try {
      requireApproved(path, value);
    } catch (e: any) {
      missing.push(e.message);
    }
  }

  if (missing.length) {
    console.error("FLOW V12 deployment is BLOCKED. Unresolved values:");
    missing.forEach((m) => console.error(" - " + m));
    process.exit(1);
  }

  if (!broadcast) {
    console.log("Dry run only — pass --broadcast to deploy (not permitted in the V12 gate).");
    return;
  }

  const { createWalletClient, createPublicClient, http, defineChain } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");

  const chain = defineChain({
    id: config.chainId,
    name: config.network,
    nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
    rpcUrls: { default: { http: [process.env[config.rpcUrlEnv]!] } },
  });
  const account = privateKeyToAccount(process.env[config.deployerKeyEnv]! as `0x${string}`);
  const wallet = createWalletClient({ account, chain, transport: http() });
  const publicClient = createPublicClient({ chain, transport: http() });

  const tokenArtifact = JSON.parse(readFileSync(join(ROOT, "artifacts/FlowToken.json"), "utf8"));
  const distributorArtifact = JSON.parse(
    readFileSync(join(ROOT, "artifacts/FlowRewardsDistributor.json"), "utf8"),
  );

  const tokenTx = await wallet.deployContract({
    abi: tokenArtifact.abi,
    bytecode: tokenArtifact.bytecode.object ?? tokenArtifact.bytecode,
    args: [config.token.name, config.token.symbol, config.token.treasury, BigInt(config.token.totalSupply)],
  });
  const tokenReceipt = await publicClient.waitForTransactionReceipt({ hash: tokenTx });

  const distTx = await wallet.deployContract({
    abi: distributorArtifact.abi,
    bytecode: distributorArtifact.bytecode.object ?? distributorArtifact.bytecode,
    args: [tokenReceipt.contractAddress, config.distributor.rewardSigner, config.distributor.owner],
  });
  const distReceipt = await publicClient.waitForTransactionReceipt({ hash: distTx });

  console.log(
    JSON.stringify(
      {
        network: config.network,
        chainId: config.chainId,
        flowToken: { address: tokenReceipt.contractAddress, deployTxHash: tokenTx },
        flowRewardsDistributor: { address: distReceipt.contractAddress, deployTxHash: distTx },
        deployer: account.address,
      },
      null,
      2,
    ),
  );
}

void main();
