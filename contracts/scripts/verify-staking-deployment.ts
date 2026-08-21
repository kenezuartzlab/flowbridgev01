/**
 * FlowBridge V13 — post-deploy verification for FlowStakingVault. READ ONLY.
 *
 * Usage: bun contracts/scripts/verify-staking-deployment.ts
 *
 * Reads contracts/deployments/staking-bot-testnet.json (absent in V13) and
 * checks the deployed vault against chain truth: token binding, owner, pause
 * state, totalStaked, rewardInventory and the active schedule. Never signs.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(join(import.meta.dirname ?? ".", ".."));
const manifestPath = join(ROOT, "deployments/staking-bot-testnet.json");

if (!existsSync(manifestPath)) {
  console.log("No staking deployment manifest found (contracts/deployments/staking-bot-testnet.json).");
  console.log("V13 is a build gate — nothing was deployed. Nothing to verify.");
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const rpc = process.env["BOT_TESTNET_RPC_URL"] || "https://rpc.bohr.life";
const vault: string | null = manifest?.flowStakingVault?.address ?? null;
if (!vault) {
  console.error("Manifest has no vault address.");
  process.exit(1);
}

const SELECTORS = {
  token: "0xfc0c546a",
  owner: "0x8da5cb5b",
  paused: "0x5c975abb",
  totalStaked: "0x817b1cd2",
  rewardInventory: "0x7e7ae4aa",
  rewardRate: "0x7b0a47ee",
  periodFinish: "0xebe2b12b",
} as const;

async function call(to: string, data: string): Promise<string> {
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
  });
  const json: any = await res.json();
  if (json?.error || typeof json?.result !== "string") throw new Error("RPC_CALL_FAILED");
  return json.result;
}

const asAddress = (hex: string) => "0x" + hex.slice(-40);

const out: Record<string, string> = {};
for (const [name, selector] of Object.entries(SELECTORS)) {
  try {
    const raw = await call(vault, selector);
    out[name] =
      name === "token" || name === "owner"
        ? asAddress(raw)
        : name === "paused"
          ? String(BigInt(raw) === 1n)
          : BigInt(raw === "0x" ? "0x0" : raw).toString();
  } catch (e: any) {
    out[name] = "READ_FAILED: " + (e?.message ?? "unknown");
  }
}
console.log(JSON.stringify({ vault, chainState: out, manifest: manifest.flowStakingVault }, null, 2));

const tokenMatches =
  typeof out["token"] === "string" &&
  out["token"].toLowerCase() === String(manifest.flowStakingVault.token).toLowerCase();
console.log(tokenMatches ? "\nToken binding OK." : "\nSTOP: vault token does not match the approved FLOW token.");
