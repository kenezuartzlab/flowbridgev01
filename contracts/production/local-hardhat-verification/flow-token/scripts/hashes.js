// Prove the local rebuild reproduces the frozen deployment artifact.
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const artifact = JSON.parse(
  readFileSync(
    path.join(
      __dirname,
      "..",
      "artifacts",
      "FlowToken.sol",
      "FlowToken.json",
    ),
    "utf8",
  ),
);
const h = (hex) => createHash("sha256").update(Buffer.from(hex.replace(/^0x/, ""), "hex")).digest("hex");
const creation = h(artifact.bytecode);
const runtime = h(artifact.deployedBytecode);
const expected = {
  creation: "200a6a559c6e43a357f7b7fb677a1d7a4e1d89344fd78bcc34398265fa2107a2",
  runtime: "f7be82e4d98df2b7ab421ae8ec4b1d2ea1b0fd124b7865aaaad5e77656226edf",
};
console.log("creation sha256", creation, creation === expected.creation ? "MATCH" : "MISMATCH");
console.log("runtime  sha256", runtime, runtime === expected.runtime ? "MATCH" : "MISMATCH");
console.log("runtime  bytes ", (artifact.deployedBytecode.length - 2) / 2, "expected 3539");
if (creation !== expected.creation || runtime !== expected.runtime) process.exitCode = 1;
