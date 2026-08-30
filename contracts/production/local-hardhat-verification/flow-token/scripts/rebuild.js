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
const artifact = out.contracts["FlowToken.sol"]["FlowToken"];
const h = (hex) => createHash("sha256").update(Buffer.from(hex.replace(/^0x/, ""), "hex")).digest("hex");
const creation = h(artifact.evm.bytecode.object);
const runtime = h(artifact.evm.deployedBytecode.object);
const expected = {
  creation: "200a6a559c6e43a357f7b7fb677a1d7a4e1d89344fd78bcc34398265fa2107a2",
  runtime: "f7be82e4d98df2b7ab421ae8ec4b1d2ea1b0fd124b7865aaaad5e77656226edf",
};
console.log("solc            ", solc.version());
console.log("creation sha256 ", creation, creation === expected.creation ? "MATCH" : "MISMATCH");
console.log("runtime  sha256 ", runtime, runtime === expected.runtime ? "MATCH" : "MISMATCH");
console.log("runtime  bytes  ", artifact.evm.deployedBytecode.object.length / 2, "expected 3539");
if (creation !== expected.creation || runtime !== expected.runtime) {
  process.exitCode = 1;
}
