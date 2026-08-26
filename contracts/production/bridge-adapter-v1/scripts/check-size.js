import fs from "node:fs";

const artifactPath = "./artifacts/contracts/FlowBridgeRouterV4.sol/FlowBridgeRouterV4.json";
if (!fs.existsSync(artifactPath)) {
  console.error("Artifact not found. Run: npm run compile");
  process.exit(1);
}

const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
const deployedBytecode = artifact.deployedBytecode ?? "0x";
const creationBytecode = artifact.bytecode ?? "0x";
const runtimeBytes = Math.max(0, (deployedBytecode.length - 2) / 2);
const creationBytes = Math.max(0, (creationBytecode.length - 2) / 2);
const eip170 = 24_576;

console.log(`Creation bytecode: ${creationBytes.toLocaleString()} bytes`);
console.log(`Runtime bytecode:  ${runtimeBytes.toLocaleString()} bytes`);
console.log(`EIP-170 limit:      ${eip170.toLocaleString()} bytes`);

if (runtimeBytes > eip170) {
  console.error("\nSTOP: Runtime bytecode exceeds the EIP-170 24,576-byte limit.");
  console.error("Do not deploy until the contract is reduced/refactored.");
  process.exit(2);
}

console.log(`\nPASS: ${(eip170 - runtimeBytes).toLocaleString()} bytes below the EIP-170 limit.`);
