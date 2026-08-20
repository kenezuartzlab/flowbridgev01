/**
 * FlowBridge V12.1 — offline deployment dry-run / parameter lock report.
 *
 * Broadcasts nothing and opens NO RPC connection. It re-derives the owner
 * approval table from contracts/config/bot-testnet.json and, only when every
 * parameter is APPROVED, runs the in-memory deployment + claim + replay
 * simulation and prints the unsigned deployment order.
 *
 * Usage: bun contracts/scripts/dryrun.bot-testnet.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildFlowDeploymentPlan } from "../../src/lib/rewards/flowDeploymentPlan";
import {
  balanceOf,
  simulateClaim,
  simulateDeployment,
  simulatedManifest,
} from "../../src/lib/rewards/flowDeploymentSimulation";
import { buildFlowClaimTypedData, type Hex } from "../../src/lib/rewards/flowClaimTypedData";

const ROOT = join(import.meta.dirname ?? ".", "..");
const CONFIG_PATH = "contracts/config/bot-testnet.json";
const config = JSON.parse(readFileSync(join(ROOT, "config/bot-testnet.json"), "utf8"));

async function main() {
  const plan = buildFlowDeploymentPlan(config, CONFIG_PATH);

  console.log("FlowBridge V12.1 — BOT Testnet parameter lock (no broadcast)\n");
  for (const v of plan.verdicts) {
    console.log(`${v.status.padEnd(8)} ${v.parameter.padEnd(36)} ${v.value ?? "-"}  [${v.source}]`);
  }

  if (!plan.ready) {
    console.log("\nBLOCKED parameters: " + plan.blocked.join(", "));
    console.log("Dry-run deployment proof NOT executed — no approved parameters to simulate.");
    console.log("\nFLOW REWARDS V12.1 PARAMETER LOCK BLOCKED");
    process.exit(1);
  }

  console.log("\nUnsigned deployment order:");
  console.log(JSON.stringify(plan.steps, null, 2));
  console.log("Post-deploy actions:\n - " + plan.postDeployActions.join("\n - "));

  const { privateKeyToAccount } = await import("viem/accounts");
  const { recoverTypedDataAddress } = await import("viem");
  const signerKey = process.env["FLOW_REWARD_SIGNER_PRIVATE_KEY"];
  if (!signerKey) throw new Error("FLOW_REWARD_SIGNER_PRIVATE_KEY required for the local claim simulation");
  const signer = privateKeyToAccount(signerKey as Hex);

  const deployment = simulateDeployment({
    chainId: config.chainId,
    token: {
      name: config.token.name,
      symbol: config.token.symbol,
      decimals: 18,
      totalSupply: BigInt(config.token.totalSupply),
      treasury: config.token.treasury,
    },
    distributor: {
      owner: config.distributor.owner,
      rewardSigner: signer.address as Hex,
      fundingAmount: BigInt(config.distributor.initialFundingAmount),
    },
    addresses: { token: `0x${"d".repeat(40)}` as Hex, distributor: `0x${"e".repeat(40)}` as Hex },
  });

  const account = `0x${"f".repeat(40)}` as Hex;
  const cumulative = BigInt(config.distributor.initialFundingAmount) / 10n;
  const deadline = BigInt(Math.floor(Date.now() / 1000) + config.claim.authorizationLifetimeSeconds);
  const typedData = buildFlowClaimTypedData({
    chainId: config.chainId,
    distributor: deployment.distributor.address,
    account,
    cumulativeEntitlement: cumulative,
    deadline,
  });
  const signature = (await signer.signTypedData(typedData as any)) as Hex;
  const recover = async ({ typedData: td, signature: sig }: any) =>
    (await recoverTypedDataAddress({ ...td, signature: sig })) as Hex;
  const now = BigInt(Math.floor(Date.now() / 1000));

  const first = await simulateClaim(deployment, {
    account,
    cumulativeEntitlement: cumulative,
    deadline,
    signature,
    now,
    recoverTypedDataAddress: recover,
  });
  const replay = await simulateClaim(deployment, {
    account,
    cumulativeEntitlement: cumulative,
    deadline,
    signature,
    now,
    recoverTypedDataAddress: recover,
  });

  console.log(
    "\nSIMULATED results:\n" +
      JSON.stringify(
        {
          treasuryBalance: balanceOf(deployment, config.token.treasury).toString(),
          claim: { ok: first.ok, delta: first.delta?.toString(), error: first.error },
          replay: { ok: replay.ok, error: replay.error },
          manifest: simulatedManifest(deployment, BigInt(config.distributor.initialFundingAmount)),
        },
        null,
        2,
      ),
  );

  if (!first.ok || replay.ok || replay.error !== "NothingToClaim") {
    console.error("Dry-run FAILED: claim/replay semantics did not hold.");
    console.log("\nFLOW REWARDS V12.1 PARAMETER LOCK BLOCKED");
    process.exit(1);
  }

  console.log("\nFLOW REWARDS V12.1 PARAMETER LOCK PASS");
}

void main();
