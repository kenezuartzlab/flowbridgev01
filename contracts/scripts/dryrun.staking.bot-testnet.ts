/**
 * FlowBridge V13 — FlowStakingVault BOT Testnet DRY RUN. Broadcasts nothing.
 *
 * Reports the owner-gated parameter verdicts, the exact unsigned deployment
 * step it WOULD execute once the owner approves, and refuses to declare
 * readiness while any required approval is missing.
 *
 * Usage: bun contracts/scripts/dryrun.staking.bot-testnet.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { buildFlowStakingPolicyReport } from "../../src/lib/staking/flowStakingPolicy";
import { FLOW_STAKING_CHAINS } from "../../src/lib/staking/flowStakingRegistry";

const ROOT = resolve(join(import.meta.dirname ?? ".", ".."));
const CONFIG_PATH = "contracts/config/staking-bot-testnet.json";
const config = JSON.parse(readFileSync(join(ROOT, "config/staking-bot-testnet.json"), "utf8"));

const report = buildFlowStakingPolicyReport(config, CONFIG_PATH);
for (const v of report.verdicts) {
  console.log(`${v.status.padEnd(11)} ${v.parameter.padEnd(34)} ${v.value ?? "-"}`);
}

const sourcePath = join(ROOT, "FlowStakingVault.sol");
const artifactPath = join(ROOT, "artifacts/FlowStakingVault.json");
const stops: string[] = [];
if (!existsSync(artifactPath)) stops.push("Compiled artifact missing — run contracts/scripts/compile.staking.ts.");
if (report.unapproved.length) stops.push("Owner approval missing: " + report.unapproved.join(", "));

const testnet = FLOW_STAKING_CHAINS.find((c) => c.chainId === 968)!;
if (testnet.vault) stops.push("Registry already lists a vault address — V13 must not deploy.");

console.log("\nsource sha256:", existsSync(sourcePath) ? createHash("sha256").update(readFileSync(sourcePath)).digest("hex") : "-");
console.log("artifact sha256:", existsSync(artifactPath) ? createHash("sha256").update(readFileSync(artifactPath)).digest("hex") : "-");

console.log("\nUnsigned deployment step (NOT broadcast):");
console.log(
  JSON.stringify(
    {
      order: 1,
      contract: "FlowStakingVault",
      constructorArgs: [config.token, config.vaultOwner ?? "OWNER_APPROVAL_REQUIRED"],
      postDeploy: [
        "fundRewards(rewardBudget) from the approved treasury (owner-approved amount only)",
        "activateSchedule(budget, durationSeconds) once fully funded and owner-approved",
        "record vault address + hashes into contracts/deployments/staking-bot-testnet.json",
      ],
    },
    null,
    2,
  ),
);

console.log("\nNo transaction was prepared, signed or broadcast.");
if (stops.length) {
  console.log("\nSTOP conditions:\n - " + stops.join("\n - "));
  console.log("\nFLOW STAKING V13 DRY RUN: DEPLOYMENT BLOCKED (expected in a build gate)");
  process.exit(0);
}
console.log("\nFLOW STAKING V13 DRY RUN: parameters approved — deployment may be prepared in a later gate.");
