// Byte-exact rebuild: compiles the preserved Standard-JSON input VERBATIM with
// the pinned solc and checks the frozen deployment hashes. This is the
// authoritative local reproduction check.
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const solc = require("solc-0.8.24");

const input = readFileSync(path.join(__dirname, "..", "standard-input.json"), "utf8");
const out = JSON.parse(solc.compile(input));
const fatal = (out.errors || []).filter((e) => e.severity === "error");
if (fatal.length) {
  for (const e of fatal) console.error(e.formattedMessage || e.message);
  process.exit(1);
}
const artifact = out.contracts["FlowStakingVaultV2.sol"]["FlowStakingVaultV2"];
const h = (hex) => createHash("sha256").update(Buffer.from(hex.replace(/^0x/, ""), "hex")).digest("hex");
const creation = h(artifact.evm.bytecode.object);
const runtime = h(artifact.evm.deployedBytecode.object);
const expected = {
  creation: "159b884935907d9cf892a160a7bb7f671aad86ca5616c29acc15f6686e80e4f6",
  runtime: "af5ed43ffce266a56bcc8bffcd1b8d8067155a5716024cda089dac286294b7ce",
};
console.log("solc            ", solc.version());
console.log("creation sha256 ", creation, creation === expected.creation ? "MATCH" : "MISMATCH");
console.log("runtime  sha256 ", runtime, runtime === expected.runtime ? "MATCH" : "MISMATCH");
console.log("runtime  bytes  ", artifact.evm.deployedBytecode.object.length / 2, "expected 10366");
if (creation !== expected.creation || runtime !== expected.runtime) {
  process.exitCode = 1;
}
