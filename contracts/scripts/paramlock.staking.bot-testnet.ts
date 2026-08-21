/**
 * FlowBridge V13.1 — FLOW staking OWNER PARAMETER LOCK + local dry-run.
 *
 * Broadcasts nothing, signs nothing, touches no network.
 *
 *  1. Prints the owner-approval table from the canonical BOT Testnet config.
 *  2. Prints source/artifact/compiler hashes.
 *  3. If any mandatory parameter is unapproved, REFUSES to simulate a
 *     production-shaped deployment and exits with PARAMETER LOCK BLOCKED.
 *  4. If everything is approved, runs a full local dry-run against the
 *     reference simulator (fund -> activate -> two stakers -> accrual ->
 *     claim -> partial/full unstake -> schedule end -> replay) and asserts the
 *     V13.1 invariants.
 *
 * Usage: bun contracts/scripts/paramlock.staking.bot-testnet.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { buildFlowStakingLockReport } from "../../src/lib/staking/flowStakingLock";
import { FlowStakingVaultSim } from "../../src/lib/staking/flowStakingVaultSim";
import { FLOW_STAKING_CHAINS } from "../../src/lib/staking/flowStakingRegistry";

const ROOT = resolve(join(import.meta.dirname ?? ".", ".."));
const CONFIG_PATH = "contracts/config/staking-bot-testnet.json";
const config = JSON.parse(readFileSync(join(ROOT, "config/staking-bot-testnet.json"), "utf8"));
const report = buildFlowStakingLockReport(config, CONFIG_PATH);

console.log("FlowBridge V13.1 — FLOW staking owner parameter lock\n");
console.log("STATUS      PARAMETER                          VALUE");
for (const v of report.verdicts) {
  console.log(`${v.status.padEnd(11)} ${v.parameter.padEnd(34)} ${v.value ?? "-"}`);
}

const sourcePath = join(ROOT, "FlowStakingVault.sol");
const artifactPath = join(ROOT, "artifacts/FlowStakingVault.json");
const sha = (p: string) => (existsSync(p) ? createHash("sha256").update(readFileSync(p)).digest("hex") : "-");
console.log("\nsource   contracts/FlowStakingVault.sol sha256:", sha(sourcePath));
console.log("artifact contracts/artifacts/FlowStakingVault.json sha256:", sha(artifactPath));
console.log("compiler: solc 0.8.24, optimizer runs=200, evmVersion=paris");

console.log("\nFunding solvency:", JSON.stringify(report.solvency));

const testnet = FLOW_STAKING_CHAINS.find((c) => c.chainId === 968)!;
console.log(
  `registry: chain 968 vault=${testnet.vault ?? "null"} stakingEnabled=${testnet.stakingEnabled} (read-only preview)`,
);

if (!report.parameterLockPass) {
  console.log("\nMandatory owner decisions still missing:\n - " + report.blocked.join("\n - "));
  console.log("\nRefusing to simulate a production-shaped deployment.");
  console.log("No transaction was prepared, signed or broadcast.");
  console.log("\nFLOW STAKING V13.1 PARAMETER LOCK BLOCKED");
  process.exit(0);
}

// ------------------------------------------------------- approved local dry-run
const owner = String(config.vaultOwner);
const treasury = String(config.rewardTreasury);
const budget = BigInt(report.solvency.budget!);
const duration = BigInt(report.solvency.durationSeconds!);
const minStake = BigInt(String(config.economics.minStake));

const sim = new FlowStakingVaultSim({ token: String(config.token), owner, startTime: 1_700_000_000n });
const A = "0x00000000000000000000000000000000000000A1";
const B = "0x00000000000000000000000000000000000000B2";
const stakeA = minStake > 0n ? minStake * 2n : 1000n * 10n ** 18n;
const stakeB = stakeA / 2n > (minStake || 1n) ? stakeA / 2n : stakeA;

sim.credit(treasury, budget);
sim.credit(A, stakeA);
sim.credit(B, stakeB);

const fails: string[] = [];
const assert = (label: string, ok: boolean) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) fails.push(label);
};

sim.setMinStake(owner, minStake);
if (config.economics.maxStakePerWallet) sim.setMaxStakePerWallet(owner, BigInt(String(config.economics.maxStakePerWallet)));

sim.fundRewards(treasury, budget);
assert("reward inventory funded separately from principal", sim.rewardInventory === budget && sim.totalStaked === 0n);
sim.activateSchedule(owner, budget, duration);
assert("schedule requires full pre-funding", sim.rewardInventory >= sim.rewardCommitted);

sim.stake(A, stakeA);
sim.warp(duration / 2n);
sim.stake(B, stakeB); // mid-schedule entrant
const earnedBAtEntry = sim.earned(B);
assert("mid-schedule entrant starts with zero accrual", earnedBAtEntry === 0n);

sim.warp(duration / 4n);
assert("earlier staker accrued more than later staker", sim.earned(A) > sim.earned(B));

const invBefore = sim.rewardInventory;
const principalBefore = sim.totalStaked;
const claimed = sim.claimReward(A);
assert("claim reduces reward inventory only", sim.rewardInventory === invBefore - claimed && sim.totalStaked === principalBefore);

sim.withdraw(A, stakeA / 2n);
assert("partial unstake returns exact principal", sim.balanceOf(A) === stakeA - stakeA / 2n);

sim.pause(owner);
let trapped = false;
try {
  sim.withdraw(B, stakeB);
} catch {
  trapped = true;
}
assert("paused vault still returns principal (no trapped funds)", !trapped && sim.balanceOf(B) === 0n);
sim.unpause(owner);

sim.warp(duration);
const finalA = sim.earned(A);
sim.warp(duration);
assert("no accrual after the funded period ends", sim.earned(A) === finalA);
assert("total emission never exceeds the funded budget", sim.rewardCommitted <= sim.rewardInventory);
assert("solvency + principal accounting invariants hold", sim.checkInvariants().length === 0);

console.log("\nNo transaction was prepared, signed or broadcast.");
if (fails.length) {
  console.log("\nFailed assertions:\n - " + fails.join("\n - "));
  console.log("\nFLOW STAKING V13.1 PARAMETER LOCK BLOCKED");
  process.exit(1);
}
console.log("\nFLOW STAKING V13.1 PARAMETER LOCK PASS");
