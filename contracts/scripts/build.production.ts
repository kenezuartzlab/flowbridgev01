/**
 * FlowBridge V30.1E.1 — reproducible production bytecode build.
 *
 * Compiles every deployable production contract twice from clean compiler
 * state with its reviewed build matrix and writes
 * contracts/production/PRODUCTION_BYTECODE.json with source / creation /
 * runtime / normalized-ABI SHA-256 hashes plus a reproducibility flag.
 *
 * Broadcasts nothing, signs nothing, touches no network beyond local reads.
 *
 * Usage:
 *   SOLC_020=/tmp/c820/node_modules/solc OZ=/tmp/oz561/node_modules \
 *   bun contracts/scripts/build.production.ts
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const REPO = resolve(join(import.meta.dirname ?? ".", "..", ".."));
const OZ_ROOT = process.env["OZ"] ?? join(REPO, "node_modules");
const SOLC_020 = process.env["SOLC_020"] ?? "solc";
const SOLC_024 = process.env["SOLC_024"] ?? join(REPO, "node_modules", "solc");

type BuildLine = {
  id: string;
  solcPath: string;
  optimizer: { enabled: boolean; runs: number };
  viaIR: boolean;
  evmVersion: string;
};

const LINES: Record<string, BuildLine> = {
  routerV4: {
    id: "routerV4",
    solcPath: SOLC_020,
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    evmVersion: "shanghai",
  },
  missingContractPackage: {
    id: "missingContractPackage",
    solcPath: SOLC_020,
    optimizer: { enabled: true, runs: 1 },
    viaIR: true,
    evmVersion: "shanghai",
  },
  tokenRewards: {
    id: "tokenRewards",
    solcPath: SOLC_024,
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    evmVersion: "cancun",
  },

  stakingV2: {
    id: "stakingV2",
    solcPath: SOLC_024,
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    evmVersion: "cancun",
  },
};

const TARGETS: { contractId: string; source: string; line: BuildLine }[] = [
  { contractId: "FlowToken", source: "contracts/FlowToken.sol", line: LINES["tokenRewards"]! },
  {
    contractId: "FlowRewardsMerkleDistributor",
    source: "contracts/production/rewards-distributor/FlowRewardsMerkleDistributor.sol",
    line: LINES["tokenRewards"]!,
  },
  {
    contractId: "FlowBridgeRouterV4",
    source: "contracts/production/router-v4/FlowBridgeRouterV4.sol",
    line: LINES["routerV4"]!,
  },
  {
    contractId: "FlowBridgeRouterLens",
    source: "contracts/production/router-lens/FlowBridgeRouterLens.sol",
    line: LINES["missingContractPackage"]!,
  },
  {
    contractId: "FlowBridgeActivityRegistry",
    source: "contracts/production/activity-registry/FlowBridgeActivityRegistry.sol",
    line: LINES["missingContractPackage"]!,
  },
  {
    contractId: "FlowStakingRewardTreasury",
    source: "contracts/production/staking-v2/FlowStakingRewardTreasury.sol",
    line: LINES["stakingV2"]!,
  },
  {
    contractId: "FlowStakingController",
    source: "contracts/production/staking-v2/FlowStakingController.sol",
    line: LINES["stakingV2"]!,
  },
  {
    contractId: "FlowStakingVaultV2",
    source: "contracts/production/staking-v2/FlowStakingVaultV2.sol",
    line: LINES["stakingV2"]!,
  },
];

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const sha256Bytecode = (hex: string) => sha256(Buffer.from(hex.replace(/^0x/, ""), "hex"));

function readImport(path: string): { contents: string } | { error: string } {
  for (const c of [join(OZ_ROOT, path), join(REPO, "node_modules", path), join(REPO, path)]) {
    if (existsSync(c)) return { contents: readFileSync(c, "utf8") };
  }
  return { error: `not found: ${path}` };
}

function compileOnce(target: (typeof TARGETS)[number]) {
  const solc = require(target.line.solcPath);
  const abs = join(REPO, target.source);
  const key = target.source.split("/").pop()!;
  const input = {
    language: "Solidity",
    sources: { [key]: { content: readFileSync(abs, "utf8") } },
    settings: {
      optimizer: target.line.optimizer,
      viaIR: target.line.viaIR,
      evmVersion: target.line.evmVersion,
      outputSelection: {
        "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object", "metadata"] },
      },
    },
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input), { import: readImport }));
  const fatal = (out.errors ?? []).filter((e: { severity: string }) => e.severity === "error");
  if (fatal.length) {
    for (const e of fatal) console.error(e.formattedMessage ?? e.message);
    throw new Error(`compile failed: ${target.contractId}`);
  }
  const artifact = out.contracts?.[key]?.[target.contractId];
  if (!artifact) throw new Error(`contract missing in output: ${target.contractId}`);
  const creation = "0x" + artifact.evm.bytecode.object;
  const runtime = "0x" + artifact.evm.deployedBytecode.object;
  return {
    solcVersion: solc.version() as string,
    creation,
    runtime,
    abi: artifact.abi,
    creationSha256: sha256Bytecode(creation),
    runtimeSha256: sha256Bytecode(runtime),
    normalizedAbiSha256: sha256(JSON.stringify(artifact.abi)),
    creationBytes: (creation.length - 2) / 2,
    runtimeBytes: (runtime.length - 2) / 2,
  };
}

const EIP170_LIMIT = 24_576;
const results: Record<string, unknown> = {};
let blocked = false;

for (const target of TARGETS) {
  const first = compileOnce(target);
  const second = compileOnce(target);
  const reproducible =
    first.creationSha256 === second.creationSha256 &&
    first.runtimeSha256 === second.runtimeSha256 &&
    first.normalizedAbiSha256 === second.normalizedAbiSha256;
  const withinEip170 = first.runtimeBytes <= EIP170_LIMIT;
  if (!reproducible || !withinEip170) blocked = true;
  results[target.contractId] = {
    source: target.source,
    sourceSha256: sha256(readFileSync(join(REPO, target.source))),
    buildLine: target.line.id,
    compiler: {
      version: first.solcVersion,
      optimizer: target.line.optimizer,
      viaIR: target.line.viaIR,
      evmVersion: target.line.evmVersion,
      openzeppelin: JSON.parse(
        readFileSync(join(OZ_ROOT, "@openzeppelin/contracts/package.json"), "utf8"),
      ).version,
    },
    creationSha256: first.creationSha256,
    runtimeSha256: first.runtimeSha256,
    normalizedAbiSha256: first.normalizedAbiSha256,
    creationBytes: first.creationBytes,
    runtimeBytes: first.runtimeBytes,
    eip170: withinEip170 ? "WITHIN_LIMIT" : "EXCEEDS_LIMIT",
    doubleBuild: reproducible ? "REPRODUCIBLE" : "NON_REPRODUCIBLE",
    status: reproducible && withinEip170 ? "BYTECODE_READY" : "BUILD_PARITY_BLOCKED",
  };
  console.log(
    `${target.contractId.padEnd(30)} runtime=${first.runtimeSha256.slice(0, 16)} bytes=${first.runtimeBytes} ${reproducible ? "REPRODUCIBLE" : "NON_REPRODUCIBLE"}`,
  );
}

const outPath = join(REPO, "contracts/production/PRODUCTION_BYTECODE.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  JSON.stringify(
    {
      $comment:
        "FlowBridge V30.1E.1 — reproducible production bytecode evidence. Generated by contracts/scripts/build.production.ts. Zero writes to any chain.",
      gate: "V30.1E.1",
      generator: "contracts/scripts/build.production.ts",
      hashConventions: {
        bytecode: "sha256 over decoded bytes (0x stripped, hex decoded)",
        normalizedAbi: "sha256(JSON.stringify(artifact.abi))",
        source: "sha256 over raw source file bytes",
      },
      verdict: blocked ? "BUILD_PARITY_BLOCKED" : "ALL_CONTRACTS_BYTECODE_READY",
      contracts: results,
    },
    null,
    2,
  ) + "\n",
);
console.log(`\n${blocked ? "BUILD PARITY BLOCKED" : "ALL CONTRACTS BYTECODE READY"} → ${outPath}`);
