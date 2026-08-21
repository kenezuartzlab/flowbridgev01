/**
 * FlowBridge V13 — compile FlowStakingVault.sol with the pinned solc 0.8.24.
 * Writes contracts/artifacts/FlowStakingVault.json (abi + bytecode). Broadcasts
 * nothing and touches no network.
 *
 * Usage: bun contracts/scripts/compile.staking.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = resolve(join(import.meta.dirname ?? ".", ".."));
const REPO = resolve(ROOT, "..");
const SOURCE = "FlowStakingVault.sol";

function readImport(path: string): { contents: string } | { error: string } {
  const candidates = [join(ROOT, path), join(REPO, "node_modules", path)];
  for (const c of candidates) if (existsSync(c)) return { contents: readFileSync(c, "utf8") };
  return { error: `not found: ${path}` };
}

const solc = require("solc");

const input = {
  language: "Solidity",
  sources: { [SOURCE]: { content: readFileSync(join(ROOT, SOURCE), "utf8") } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "paris",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "metadata"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: readImport }));
const fatal = (output.errors ?? []).filter((e: any) => e.severity === "error");
for (const e of output.errors ?? []) console.log(`${e.severity}: ${e.formattedMessage?.trim() ?? e.message}`);
if (fatal.length) {
  console.error("\nFLOW STAKING V13 TESTNET BUILD BLOCKED");
  process.exit(1);
}

const contract = output.contracts?.[SOURCE]?.["FlowStakingVault"];
if (!contract) {
  console.error("FlowStakingVault not present in compiler output.");
  process.exit(1);
}

const artifactPath = join(ROOT, "artifacts/FlowStakingVault.json");
mkdirSync(dirname(artifactPath), { recursive: true });
writeFileSync(
  artifactPath,
  JSON.stringify(
    {
      contractName: "FlowStakingVault",
      compiler: { version: "0.8.24", optimizer: { enabled: true, runs: 200 }, evmVersion: "paris" },
      abi: contract.abi,
      bytecode: { object: "0x" + contract.evm.bytecode.object },
    },
    null,
    2,
  ) + "\n",
);
console.log("wrote", artifactPath, "abi entries:", contract.abi.length);
