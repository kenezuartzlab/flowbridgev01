/**
 * FlowBridge V13.2 — FlowStakingVault BOT Testnet (968) deployment + funding gate.
 *
 * Authorized operations, in this exact order and nothing else:
 *   1. deploy FlowStakingVault(token = approved FLOW, owner = approved vaultOwner)
 *   2. setMinStake(10 FLOW) from the approved owner
 *   3. approve + fundRewards(100,000 FLOW) from the APPROVED REWARD TREASURY only
 *   4. activateSchedule(100,000 FLOW, 2,592,000s) from the approved owner,
 *      only after live funding sufficiency is verified on-chain
 *
 * NOT authorized: any user stake/approve/withdraw/reward-claim, any mainnet
 * action, any economics change, any second schedule.
 *
 * Refuses to broadcast unless --broadcast is passed AND every hard gate passes.
 * Never prints key material.
 *
 * Usage: bun contracts/scripts/deploy.staking.bot-testnet.ts [--broadcast]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { buildFlowStakingLockReport } from "../../src/lib/staking/flowStakingLock";
import { FLOW_STAKING_CHAINS } from "../../src/lib/staking/flowStakingRegistry";

const ROOT = resolve(join(import.meta.dirname ?? ".", ".."));
const CONFIG_PATH = "contracts/config/staking-bot-testnet.json";
const config = JSON.parse(readFileSync(join(ROOT, "config/staking-bot-testnet.json"), "utf8"));

const APPROVED = {
  chainId: 968,
  token: "0xCE14Ca1CF2012F1996D5FBc7d369FA051aa641Ac",
  vaultOwner: "0x628e237b73C5a37EF3968527563FA1a26b32BB97",
  rewardTreasury: "0xFA3DE5CFa1DE8EcC36197dCC0FC34fef5c1C7e47",
  minStake: 10n * 10n ** 18n,
  rewardBudget: 100000n * 10n ** 18n,
  duration: 2592000n,
} as const;

const sha256 = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
const lower = (s: string) => s.toLowerCase();

const ERC20_ABI = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

async function main() {
  const broadcast = process.argv.includes("--broadcast");
  const stops: string[] = [];

  // --- config / policy drift gates -------------------------------------
  const lock = buildFlowStakingLockReport(config, CONFIG_PATH);
  for (const v of lock.verdicts) {
    console.log(`${v.status.padEnd(11)} ${v.parameter.padEnd(34)} ${v.value ?? "-"}`);
  }
  if (!lock.parameterLockPass) stops.push("V13.1 parameter lock BLOCKED: " + lock.blocked.join(", "));

  if (lower(String(config.token)) !== lower(APPROVED.token)) stops.push("config.token != approved FLOW token");
  if (lower(String(config.vaultOwner)) !== lower(APPROVED.vaultOwner)) stops.push("config.vaultOwner != approved owner");
  if (lower(String(config.rewardTreasury)) !== lower(APPROVED.rewardTreasury)) stops.push("config.rewardTreasury != approved treasury");
  if (BigInt(config.economics.minStake) !== APPROVED.minStake) stops.push("config minStake != 10 FLOW");
  if (BigInt(config.economics.rewardBudgetPerEpoch) !== APPROVED.rewardBudget) stops.push("config rewardBudget != 100,000 FLOW");
  if (BigInt(config.economics.epochDurationSeconds) !== APPROVED.duration) stops.push("config epochDuration != 2,592,000s");
  if (config.chainId !== APPROVED.chainId) stops.push("config chainId != 968");
  if (config.economics.lockSeconds !== null || config.economics.earlyWithdrawPenaltyBps !== null || config.economics.maxStakePerWallet !== null || config.safety.cooldownSeconds !== null) {
    stops.push("lock/penalty/maxStake/cooldown must stay NONE");
  }

  const mainnet = FLOW_STAKING_CHAINS.find((c) => c.chainId === 677)!;
  if (mainnet.vault || mainnet.stakingEnabled || mainnet.token) stops.push("BOT Mainnet 677 staking config is no longer null/blocked");

  const sourcePath = join(ROOT, "FlowStakingVault.sol");
  const artifactPath = join(ROOT, "artifacts/FlowStakingVault.json");
  if (!existsSync(sourcePath) || !existsSync(artifactPath)) stops.push("FlowStakingVault source/artifact missing");
  const artifact = existsSync(artifactPath) ? JSON.parse(readFileSync(artifactPath, "utf8")) : null;
  if (artifact) {
    const c = artifact.compiler ?? {};
    if (!String(c.version ?? "").startsWith("0.8.24")) stops.push("compiler version != 0.8.24");
    if (c.optimizer && (c.optimizer.enabled !== true || c.optimizer.runs !== 200)) stops.push("optimizer != enabled/runs=200");
    if (c.evmVersion && c.evmVersion !== "paris") stops.push("evmVersion != paris");
  }

  const rpc = process.env["BOT_TESTNET_RPC_URL"];
  if (!rpc) stops.push("BOT_TESTNET_RPC_URL not configured");
  if (!process.env["DEPLOYER_PRIVATE_KEY"]) stops.push("DEPLOYER_PRIVATE_KEY (approved owner signer) unavailable");

  const treasuryKeyRaw = process.env["TREASURY_PRIVATE_KEY"] ?? process.env["FLOW_TREASURY_PRIVATE_KEY"];

  if (stops.length) {
    console.error("\nSTOP conditions:\n - " + stops.join("\n - "));
    console.log("\nFLOW STAKING V13.2 BOT TESTNET DEPLOYMENT BLOCKED");
    process.exit(1);
  }

  console.log("\nsource sha256:  ", sha256(sourcePath));
  console.log("artifact sha256:", sha256(artifactPath));

  const { createWalletClient, createPublicClient, http, defineChain, getAddress } = await import("viem");
  const { privateKeyToAccount } = await import("viem/accounts");
  const norm = (k: string) => (k.startsWith("0x") ? k : "0x" + k) as `0x${string}`;

  const chain = defineChain({
    id: APPROVED.chainId,
    name: "bot-testnet",
    nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
    rpcUrls: { default: { http: [rpc!] } },
  });
  const publicClient = createPublicClient({ chain, transport: http() });
  const liveChainId = await publicClient.getChainId();
  if (liveChainId !== APPROVED.chainId) {
    console.error(`STOP: RPC chainId ${liveChainId} != 968.`);
    console.log("\nFLOW STAKING V13.2 BOT TESTNET DEPLOYMENT BLOCKED");
    process.exit(1);
  }

  const ownerAccount = privateKeyToAccount(norm(process.env["DEPLOYER_PRIVATE_KEY"]!));
  if (lower(ownerAccount.address) !== lower(APPROVED.vaultOwner)) {
    console.error("STOP: deployer signer is not the approved vault owner.");
    console.log("\nFLOW STAKING V13.2 BOT TESTNET DEPLOYMENT BLOCKED");
    process.exit(1);
  }
  console.log("deployer/owner public address:", ownerAccount.address);

  const treasuryAccount = treasuryKeyRaw ? privateKeyToAccount(norm(treasuryKeyRaw)) : null;
  const treasurySigner =
    treasuryAccount && lower(treasuryAccount.address) === lower(APPROVED.rewardTreasury) ? treasuryAccount : null;
  console.log(
    "reward treasury signing path:",
    treasurySigner ? `AVAILABLE (${treasurySigner.address})` : "UNAVAILABLE — funding will be skipped",
  );

  if (!broadcast) {
    console.log("\nPreflight OK. Dry run only — pass --broadcast to deploy.");
    return;
  }

  const ownerWallet = createWalletClient({ account: ownerAccount, chain, transport: http() });

  // --- 1. deploy vault --------------------------------------------------
  const deployTx = await ownerWallet.deployContract({
    abi: artifact.abi,
    bytecode: (artifact.bytecode.object ?? artifact.bytecode) as `0x${string}`,
    args: [APPROVED.token, APPROVED.vaultOwner],
  });
  const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployTx });
  if (deployReceipt.status !== "success") throw new Error("STOP: FlowStakingVault deployment reverted.");
  const vault = getAddress(deployReceipt.contractAddress!);
  console.log("FlowStakingVault:", vault, "tx", deployTx);

  const read = (functionName: string, args: unknown[] = []) =>
    publicClient.readContract({ address: vault, abi: artifact.abi, functionName, args } as never) as Promise<unknown>;

  // --- 2. owner sets approved minimum stake ----------------------------
  const minStakeTx = await ownerWallet.writeContract({
    address: vault,
    abi: artifact.abi,
    functionName: "setMinStake",
    args: [APPROVED.minStake],
  });
  if ((await publicClient.waitForTransactionReceipt({ hash: minStakeTx })).status !== "success") {
    throw new Error("STOP: setMinStake reverted.");
  }

  // --- 3. treasury funds reward inventory ------------------------------
  let approveTxHash: string | null = null;
  let fundingTxHash: string | null = null;
  let unfundedReason: string | null = null;

  if (!treasurySigner) {
    unfundedReason =
      "UNFUNDED — the approved reward treasury cannot sign in this environment. Manual action: approve and fundRewards exactly 100,000 FLOW from the treasury to the vault above. Deployer substitution is forbidden.";
  } else {
    const treasuryWallet = createWalletClient({ account: treasurySigner, chain, transport: http() });
    const treasuryBalance = (await publicClient.readContract({
      address: APPROVED.token,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [treasurySigner.address],
    })) as bigint;
    if (treasuryBalance < APPROVED.rewardBudget) {
      unfundedReason = `UNFUNDED — treasury FLOW balance ${treasuryBalance} < 100,000 FLOW budget.`;
    } else {
      approveTxHash = await treasuryWallet.writeContract({
        address: APPROVED.token,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [vault, APPROVED.rewardBudget],
      });
      if ((await publicClient.waitForTransactionReceipt({ hash: approveTxHash as `0x${string}` })).status !== "success") {
        throw new Error("STOP: treasury FLOW approve reverted.");
      }
      fundingTxHash = await treasuryWallet.writeContract({
        address: vault,
        abi: artifact.abi,
        functionName: "fundRewards",
        args: [APPROVED.rewardBudget],
      });
      if ((await publicClient.waitForTransactionReceipt({ hash: fundingTxHash as `0x${string}` })).status !== "success") {
        throw new Error("STOP: fundRewards reverted.");
      }
    }
  }

  // --- 4. owner activates the single approved schedule ------------------
  let activationTxHash: string | null = null;
  let notActivatedReason: string | null = null;
  const uncommitted = (await read("uncommittedRewards")) as bigint;
  const inventory = (await read("rewardInventory")) as bigint;
  const staked = (await read("totalStaked")) as bigint;

  if (!fundingTxHash) {
    notActivatedReason = "NOT_ACTIVATED — reward inventory not funded by the approved treasury.";
  } else if (inventory !== APPROVED.rewardBudget || uncommitted < APPROVED.rewardBudget) {
    notActivatedReason = `NOT_ACTIVATED — live funding sufficiency failed (inventory ${inventory}, uncommitted ${uncommitted}).`;
  } else if (staked !== 0n) {
    notActivatedReason = "NOT_ACTIVATED — totalStaked is non-zero before the canary.";
  } else {
    activationTxHash = await ownerWallet.writeContract({
      address: vault,
      abi: artifact.abi,
      functionName: "activateSchedule",
      args: [APPROVED.rewardBudget, APPROVED.duration],
    });
    if ((await publicClient.waitForTransactionReceipt({ hash: activationTxHash as `0x${string}` })).status !== "success") {
      throw new Error("STOP: activateSchedule reverted.");
    }
  }

  // --- verification -----------------------------------------------------
  const live = {
    token: getAddress((await read("token")) as string),
    owner: getAddress((await read("owner")) as string),
    paused: (await read("paused")) as boolean,
    minStake: ((await read("minStake")) as bigint).toString(),
    maxStakePerWallet: ((await read("maxStakePerWallet")) as bigint).toString(),
    totalStaked: ((await read("totalStaked")) as bigint).toString(),
    rewardInventory: ((await read("rewardInventory")) as bigint).toString(),
    rewardCommitted: ((await read("rewardCommitted")) as bigint).toString(),
    uncommittedRewards: ((await read("uncommittedRewards")) as bigint).toString(),
    rewardRate: ((await read("rewardRate")) as bigint).toString(),
    periodFinish: ((await read("periodFinish")) as bigint).toString(),
    lastUpdateTime: ((await read("lastUpdateTime")) as bigint).toString(),
    scheduleActive: (await read("scheduleActive")) as boolean,
    runtimeCodeBytes: ((await publicClient.getCode({ address: vault })) ?? "0x").length / 2 - 1,
  };
  console.log("\nlive vault state:", JSON.stringify(live, null, 2));

  const checks: string[] = [];
  if (lower(live.token) !== lower(APPROVED.token)) checks.push("token binding mismatch");
  if (lower(live.owner) !== lower(APPROVED.vaultOwner)) checks.push("owner mismatch");
  if (live.minStake !== APPROVED.minStake.toString()) checks.push("minStake mismatch");
  if (live.maxStakePerWallet !== "0") checks.push("maxStakePerWallet must remain 0 (NONE)");
  if (live.paused) checks.push("vault must not be paused");
  if (live.runtimeCodeBytes <= 0) checks.push("no runtime bytecode at vault address");
  if (activationTxHash) {
    const expectedRate = APPROVED.rewardBudget / APPROVED.duration;
    if (live.rewardRate !== expectedRate.toString()) checks.push("reward rate != integer budget/duration");
    if (!live.scheduleActive) checks.push("schedule not active after activation");
  }
  if (checks.length) {
    console.error("\nVERIFICATION FAILURES:\n - " + checks.join("\n - "));
    console.log("\nFLOW STAKING V13.2 BOT TESTNET DEPLOYMENT BLOCKED");
    process.exit(1);
  }

  const manifest = {
    network: "bot-testnet",
    chainId: APPROVED.chainId,
    stakingPolicyVersion: config.stakingPolicyVersion,
    stakingLockVersion: config.stakingLockVersion,
    gate: "V13.2",
    flowStakingVault: {
      address: vault,
      token: APPROVED.token,
      owner: APPROVED.vaultOwner,
      rewardTreasury: APPROVED.rewardTreasury,
      deployTxHash: deployTx,
      minStakeTxHash: minStakeTx,
      treasuryApproveTxHash: approveTxHash ?? "NOT_SENT",
      fundingTxHash: fundingTxHash ?? "UNFUNDED",
      unfundedReason,
      activationTxHash: activationTxHash ?? "NOT_ACTIVATED",
      notActivatedReason,
      sourceSha256: sha256(sourcePath),
      artifactSha256: sha256(artifactPath),
      compiler: artifact.compiler,
      live,
    },
    deployer: ownerAccount.address,
    operations: {
      pause: "owner pause()/unpause() — blocks new stakes and reward claims only; withdraw() stays open",
      emergencyWithdraw: "ALWAYS_WITHDRAWABLE_PRINCIPAL — withdraw()/exit() available even while paused",
      rewardTopUp: "treasury approve + fundRewards(amount); activateSchedule only after the current period finishes",
    },
    deployedAt: new Date().toISOString(),
  };

  const manifestPath = join(ROOT, "deployments/staking-bot-testnet.json");
  if (existsSync(manifestPath)) {
    writeFileSync(join(ROOT, `deployments/staking-bot-testnet.${Date.now()}.json`), readFileSync(manifestPath));
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log("\nmanifest:", manifestPath);
  console.log(
    fundingTxHash && activationTxHash
      ? "\nFLOW STAKING V13.2 BOT TESTNET DEPLOYMENT PASS"
      : "\nFLOW STAKING V13.2 BOT TESTNET DEPLOYMENT UNFUNDED",
  );
}

void main();
