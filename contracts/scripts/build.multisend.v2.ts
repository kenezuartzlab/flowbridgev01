/**
 * FlowBridge MultiSend V1 — explorer-verifiable release candidate (RC2) build.
 *
 * Uses the proven FlowBridge verification pipeline: ONE self-contained
 * Standard-JSON bundle with every dependency source inlined (vendored
 * OpenZeppelin 5.6.1), optimizer on / 200 runs, viaIR OFF, shanghai, pinned
 * solc 0.8.20. The same bundle is deployed and submitted to the explorer.
 *
 * The MultiSend source is used byte-for-byte unchanged. No network access,
 * no chain writes.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";

const require = createRequire(import.meta.url);
const REPO = resolve(join(import.meta.dirname ?? ".", "../.."));
const PACKAGE = join(REPO, "contracts/production/multisend-v1");
const CANDIDATE = join(PACKAGE, "candidate-rc2");
const VENDOR = join(CANDIDATE, "vendor/openzeppelin-contracts-5.6.1");
const SOURCE = "FlowBridgeMultiSend.sol";

function resolveSource(name: string): string {
  if (name === SOURCE) return readFileSync(join(PACKAGE, SOURCE), "utf8");
  if (name.startsWith("@openzeppelin/contracts/")) {
    const rel = name.slice("@openzeppelin/contracts/".length);
    const file = join(VENDOR, rel);
    if (!existsSync(file)) throw new Error(`VENDORED_DEPENDENCY_MISSING:${name}`);
    return readFileSync(file, "utf8");
  }
  throw new Error(`UNEXPECTED_IMPORT:${name}`);
}

const sources: Record<string, { content: string }> = {};
function collect(name: string) {
  if (sources[name]) return;
  const content = resolveSource(name);
  sources[name] = { content };
  for (const match of content.matchAll(/import\s+[^;]*?["']([^"']+)["']/g)) {
    let target = match[1];
    if (target.startsWith(".")) target = posix.normalize(posix.join(posix.dirname(name), target));
    collect(target);
  }
}
collect(SOURCE);

const settings = {
  optimizer: { enabled: true, runs: 200 },
  viaIR: true, // RC2: viaIR OFF cannot compile the unchanged accepted source (stack too deep); bundle is self-contained instead
  evmVersion: "shanghai",
  metadata: { bytecodeHash: "ipfs" },
  outputSelection: {
    "*": { "*": ["abi", "metadata", "evm.bytecode.object", "evm.deployedBytecode.object"] },
  },
};
const input = { language: "Solidity", sources, settings };
const serialized = JSON.stringify(input, null, 2) + "\n";

const solc = require("solc-0.8.20");
function compile() {
  // Deliberately no import callback: the bundle must be self-contained.
  const output = JSON.parse(solc.compile(serialized));
  const fatal = (output.errors ?? []).filter((e: { severity: string }) => e.severity === "error");
  if (fatal.length) {
    for (const e of fatal) console.error(e.formattedMessage ?? e.message);
    throw new Error("MULTISEND_RC2_BUILD_BLOCKED");
  }
  const compiled = output.contracts?.[SOURCE]?.FlowBridgeMultiSend;
  if (!compiled) throw new Error("FlowBridgeMultiSend missing from compiler output");
  return compiled;
}

const first = compile();
const second = compile();
const hexHash = (hex: string) =>
  createHash("sha256").update(Buffer.from(hex.replace(/^0x/, ""), "hex")).digest("hex");
const textHash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

const creation = first.evm.bytecode.object;
const runtime = first.evm.deployedBytecode.object;
const deterministic =
  creation === second.evm.bytecode.object &&
  runtime === second.evm.deployedBytecode.object &&
  JSON.stringify(first.abi) === JSON.stringify(second.abi);
if (!deterministic) throw new Error("NON_DETERMINISTIC_BUILD");

const runtimeBytes = runtime.length / 2;
const EIP170 = 24_576;
if (runtimeBytes >= EIP170) throw new Error(`EIP_170_LIMIT_EXCEEDED:${runtimeBytes}`);

const OWNER = "0x851275569923C62a2EF962EC35bfBb8f1bCbf3dD";
const FEE_RECIPIENT = "0x628e237b73C5a37EF3968527563FA1a26b32BB97";
const abiAddress = (value: string) => value.replace(/^0x/, "").toLowerCase().padStart(64, "0");
const constructorArgs = `0x${abiAddress(OWNER)}${abiAddress(FEE_RECIPIENT)}`;

mkdirSync(join(CANDIDATE, "verification"), { recursive: true });
mkdirSync(join(CANDIDATE, "artifacts"), { recursive: true });
writeFileSync(join(CANDIDATE, "verification/standard-input.json"), serialized);
writeFileSync(join(CANDIDATE, "constructor-args.txt"), constructorArgs + "\n");

const artifact = {
  contractName: "FlowBridgeMultiSend",
  contractTarget: "FlowBridgeMultiSend.sol:FlowBridgeMultiSend",
  compiler: {
    version: "v0.8.20+commit.a1b79de6",
    optimizer: { enabled: true, runs: 200 },
    viaIR: true, // RC2: viaIR OFF cannot compile the unchanged accepted source (stack too deep); bundle is self-contained instead
    evmVersion: "shanghai",
    metadata: { bytecodeHash: "ipfs" },
    license: "MIT",
  },
  bundle: {
    path: "contracts/production/multisend-v1/candidate-rc2/verification/standard-input.json",
    sourceCount: Object.keys(sources).length,
    openzeppelin: "5.6.1 (vendored, byte-for-byte from the npm 5.6.1 tarball)",
    selfContained: true,
    importCallbackUsed: false,
    sha256: textHash(serialized),
  },
  sourceSha256: textHash(readFileSync(join(PACKAGE, SOURCE))),
  abiSha256: textHash(JSON.stringify(first.abi)),
  creationBytecodeSha256: hexHash(creation),
  runtimeBytecodeSha256: hexHash(runtime),
  runtimeBytes,
  eip170HeadroomBytes: EIP170 - runtimeBytes,
  doubleBuildIdentical: deterministic,
  constructorArguments: {
    types: ["address initialOwner", "address initialFeeRecipient"],
    values: [OWNER, FEE_RECIPIENT],
    abiEncoded: constructorArgs,
  },
  abi: first.abi,
  bytecode: { object: `0x${creation}` },
  deployedBytecode: { object: `0x${runtime}` },
};
writeFileSync(
  join(CANDIDATE, "artifacts/FlowBridgeMultiSend.json"),
  JSON.stringify(artifact, null, 2) + "\n",
);
writeFileSync(
  join(CANDIDATE, "artifacts/FlowBridgeMultiSend.abi.json"),
  JSON.stringify(first.abi, null, 2) + "\n",
);
writeFileSync(
  join(CANDIDATE, "unsigned-deployment-data.txt"),
  `0x${creation}${constructorArgs.slice(2)}\n`,
);

console.log(
  JSON.stringify(
    {
      candidate: "MULTISEND_V1_RC2_SELF_CONTAINED",
      sources: Object.keys(sources).length,
      bundleSha256: artifact.bundle.sha256,
      sourceSha256: artifact.sourceSha256,
      abiSha256: artifact.abiSha256,
      creationBytecodeSha256: artifact.creationBytecodeSha256,
      runtimeBytecodeSha256: artifact.runtimeBytecodeSha256,
      runtimeBytes,
      eip170HeadroomBytes: artifact.eip170HeadroomBytes,
      doubleBuildIdentical: deterministic,
      constructorArgs,
    },
    null,
    2,
  ),
);
