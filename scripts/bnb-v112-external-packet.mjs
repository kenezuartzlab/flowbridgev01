import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { keccak256 } from 'viem';
import { compile, standardInput } from '../contracts/candidates/bnb-swap-adapter-v1-12/scripts/compile.mjs';

const target = 'contracts/audit/bnb-v112-external/submission';
const candidate = 'contracts/candidates/bnb-swap-adapter-v1-12';
const source = 'FlowBridgeBnbSwapAdapterV1_12.sol';
const anchor = '582e43ee77d03e43ff2c1f358b0f6a140720ccc7';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sourceBytes = fs.readFileSync(`${candidate}/${source}`);
if (sha(sourceBytes) !== 'feb06ff5e1e392b2264dca4f86cb40c07af2a033fbd557ea10f2e9d2e333575b') throw Error('Final freeze changed: new auditor review required');
if (!sourceBytes.equals(execFileSync('git', ['show', `${anchor}:${candidate}/${source}`]))) throw Error('Source differs from freeze commit');
const manifest = JSON.parse(fs.readFileSync(`${candidate}/MANIFEST.json`, 'utf8'));
const artifact = compile()[source].FlowBridgeBnbSwapAdapterV1_12;
if (keccak256(sourceBytes) !== manifest.sourceKeccak || keccak256(`0x${artifact.evm.bytecode.object}`) !== manifest.creationBytecodeKeccak || keccak256(`0x${artifact.evm.deployedBytecode.object}`) !== manifest.unlinkedRuntimeKeccak || JSON.stringify(artifact.abi) !== JSON.stringify(manifest.abi)) throw Error('Artifact mismatch');

fs.mkdirSync(target, { recursive: true });
const write = (file, text) => { const dest = `${target}/${file}`; fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, text); };
const json = (file, value) => write(file, JSON.stringify(value, null, 2) + '\n');
// Store test copies as inert bytes, avoiding duplicate suites in the application checkout.
// A disposable export restores the original names before running its isolated harness.
const copy = (file) => write(file.endsWith('.test.ts') ? `${file}.audit` : file, fs.readFileSync(file));
const files = [
  ...execFileSync('git', ['ls-files', candidate, 'contracts/candidates/bnb-swap-adapter-v1-11', 'contracts/audit/bnb-v111', 'contracts/audit/bnb-v112-review'], { encoding: 'utf8' }).trim().split('\n'),
  'scripts/bnb-v112-fork-rehearsal.ts', 'src/lib/bnb/quoteAdapter.ts', 'src/lib/rwa/quoteReadiness.ts',
  'docs/security/BNB_SWAP_V1_12_FORK_REHEARSAL_20261122.json',
  'docs/security/BNB_SWAP_V1_12_REMEDIATION_ACCEPTANCE_20261122.md',
  'docs/security/BNB_SWAP_V1_4_SOURCE_ARCHIVE_20261117.json',
  ...execFileSync('git', ['ls-files', 'docs/security/bnb-v112-evidence', 'docs/security/bnb-v112-review-evidence'], { encoding: 'utf8' }).trim().split('\n'),
  'docs/security/BNB_SWAP_V1_12_INITIAL_REVIEW_RESPONSE_20261125.md', 'scripts/bnb-v112-high-traces.mjs', 'scripts/bnb-v112-review-fork.ts', 'scripts/bnb-v112-block-cadence.mjs',
];
for (const file of files) {
  if (!file || file.split('/').some((segment) => ['.git', 'node_modules', '.env'].includes(segment))) throw Error('Forbidden packet path');
  copy(file);
}
copy('bun.lock');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
json('evidence/original-package.json', pkg);
pkg.scripts = { test: 'bun restore-tests.mjs && vitest run', 'audit:verify': 'bun verify.mjs' };
json('package.json', pkg);
json('tsconfig.json', { compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', paths: { '@/*': ['./src/*'] }, allowImportingTsExtensions: true, noEmit: true, strict: true } });
write('vitest.config.ts', "import { defineConfig } from 'vitest/config';\nimport { fileURLToPath } from 'node:url';\nexport default defineConfig({ resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } }, test: { include: ['contracts/candidates/bnb-swap-adapter-v1-12/test/**/*.test.ts', 'contracts/audit/bnb-v111/**/*.test.ts', 'contracts/audit/bnb-v112-review/review.evm.test.ts'] } });\n");
json('artifacts/standard-input.json', standardInput());
json('artifacts/compiled-artifact.json', artifact);
json('artifacts/MANIFEST.full.json', { ...manifest, creationBytecode: `0x${artifact.evm.bytecode.object}`, unlinkedRuntimeBytecode: `0x${artifact.evm.deployedBytecode.object}` });
write(`source/${source}`, sourceBytes); // No imports; this is the complete deployable source closure.
const fork = JSON.parse(fs.readFileSync('docs/security/BNB_SWAP_V1_12_FORK_REHEARSAL_20261122.json', 'utf8'));
const productionFiles = execFileSync('git', ['ls-files', 'contracts/production', 'src/lib/contracts/productionRegistry.json'], { encoding: 'utf8' }).trim().split('\n');
const hits = productionFiles.filter((file) => /FlowBridgeBnbSwapAdapter|bnb-swap-adapter-v1|b5d725ee678e28c1e6f235b8b4fd1ef62b35780ddbbc6003aa5f3b45b5c8a478/i.test(fs.readFileSync(file, 'utf8')));
if (hits.length || fork.mainnetTransactions !== 0 || fork.localCandidate?.deployment !== 'LOCAL_FORK_ONLY_NOT_MAINNET') throw Error('Mainnet absence evidence gate failed');
json('SOURCE_FREEZE.json', { classification: 'PRIVATE_EXTERNAL_AUDIT_SUBMISSION_NOT_PUBLIC', anchorCommit: anchor, candidatePath: `${candidate}/${source}`, sha256: sha(sourceBytes), sourceKeccak: manifest.sourceKeccak, creationBytecodeKeccak: manifest.creationBytecodeKeccak, unlinkedRuntimeKeccak: manifest.unlinkedRuntimeKeccak, compiler: manifest.compiler, optimizer: { enabled: true, runs: 200 }, evmVersion: manifest.evmVersion, solidityImports: [], sourceClosureFiles: [source], sourceChangeInvalidatesFreeze: true, independentAudit: 'NOT_ENGAGED_NOT_SIGNED', deploymentAuthorized: false });
json('evidence/mainnet-deployment-status.json', { status: 'NO_BNB_MAINNET_ADAPTER_DEPLOYMENT_RECORDED', mainnetAdapterAddress: null, mainnetDeploymentTransaction: null, productionRegistryMatches: hits, inspectedFiles: productionFiles.map((file) => ({ path: file, sha256: sha(fs.readFileSync(file)) })), forkScope: 'LOCAL_ONLY', localTransactions: fork.transactions.length, mainnetTransactions: fork.mainnetTransactions, note: 'Absence is scoped to project manifests/evidence, not an assertion about arbitrary third-party deployments. Local candidate addresses/hashes are synthetic Anvil observations, never mainnet deployment proof.' });
json('evidence/fresh-dependency-audit.json', JSON.parse(fs.readFileSync('docs/security/bnb-v112-review-evidence/dependency-audit-20261125.json', 'utf8'))); // EV-02: tracked, timestamped, lockfile-hashed evidence
json('evidence/fresh-dependency-audit-provenance.json', { command: 'bun audit --json', observedAt: '2026-11-25T15:18:00Z', lockfileSha256: sha(fs.readFileSync('bun.lock')), productionOpen: 'Zod 3.22.4 via WalletConnect/AppKit (HIGH)', developmentOpen: 'minimatch 10.2.5 via TypeScript ESLint (moderate)', suppressed: 0, independentAudit: false });
json('evidence/fork-reproduction.json', { block: fork.fork.block, blockHash: fork.fork.blockHash, command: `BNB_FORK_BLOCK=${fork.fork.block} nix shell nixpkgs#foundry -c bun scripts/bnb-v112-fork-rehearsal.ts`, note: 'Run only in a disposable private copy; outputs overwrite only that copy. Upstream archive availability can block reproduction. All writes target 127.0.0.1:8547, never the BNB RPC.' });
console.log(`Private packet staged at ${target}; documentation and integrity inventory must be completed before submission.`);