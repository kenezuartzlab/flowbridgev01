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
      "FlowBridgeActivityRegistry.sol",
      "FlowBridgeActivityRegistry.json",
    ),
    "utf8",
  ),
);
const h = (hex) => createHash("sha256").update(Buffer.from(hex.replace(/^0x/, ""), "hex")).digest("hex");
const creation = h(artifact.bytecode);
const runtime = h(artifact.deployedBytecode);
const expected = {
  creation: "25ec99e2bc31648d9e0cb2376c00063c404d2b535afe887f1b9cb37ebfc2cc6d",
  runtime: "53a83eea932da41016a7021926113e4ed50612525768bb6ba0eb1ec876b3e03b",
};
console.log("creation sha256", creation, creation === expected.creation ? "MATCH" : "MISMATCH");
console.log("runtime  sha256", runtime, runtime === expected.runtime ? "MATCH" : "MISMATCH");
console.log("runtime  bytes ", (artifact.deployedBytecode.length - 2) / 2, "expected 2713");
if (creation !== expected.creation || runtime !== expected.runtime) process.exitCode = 1;
