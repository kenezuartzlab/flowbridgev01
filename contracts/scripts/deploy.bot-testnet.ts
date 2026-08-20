/**
 * FlowBridge V12.2 — BOT Testnet (968) deployment + funding script.
 *
 * Authorized operations, in this exact order and nothing else:
 *   1. deploy FlowToken (name/symbol/treasury/fixed supply from approved config)
 *   2. deploy FlowRewardsDistributor (token, approved reward signer, approved owner)
 *   3. transfer the approved 10,000,000 FLOW from treasury → distributor,
 *      ONLY when the treasury wallet itself can sign in this environment.
 *
 * It refuses to run unless --broadcast is passed AND every hard gate passes:
 * config == owner-approved V12.2 values, parameter lock ready, RPC chainId 968,
 * artifacts present. Never prints key material.
 *
 * Usage: bun contracts/scripts/deploy.bot-testnet.ts [--broadcast]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { buildFlowDeploymentPlan } from "../../src/lib/rewards/flowDeploymentPlan";
import {
  APPROVED_BOT_TESTNET,
  diffAgainstApprovedTestnet,
  mainnetStillBlocked,
} from "../../src/lib/rewards/flowApprovedTestnetPolicy";

const ROOT = join(import.meta.dirname ?? ".", "..");
const CONFIG_PATH = "contracts/config/bot-testnet.json";
const config = JSON.parse(readFileSync(join(ROOT, "config/bot-testnet.json"), "utf8"));
const mainnetConfig = JSON.parse(readFileSync(join(ROOT, "config/bot-mainnet.json"), "utf8"));

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function main() {
  const broadcast = process.argv.includes("--broadcast");
  const stops: string[] = [];

  const plan = buildFlowDeploymentPlan(config, CONFIG_PATH);
  if (!plan.ready) stops.push("Parameter lock BLOCKED: " + plan.blocked.join(", "));
  stops.push(...diffAgainstApprovedTestnet(config).map((d) => "Approved-value mismatch: " + d));
  if (!mainnetStillBlocked(mainnetConfig)) stops.push("BOT Mainnet 677 config is populated — STOP.");

  const tokenArtifactPath = join(ROOT, "artifacts/FlowToken.json");
  const distArtifactPath = join(ROOT, "artifacts/FlowRewardsDistributor.json");
  if (!existsSync(tokenArtifactPath) || !existsSync(distArtifactPath)) {
    stops.push("Compiled artifacts missing (contracts/artifacts/) — compile the reviewed sources first.");
  }
  if (!process.env[config.rpcUrlEnv]) stops.push(`${config.rpcUrlEnv} not set.`);
  if (!process.env[config.deployerKeyEnv]) stops.push(`${config.deployerKeyEnv} not available.`);

  if (stops.length) {
    console.error("FLOW V12.2 deployment is BLOCKED:");
    stops.forEach((m) => console.error(" - " + m));
    console.log("\nFLOW REWARDS V12.2 BOT TESTNET DEPLOYMENT BLOCKED");
    process.exit(1);
  }

  if (!broadcast) {
    console.log("Preflight OK. Dry run only — pass --broadcast to deploy.");
    console.log(JSON.stringify(plan.steps, null, 2));
    return;
  }

  const { createWalletClient, createPublicClient, http, defineChain, getAddress } = await import("viem");
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

  const liveChainId = await publicClient.getChainId();
  if (liveChainId !== APPROVED_BOT_TESTNET.chainId) {
    console.error(`STOP: RPC chainId ${liveChainId} != 968.`);
    console.log("\nFLOW REWARDS V12.2 BOT TESTNET DEPLOYMENT BLOCKED");
    process.exit(1);
  }
  console.log("deployer:", account.address);

  const tokenArtifact = JSON.parse(readFileSync(tokenArtifactPath, "utf8"));
  const distributorArtifact = JSON.parse(readFileSync(distArtifactPath, "utf8"));

  const tokenTx = await wallet.deployContract({
    abi: tokenArtifact.abi,
    bytecode: tokenArtifact.bytecode.object ?? tokenArtifact.bytecode,
    args: [
      APPROVED_BOT_TESTNET.token.name,
      APPROVED_BOT_TESTNET.token.symbol,
      APPROVED_BOT_TESTNET.token.treasury,
      BigInt(APPROVED_BOT_TESTNET.token.totalSupply),
    ],
  });
  const tokenReceipt = await publicClient.waitForTransactionReceipt({ hash: tokenTx });
  if (tokenReceipt.status !== "success") throw new Error("STOP: FlowToken deployment reverted.");
  const tokenAddress = getAddress(tokenReceipt.contractAddress!);

  const distTx = await wallet.deployContract({
    abi: distributorArtifact.abi,
    bytecode: distributorArtifact.bytecode.object ?? distributorArtifact.bytecode,
    args: [
      tokenAddress,
      APPROVED_BOT_TESTNET.distributor.rewardSigner,
      APPROVED_BOT_TESTNET.distributor.owner,
    ],
  });
  const distReceipt = await publicClient.waitForTransactionReceipt({ hash: distTx });
  if (distReceipt.status !== "success") throw new Error("STOP: FlowRewardsDistributor deployment reverted.");
  const distributorAddress = getAddress(distReceipt.contractAddress!);

  // Step 3 — treasury funding. Only the approved treasury may fund.
  let fundingTxHash: string | null = null;
  let unfundedReason: string | null = null;
  const treasuryKey = process.env["FLOW_TREASURY_PRIVATE_KEY"];
  const treasuryAccount = treasuryKey ? privateKeyToAccount(treasuryKey as `0x${string}`) : null;
  const deployerIsTreasury =
    account.address.toLowerCase() === APPROVED_BOT_TESTNET.token.treasury.toLowerCase();
  const treasurySigner =
    treasuryAccount &&
    treasuryAccount.address.toLowerCase() === APPROVED_BOT_TESTNET.token.treasury.toLowerCase()
      ? treasuryAccount
      : deployerIsTreasury
        ? account
        : null;

  if (!treasurySigner) {
    unfundedReason =
      "UNFUNDED — the approved treasury wallet cannot sign in this environment. Manual action: transfer exactly 10,000,000 FLOW from the treasury to the distributor address above.";
  } else {
    const treasuryWallet = createWalletClient({ account: treasurySigner, chain, transport: http() });
    const fundTx = await treasuryWallet.writeContract({
      address: tokenAddress,
      abi: [
        {
          type: "function",
          name: "transfer",
          stateMutability: "nonpayable",
          inputs: [{ type: "address" }, { type: "uint256" }],
          outputs: [{ type: "bool" }],
        },
      ] as const,
      functionName: "transfer",
      args: [distributorAddress, BigInt(APPROVED_BOT_TESTNET.distributor.initialFundingAmount)],
    });
    const fundReceipt = await publicClient.waitForTransactionReceipt({ hash: fundTx });
    if (fundReceipt.status !== "success") throw new Error("STOP: funding transfer reverted.");
    fundingTxHash = fundTx;
  }

  const manifest = {
    network: config.network,
    chainId: config.chainId,
    flowToken: {
      address: tokenAddress,
      name: APPROVED_BOT_TESTNET.token.name,
      symbol: APPROVED_BOT_TESTNET.token.symbol,
      decimals: 18,
      totalSupply: APPROVED_BOT_TESTNET.token.totalSupply,
      treasury: APPROVED_BOT_TESTNET.token.treasury,
      deployTxHash: tokenTx,
      sourceSha256: sha256(join(ROOT, "FlowToken.sol")),
      artifactSha256: sha256(tokenArtifactPath),
    },
    flowRewardsDistributor: {
      address: distributorAddress,
      token: tokenAddress,
      owner: APPROVED_BOT_TESTNET.distributor.owner,
      rewardSignerAddress: APPROVED_BOT_TESTNET.distributor.rewardSigner,
      paused: false,
      fundedAmount: fundingTxHash ? APPROVED_BOT_TESTNET.distributor.initialFundingAmount : "0",
      fundingTxHash: fundingTxHash ?? "UNFUNDED",
      unfundedReason,
      deployTxHash: distTx,
      sourceSha256: sha256(join(ROOT, "FlowRewardsDistributor.sol")),
      artifactSha256: sha256(distArtifactPath),
    },
    deployer: account.address,
    compiler: config.compiler,
    claim: config.claim,
    deployedAt: new Date().toISOString(),
  };

  const manifestPath = join(ROOT, "deployments/bot-testnet.json");
  if (existsSync(manifestPath)) {
    // Never overwrite history.
    writeFileSync(
      join(ROOT, `deployments/bot-testnet.${Date.now()}.json`),
      readFileSync(manifestPath),
    );
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify(manifest, null, 2));
  console.log(
    fundingTxHash
      ? "\nFLOW REWARDS V12.2 BOT TESTNET DEPLOYMENT PASS"
      : "\nFLOW REWARDS V12.2 BOT TESTNET DEPLOYMENT UNFUNDED",
  );
}

void main();
