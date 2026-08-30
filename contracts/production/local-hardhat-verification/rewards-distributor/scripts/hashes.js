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
      "contracts",
      "FlowRewardsMerkleDistributor.sol",
      "FlowRewardsMerkleDistributor.json",
    ),
    "utf8",
  ),
);
const h = (hex) => createHash("sha256").update(Buffer.from(hex.replace(/^0x/, ""), "hex")).digest("hex");
const creation = h(artifact.bytecode);
const runtime = h(artifact.deployedBytecode);
const expected = {
  creation: "21c96796f0e7fbc32ed114edf6194147ddb3949c88a9907d8cc28c9ed5157581",
  runtime: "a708b596b82367893813a4ed39650bcf26f95a23fad678955a4b938fca40d367",
};
console.log("creation sha256", creation, creation === expected.creation ? "MATCH" : "MISMATCH");
console.log("runtime  sha256", runtime, runtime === expected.runtime ? "MATCH" : "MISMATCH");
console.log("runtime  bytes ", (artifact.deployedBytecode.length - 2) / 2, "expected 5861");
if (creation !== expected.creation || runtime !== expected.runtime) process.exitCode = 1;
