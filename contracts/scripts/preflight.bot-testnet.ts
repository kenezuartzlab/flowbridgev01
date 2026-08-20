/**
 * FlowBridge V12.2 — BOT Testnet pre-broadcast hard gate. Broadcasts NOTHING.
 *
 * Usage: bun contracts/scripts/preflight.bot-testnet.ts
 *
 * Verdict PASS means: the committed config equals the owner-approved V12.2
 * values, the V12.1 parameter lock returns ready, BOT Mainnet is still fully
 * unapproved, and every broadcast prerequisite (RPC chainId 968, deployer key,
 * compiled artifacts, reward-signer secret) is present. Anything missing is
 * reported as a STOP reason; no transaction may then be prepared.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildFlowDeploymentPlan } from "../../src/lib/rewards/flowDeploymentPlan";
import {
  APPROVED_BOT_TESTNET,
  diffAgainstApprovedTestnet,
  mainnetStillBlocked,
} from "../../src/lib/rewards/flowApprovedTestnetPolicy";

const ROOT = join(import.meta.dirname ?? ".", "..");
const CONFIG_PATH = "contracts/config/bot-testnet.json";
const config = JSON.parse(readFileSync(join(ROOT, "config/bot-testnet.json"), "utf8"));
const mainnet = JSON.parse(readFileSync(join(ROOT, "config/bot-mainnet.json"), "utf8"));

async function main() {
  const stops: string[] = [];
  const notes: string[] = [];

  const plan = buildFlowDeploymentPlan(config, CONFIG_PATH);
  for (const v of plan.verdicts) {
    console.log(`${v.status.padEnd(8)} ${v.parameter.padEnd(36)} ${v.value ?? "-"}`);
  }
  if (!plan.ready) stops.push("Parameter lock BLOCKED: " + plan.blocked.join(", "));

  const diffs = diffAgainstApprovedTestnet(config);
  if (diffs.length) stops.push("Config differs from owner-approved V12.2 values: " + diffs.join("; "));

  if (!mainnetStillBlocked(mainnet)) stops.push("BOT Mainnet 677 config is no longer fully unapproved.");

  // Broadcast prerequisites.
  const rpc = process.env["BOT_TESTNET_RPC_URL"];
  if (!rpc) stops.push("BOT_TESTNET_RPC_URL is not configured in this environment.");
  if (!process.env["DEPLOYER_PRIVATE_KEY"]) {
    stops.push("DEPLOYER_PRIVATE_KEY is not available to this environment.");
  }

  const tokenArtifact = join(ROOT, "artifacts/FlowToken.json");
  const distArtifact = join(ROOT, "artifacts/FlowRewardsDistributor.json");
  if (!existsSync(tokenArtifact) || !existsSync(distArtifact)) {
    stops.push("Compiled artifacts missing (contracts/artifacts/*.json) — no solc/foundry toolchain available here.");
  }

  const signerKey = process.env["FLOW_REWARD_SIGNER_PRIVATE_KEY"];
  if (!signerKey) {
    notes.push("SIGNER_SECRET_CONFIGURATION_REQUIRED — reward signer secret absent; claim authority stays disabled.");
  } else {
    const { privateKeyToAccount } = await import("viem/accounts");
    const derived = privateKeyToAccount(signerKey as `0x${string}`).address;
    if (derived.toLowerCase() !== APPROVED_BOT_TESTNET.distributor.rewardSigner.toLowerCase()) {
      stops.push("Reward signer secret derives to a different address than the approved reward signer.");
    } else {
      notes.push("Reward signer secret derives to the approved reward-signer address (READY).");
    }
  }

  if (rpc) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      const json: any = await res.json();
      const chainId = Number(BigInt(json.result));
      if (chainId !== APPROVED_BOT_TESTNET.chainId) stops.push(`RPC chainId ${chainId} != 968.`);
      else notes.push("RPC chainId = 968.");
    } catch (e: any) {
      stops.push("RPC chainId probe failed: " + (e?.message ?? "unknown error"));
    }
  }

  console.log("\nNotes:\n - " + (notes.length ? notes.join("\n - ") : "none"));
  if (stops.length) {
    console.error("\nSTOP conditions:\n - " + stops.join("\n - "));
    console.log("\nFLOW REWARDS V12.2 BOT TESTNET DEPLOYMENT BLOCKED");
    process.exit(1);
  }
  console.log("\nPREFLIGHT PASS — deployment may be prepared with --broadcast.");
}

void main();
