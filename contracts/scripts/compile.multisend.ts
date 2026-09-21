/** Compile FlowBridgeMultiSend with pinned solc 0.8.20. No network access or writes. */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const REPO = resolve(join(import.meta.dirname ?? ".", "../.."));
const PACKAGE = join(REPO, "contracts/production/multisend-v1");
const SOURCE = "FlowBridgeMultiSend.sol";
const sourcePath = join(PACKAGE, SOURCE);

function readImport(path: string): { contents: string } | { error: string } {
  const candidates = [join(PACKAGE, path), join(REPO, "node_modules", path)];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return { contents: readFileSync(candidate, "utf8") };
  }
  return { error: `not found: ${path}` };
}

const solc = require("solc-0.8.20");
const input = {
  language: "Solidity",
  sources: { [SOURCE]: { content: readFileSync(sourcePath, "utf8") } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "shanghai",
    metadata: { bytecodeHash: "ipfs" },
    outputSelection: {
      "*": { "*": ["abi", "metadata", "evm.bytecode.object", "evm.deployedBytecode.object"] },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: readImport }));
for (const issue of output.errors ?? []) {
  console.log(`${issue.severity}: ${issue.formattedMessage?.trim() ?? issue.message}`);
}
if ((output.errors ?? []).some((issue: { severity: string }) => issue.severity === "error")) {
  throw new Error("MULTISEND_BUILD_BLOCKED");
}

const compiled = output.contracts?.[SOURCE]?.FlowBridgeMultiSend;
if (!compiled) throw new Error("FlowBridgeMultiSend missing from compiler output");
const bytecode = `0x${compiled.evm.bytecode.object}`;
const deployedBytecode = `0x${compiled.evm.deployedBytecode.object}`;
const runtimeBytes = (deployedBytecode.length - 2) / 2;
const eip170Limit = 24_576;
if (runtimeBytes >= eip170Limit) throw new Error(`EIP_170_LIMIT_EXCEEDED:${runtimeBytes}`);

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const artifact = {
  contractName: "FlowBridgeMultiSend",
  compiler: { version: "0.8.20", optimizer: { enabled: true, runs: 200 }, evmVersion: "shanghai" },
  sourceSha256: sha256(readFileSync(sourcePath)),
  abiSha256: sha256(JSON.stringify(compiled.abi)),
  creationBytecodeSha256: sha256(bytecode),
  runtimeBytecodeSha256: sha256(deployedBytecode),
  runtimeBytes,
  eip170HeadroomBytes: eip170Limit - runtimeBytes,
  abi: compiled.abi,
  bytecode: { object: bytecode },
  deployedBytecode: { object: deployedBytecode },
};
const artifactPath = join(PACKAGE, "artifacts/FlowBridgeMultiSend.json");
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(artifactPath, JSON.stringify(artifact, null, 2) + "\n");

const standardInputPath = join(PACKAGE, "verification/standard-input.json");
mkdirSync(dirname(standardInputPath), { recursive: true });
writeFileSync(standardInputPath, JSON.stringify(input, null, 2) + "\n");
console.log(JSON.stringify({ artifactPath, standardInputPath, runtimeBytes, eip170HeadroomBytes: eip170Limit - runtimeBytes, sourceSha256: artifact.sourceSha256, abiSha256: artifact.abiSha256, creationBytecodeSha256: artifact.creationBytecodeSha256 }, null, 2));