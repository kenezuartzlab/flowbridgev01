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
const artifact = out.contracts["FlowRewardsMerkleDistributor.sol"]["FlowRewardsMerkleDistributor"];
const h = (hex) => createHash("sha256").update(Buffer.from(hex.replace(/^0x/, ""), "hex")).digest("hex");
const creation = h(artifact.evm.bytecode.object);
const runtime = h(artifact.evm.deployedBytecode.object);
const expected = {
  creation: "21c96796f0e7fbc32ed114edf6194147ddb3949c88a9907d8cc28c9ed5157581",
  runtime: "a708b596b82367893813a4ed39650bcf26f95a23fad678955a4b938fca40d367",
};
console.log("solc            ", solc.version());
console.log("creation sha256 ", creation, creation === expected.creation ? "MATCH" : "MISMATCH");
console.log("runtime  sha256 ", runtime, runtime === expected.runtime ? "MATCH" : "MISMATCH");
console.log("runtime  bytes  ", artifact.evm.deployedBytecode.object.length / 2, "expected 5861");
if (creation !== expected.creation || runtime !== expected.runtime) process.exitCode = 1;
