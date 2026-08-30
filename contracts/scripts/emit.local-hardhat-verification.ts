/**
 * FlowBridge — emit contracts/production/local-hardhat-verification/
 *
 * Materializes four self-contained, ready-to-run Hardhat verification projects
 * (FlowToken, Rewards Distributor, Staking Vault V2, Activity Registry) directly
 * from the PRESERVED frozen Standard-JSON inputs that were used at deployment.
 *
 * Nothing is recompiled, no source is rewritten, no chain is touched. Every
 * Solidity file — including each OpenZeppelin dependency — is copied byte-for-byte
 * out of the frozen bundle, so a local `npm ci && npx hardhat compile` reproduces
 * the deployed artifacts exactly. OpenZeppelin is wired as a local `file:./oz`
 * dependency so registry drift cannot change the bytes.
 *
 * Usage: bun contracts/scripts/emit.local-hardhat-verification.ts
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const REPO = resolve(join(import.meta.dirname ?? ".", "..", ".."));
const OUT = join(REPO, "contracts/production/local-hardhat-verification");
const OZ_PREFIX = "@openzeppelin/contracts/";
const OZ_DIR_REL = "vendor/openzeppelin-contracts-5.6.1";
const OZ_DIR = join(OUT, OZ_DIR_REL);
const RPC = "https://rpc.botchain.ai";
const EXPLORER = "https://scan.botchain.ai";

type Project = {
  dir: string;
  contractName: string;
  entrySource: string; // key inside the bundle sources map
  bundle: string; // repo-relative preserved standard-json input
  address: string;
  deployTx: string;
  solc: string; // hardhat solidity version
  solcLong: string; // explorer compiler string
  constructorArgs: unknown[];
  constructorArgsAbiEncoded: string;
  frozen: { creationSha256: string; runtimeSha256: string; runtimeBytes: number };
  notes: string;
};

const PROJECTS: Project[] = [
  {
    dir: "flow-token",
    contractName: "FlowToken",
    entrySource: "FlowToken.sol",
    bundle: "contracts/production/stage-a-verification/FlowToken.standard-input.json",
    address: "0x535ddda826142ac42ce288154e9595f080940ae9",
    deployTx: "0xa96c2b",
    solc: "0.8.24",
    solcLong: "v0.8.24+commit.e11b9ed9",
    constructorArgs: [
      "FlowBridge",
      "FLOW",
      "0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4",
      "1000000000000000000000000000",
    ],
    constructorArgsAbiEncoded:
      "0x000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000efc13d1a1dc30ba2da0bb005ba5a783c6b229ea40000000000000000000000000000000000000000033b2e3c9fd0803ce8000000000000000000000000000000000000000000000000000000000000000000000a466c6f77427269646765000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004464c4f5700000000000000000000000000000000000000000000000000000000",
    frozen: {
      creationSha256: "200a6a559c6e43a357f7b7fb677a1d7a4e1d89344fd78bcc34398265fa2107a2",
      runtimeSha256: "f7be82e4d98df2b7ab421ae8ec4b1d2ea1b0fd124b7865aaaad5e77656226edf",
      runtimeBytes: 3539,
    },
    notes:
      "On-chain runtime differs from the frozen local runtime only in the 131 bytes of EIP-712 immutables written by the constructor.",
  },
  {
    dir: "rewards-distributor",
    contractName: "FlowRewardsMerkleDistributor",
    entrySource: "FlowRewardsMerkleDistributor.sol",
    bundle:
      "contracts/production/stage-b-verification/FlowRewardsMerkleDistributor.standard-input.json",
    address: "0x3824681c3560A63e1c9ceDABBfcAB2691c5673FB",
    deployTx: "0x289727",
    solc: "0.8.24",
    solcLong: "v0.8.24+commit.e11b9ed9",
    constructorArgs: [
      "0x535ddda826142ac42ce288154e9595f080940ae9",
      "0x88A4CC1F5771523baeB83DaEea07D323a3ce9507",
      "0x88A4CC1F5771523baeB83DaEea07D323a3ce9507",
      "0x971E7790Fe6c8f77Dc666bB05D4aeDa362653F94",
      "0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF",
      "0xeFc13d1A1dC30BA2DA0Bb005ba5A783c6b229Ea4",
      "86400",
    ],
    constructorArgsAbiEncoded:
      "0x000000000000000000000000535ddda826142ac42ce288154e9595f080940ae900000000000000000000000088a4cc1f5771523baeb83daeea07d323a3ce950700000000000000000000000088a4cc1f5771523baeb83daeea07d323a3ce9507000000000000000000000000971e7790fe6c8f77dc666bb05d4aeda362653f940000000000000000000000001ce0b1df5d2055f6e92122d8cb7669609c2359ef000000000000000000000000efc13d1a1dc30ba2da0bb005ba5a783c6b229ea40000000000000000000000000000000000000000000000000000000000015180",
    frozen: {
      creationSha256: "21c96796f0e7fbc32ed114edf6194147ddb3949c88a9907d8cc28c9ed5157581",
      runtimeSha256: "a708b596b82367893813a4ed39650bcf26f95a23fad678955a4b938fca40d367",
      runtimeBytes: 5861,
    },
    notes:
      "On-chain runtime differs only in the 100 bytes of the five `token` immutable slots.",
  },
  {
    dir: "staking-vault-v2",
    contractName: "FlowStakingVaultV2",
    entrySource: "FlowStakingVaultV2.sol",
    bundle: "contracts/production/stage-e-verification/standard-input-FlowStakingVaultV2.json",
    address: "0x3cc0799fB4169A9BB5dA9812Bea23CBa97B989c8",
    deployTx: "0xe3d000d3243a0b85862e64fff63e340ccabb2e73831b2293cd87ec1f1b43f6c9",
    solc: "0.8.24",
    solcLong: "v0.8.24+commit.e11b9ed9",
    constructorArgs: [
      "0x535ddda826142ac42ce288154e9595f080940ae9",
      "0x5095ecc7226AD6dEceE99846Bc83363cA41b52bf",
      "0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e",
      "0x88A4CC1F5771523baeB83DaEea07D323a3ce9507",
    ],
    constructorArgsAbiEncoded:
      "0x000000000000000000000000535ddda826142ac42ce288154e9595f080940ae90000000000000000000000005095ecc7226ad6decee99846bc83363ca41b52bf000000000000000000000000a861152ca3676bccf7b5fdafb9eb6a57b9d32d0e00000000000000000000000088a4cc1f5771523baeb83daeea07d323a3ce9507",
    frozen: {
      creationSha256: "159b884935907d9cf892a160a7bb7f671aad86ca5616c29acc15f6686e80e4f6",
      runtimeSha256: "af5ed43ffce266a56bcc8bffcd1b8d8067155a5716024cda089dac286294b7ce",
      runtimeBytes: 10366,
    },
    notes: "Constructor args keccak256 0xc19ac2409811e9b37f32175a7869863cc7673216514e19ee5db98241e39b3c54.",
  },
  {
    dir: "activity-registry",
    contractName: "FlowBridgeActivityRegistry",
    entrySource: "FlowBridgeActivityRegistry.sol",
    bundle: "contracts/production/stage-d-verification/standard-input.json",
    address: "0xa80d8740f378989F649ca14C54e4B4a42E68753c",
    deployTx: "0xd636a12677f0f68a47595501a792861ceb83b18fd1c3fc8d0b6d76e226bf3b76",
    solc: "0.8.20",
    solcLong: "v0.8.20+commit.a1b79de6",
    constructorArgs: [
      "0x88A4CC1F5771523baeB83DaEea07D323a3ce9507",
      "0xFa3De5CFa1de8eCc36197dcC0fC34FeF5c1C7E47",
      "0x1Ce0b1DF5d2055f6e92122D8cB7669609C2359eF",
    ],
    constructorArgsAbiEncoded:
      "0x00000000000000000000000088a4cc1f5771523baeb83daeea07d323a3ce9507000000000000000000000000fa3de5cfa1de8ecc36197dcc0fc34fef5c1c7e470000000000000000000000001ce0b1df5d2055f6e92122d8cb7669609c2359ef",
    frozen: {
      creationSha256: "25ec99e2bc31648d9e0cb2376c00063c404d2b535afe887f1b9cb37ebfc2cc6d",
      runtimeSha256: "53a83eea932da41016a7021926113e4ed50612525768bb6ba0eb1ec876b3e03b",
      runtimeBytes: 2713,
    },
    notes:
      "Deployed runtime is byte-identical to the frozen artifact (no immutables). Attester address must stay lowercase in the ABI-encoded args as broadcast.",
  },
];

const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

function write(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

type Bundle = {
  language: string;
  sources: Record<string, { content: string }>;
  settings: {
    optimizer: { enabled: boolean; runs: number };
    viaIR: boolean;
    evmVersion: string;
    [k: string]: unknown;
  };
};

rmSync(OUT, { recursive: true, force: true });

const index: Record<string, unknown>[] = [];

for (const p of PROJECTS) {
  const bundleRaw = readFileSync(join(REPO, p.bundle), "utf8");
  const bundle = JSON.parse(bundleRaw) as Bundle;
  const root = join(OUT, p.dir);

  let ozFiles = 0;
  for (const [key, { content }] of Object.entries(bundle.sources)) {
    if (key.startsWith(OZ_PREFIX)) {
      write(join(OZ_DIR, key.slice(OZ_PREFIX.length)), content);
      ozFiles += 1;
    } else {
      // Source name must stay exactly as compiled at deployment ("Foo.sol"),
      // because the source path is part of the metadata hash. Hence the entry
      // file sits at the project root with paths.sources = ".".
      write(join(root, key), content);
    }
  }

  // Local, immutable OpenZeppelin package — pinned by content, not by registry.
  write(
    join(OZ_DIR, "package.json"),
    JSON.stringify(
      {
        name: "@openzeppelin/contracts",
        version: "5.6.1",
        description:
          "Frozen subset of OpenZeppelin Contracts 5.6.1, copied byte-for-byte from the deployment Standard-JSON input. Do not edit.",
        license: "MIT",
      },
      null,
      2,
    ) + "\n",
  );

  write(
    join(root, "package.json"),
    JSON.stringify(
      {
        name: `flowbridge-verify-${p.dir}`,
        version: "1.0.0",
        private: true,
        description: `Frozen Hardhat verification project for ${p.contractName} on BOT Mainnet 677`,
        scripts: {
          compile: "../node_modules/.bin/hardhat compile",
          hashes: "node scripts/hashes.js",
          verify: "../node_modules/.bin/hardhat run scripts/verify.js --network bot",
        },
      },
      null,
      2,
    ) + "\n",
  );

  write(
    join(root, "hardhat.config.js"),
    `// FlowBridge frozen verification config — ${p.contractName}
// Compiler settings are the exact deployment settings. DO NOT EDIT.
require("@nomicfoundation/hardhat-verify");

module.exports = {
  solidity: {
    version: "${p.solc}",
    settings: {
      optimizer: { enabled: ${bundle.settings.optimizer.enabled}, runs: ${bundle.settings.optimizer.runs} },
      viaIR: ${bundle.settings.viaIR},
      evmVersion: "${bundle.settings.evmVersion}",
    },
  },
  paths: { sources: "." },
  networks: {
    bot: {
      url: process.env.BOT_MAINNET_RPC_URL || "${RPC}",
      chainId: 677,
    },
  },
  etherscan: {
    apiKey: { bot: process.env.BOT_EXPLORER_API_KEY || "empty" },
    customChains: [
      {
        network: "bot",
        chainId: 677,
        urls: { apiURL: "${EXPLORER}/api", browserURL: "${EXPLORER}" },
      },
    ],
  },
  sourcify: { enabled: false },
};
`,
  );

  write(
    join(root, "constructor-args.js"),
    `// Exact deployment constructor arguments for ${p.contractName}.
// ABI-encoded (as broadcast): ${p.constructorArgsAbiEncoded}
module.exports = ${JSON.stringify(p.constructorArgs, null, 2)};
`,
  );

  write(
    join(root, "scripts", "verify.js"),
    `// hardhat verify wrapper — no keys required, read-only against the explorer.
const args = require("../constructor-args.js");

async function main() {
  const hre = require("hardhat");
  await hre.run("verify:verify", {
    address: "${p.address}",
    contract: "${p.entrySource}:${p.contractName}",
    constructorArguments: args,
  });
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
`,
  );

  write(
    join(root, "scripts", "hashes.js"),
    `// Prove the local rebuild reproduces the frozen deployment artifact.
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const artifact = JSON.parse(
  readFileSync(
    path.join(
      __dirname,
      "..",
      "artifacts",
      "${p.entrySource}",
      "${p.contractName}.json",
    ),
    "utf8",
  ),
);
const h = (hex) => createHash("sha256").update(Buffer.from(hex.replace(/^0x/, ""), "hex")).digest("hex");
const creation = h(artifact.bytecode);
const runtime = h(artifact.deployedBytecode);
const expected = {
  creation: "${p.frozen.creationSha256}",
  runtime: "${p.frozen.runtimeSha256}",
};
console.log("creation sha256", creation, creation === expected.creation ? "MATCH" : "MISMATCH");
console.log("runtime  sha256", runtime, runtime === expected.runtime ? "MATCH" : "MISMATCH");
console.log("runtime  bytes ", (artifact.deployedBytecode.length - 2) / 2, "expected ${p.frozen.runtimeBytes}");
if (creation !== expected.creation || runtime !== expected.runtime) process.exitCode = 1;
`,
  );

  // Preserve the exact bundle for the manual browser fallback.
  write(join(root, "standard-input.json"), bundleRaw);

  write(
    join(root, "README.md"),
    `# ${p.contractName} — frozen local verification project

Deployed: \`${p.address}\` (BOT Mainnet 677)
Explorer: ${EXPLORER}/address/${p.address}

## Frozen build (do not change)

| Field | Value |
| --- | --- |
| Compiler | \`${p.solcLong}\` |
| Optimizer | ${bundle.settings.optimizer.enabled ? "enabled" : "disabled"}, ${bundle.settings.optimizer.runs} runs |
| viaIR | ${bundle.settings.viaIR} |
| EVM version | \`${bundle.settings.evmVersion}\` |
| OpenZeppelin | 5.6.1 (vendored in \`../${OZ_DIR_REL}/\`, ${ozFiles} files used, byte-identical to deployment) |
| License | MIT |
| Contract target | \`${p.entrySource}:${p.contractName}\` |
| Creation sha256 | \`${p.frozen.creationSha256}\` |
| Runtime sha256 | \`${p.frozen.runtimeSha256}\` (${p.frozen.runtimeBytes} bytes) |
| Constructor args | \`constructor-args.js\` (ABI-encoded in that file's header) |

${p.notes}

## Run locally

\`\`\`bash
cd ..             # dependencies are installed once, one level up
npm ci            # first run without a lockfile: npm install, then keep the lockfile
cd ${p.dir}
npm run compile
npm run hashes    # must print MATCH for creation and runtime
npm run verify    # submits to ${EXPLORER}; no private key needed
\`\`\`

Do not edit any \`.sol\` file, the compiler settings, or the vendored OpenZeppelin
files. The Solidity source name (\`${p.entrySource}\`, at the project root) is part
of the metadata hash — moving it into a subfolder changes the bytecode and
verification will fail.

## Browser fallback

If the explorer edge blocks the automated submission (Cloudflare HTTP 403 has
happened repeatedly for this contract), upload \`standard-input.json\` on the
explorer's *Solidity (Standard JSON input)* form with the table values above and
the constructor args from \`constructor-args.js\`.
`,
  );

  index.push({
    project: p.dir,
    contract: p.contractName,
    address: p.address,
    deployTx: p.deployTx,
    compiler: p.solcLong,
    optimizer: bundle.settings.optimizer,
    viaIR: bundle.settings.viaIR,
    evmVersion: bundle.settings.evmVersion,
    openzeppelin: "5.6.1 (vendored)",
    sourceFiles: Object.keys(bundle.sources).length,
    ozFiles,
    bundleSource: p.bundle,
    bundleSha256: sha256(bundleRaw),
    constructorArgsAbiEncoded: p.constructorArgsAbiEncoded,
    frozen: p.frozen,
  });

  console.log(
    `${p.dir.padEnd(22)} sources=${Object.keys(bundle.sources).length} oz=${ozFiles} solc=${p.solc}`,
  );
}

write(
  join(OUT, "package.json"),
  JSON.stringify(
    {
      name: "flowbridge-local-hardhat-verification",
      version: "1.0.0",
      private: true,
      description:
        "Shared pinned toolchain for the four frozen FlowBridge verification projects (BOT Mainnet 677).",
      dependencies: { "@openzeppelin/contracts": `file:./${OZ_DIR_REL}` },
      devDependencies: {
        hardhat: "2.26.1",
        "@nomicfoundation/hardhat-verify": "2.0.12",
      },
    },
    null,
    2,
  ) + "\n",
);

write(
  join(OUT, "MANIFEST.json"),
  JSON.stringify(
    {
      $comment:
        "Generated by contracts/scripts/emit.local-hardhat-verification.ts from the preserved deployment Standard-JSON inputs. Verification only — no deployment authority, no key material, no chain writes.",
      chainId: 677,
      rpc: RPC,
      explorer: EXPLORER,
      generator: "contracts/scripts/emit.local-hardhat-verification.ts",
      projects: index,
    },
    null,
    2,
  ) + "\n",
);

write(
  join(OUT, "README.md"),
  `# Local Hardhat source verification — BOT Mainnet 677

Four self-contained Hardhat projects for the contracts that are deployed and
runtime-proven but still \`SOURCE_PENDING\` on \`${EXPLORER}\` because the
explorer edge rejects automated submissions from this environment.

| Project | Contract | Address |
| --- | --- | --- |
${PROJECTS.map((p) => `| \`${p.dir}/\` | ${p.contractName} | \`${p.address}\` |`).join("\n")}

Already publicly verified and therefore not included: Router V4, Router Lens,
Staking Reward Treasury, Staking Controller.

## How to use

1. Download / clone this repository locally — do not copy Solidity into a new project.
2. \`cd contracts/production/local-hardhat-verification\`
3. \`npm ci\` once in \`contracts/production/local-hardhat-verification/\` (first run without a
   committed lockfile: \`npm install\`, then keep the lockfile)
4. \`cd <project> && npm run compile\`
5. \`npm run hashes\` — must print \`MATCH\` for creation and runtime before you verify
6. \`npm run verify\`

Optional: \`export BOT_MAINNET_RPC_URL=${RPC}\` (already the default) and
\`export BOT_EXPLORER_API_KEY=...\` if the explorer ever requires a key.

## Why these projects are safe to run

- Every Solidity file, including OpenZeppelin 5.6.1, is copied byte-for-byte out
  of the Standard-JSON input used at deployment; OpenZeppelin is a local
  \`file:./${OZ_DIR_REL}\` dependency, so registry drift cannot change the bytes.
- Compiler version, optimizer runs, \`viaIR\` and EVM version are the frozen
  deployment settings.
- No private key, mnemonic or deployer secret is used or needed. Verification is
  read-only against the explorer; these projects contain no deployment script.
- Each project ships its original \`standard-input.json\` for the browser fallback.

Do not edit sources or settings. \`MANIFEST.json\` records every frozen hash.
`,
);

console.log(`\nemitted → ${OUT}`);
