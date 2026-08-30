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
      "FlowStakingVaultV2.sol",
      "FlowStakingVaultV2.json",
    ),
    "utf8",
  ),
);
const h = (hex) => createHash("sha256").update(Buffer.from(hex.replace(/^0x/, ""), "hex")).digest("hex");
const creation = h(artifact.bytecode);
const runtime = h(artifact.deployedBytecode);
const expected = {
  creation: "159b884935907d9cf892a160a7bb7f671aad86ca5616c29acc15f6686e80e4f6",
  runtime: "af5ed43ffce266a56bcc8bffcd1b8d8067155a5716024cda089dac286294b7ce",
};
console.log("creation sha256", creation, creation === expected.creation ? "MATCH" : "MISMATCH");
console.log("runtime  sha256", runtime, runtime === expected.runtime ? "MATCH" : "MISMATCH");
console.log("runtime  bytes ", (artifact.deployedBytecode.length - 2) / 2, "expected 10366");
if (creation !== expected.creation || runtime !== expected.runtime) process.exitCode = 1;
