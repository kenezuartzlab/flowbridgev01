import fs from "node:fs";
import path from "node:path";

function walk(root, out = []) {
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const p = path.join(root, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name.endsWith(".json") && !entry.name.endsWith(".dbg.json")) out.push(p);
  }
  return out;
}

function artifact() {
  const matches = walk(path.resolve("artifacts")).filter((p) => {
    try {
      const j = JSON.parse(fs.readFileSync(p, "utf8"));
      return j.contractName === "FlowBridgeActivityRegistry" && Array.isArray(j.abi);
    } catch {
      return false;
    }
  });
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one FlowBridgeActivityRegistry artifact, found ${matches.length}`);
  }
  return JSON.parse(fs.readFileSync(matches[0], "utf8"));
}

const a = artifact();
const abi = a.abi;
const event = abi.find((x) => x.type === "event" && x.name === "ActivityRecorded");
if (!event) throw new Error("ActivityRecorded event missing");

const expectedEvent = [
  ["activityId", "bytes32", true],
  ["user", "address", true],
  ["actionType", "bytes32", true],
  ["sourceChainId", "uint256", false],
  ["sourceTxHash", "bytes32", false],
  ["sourceLogIndex", "uint256", false],
  ["amount", "uint256", false],
  ["campaignId", "bytes32", false],
  ["intentHash", "bytes32", false],
  ["observedAt", "uint64", false],
];

if (event.inputs.length !== expectedEvent.length) throw new Error("ActivityRecorded input count mismatch");
for (let i = 0; i < expectedEvent.length; i++) {
  const [name, type, indexed] = expectedEvent[i];
  const got = event.inputs[i];
  if (got.name !== name || got.type !== type || Boolean(got.indexed) !== indexed) {
    throw new Error(`ActivityRecorded[${i}] mismatch: expected ${name}:${type}:indexed=${indexed}, got ${got.name}:${got.type}:indexed=${got.indexed}`);
  }
}

const functions = abi.filter((x) => x.type === "function");
const stateChanging = functions
  .filter((x) => x.stateMutability !== "view" && x.stateMutability !== "pure")
  .map((x) => x.name)
  .sort();
const allowedMutating = new Set(["grantRole", "pause", "recordActivity", "renounceRole", "revokeRole", "unpause"]);
for (const name of stateChanging) {
  if (!allowedMutating.has(name)) throw new Error(`Unexpected state-changing function: ${name}`);
}

const forbiddenFragments = ["transfer", "withdraw", "sweep", "claim", "reward", "mint", "burn", "delegate", "execute", "rescue"];
for (const fn of functions) {
  const lower = fn.name.toLowerCase();
  if (forbiddenFragments.some((frag) => lower.includes(frag))) {
    throw new Error(`Forbidden/custodial-looking function surfaced: ${fn.name}`);
  }
}

const receiveOrFallback = abi.filter((x) => x.type === "receive" || x.type === "fallback");
if (receiveOrFallback.length) throw new Error("Unexpected receive/fallback ABI entry");

console.log("PASS: FlowBridgeActivityRegistry ABI/event surface matches A3A policy");
console.log("State-changing functions:", stateChanging.join(", "));
console.log("ActivityRecorded sourceLogIndex type: uint256 (A2.1 parity)");
