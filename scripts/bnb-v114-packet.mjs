// Builds the PRIVATE V1.14 community review packet (artifacts + SHA256SUMS). Never publishes or shares anything.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { keccak256 } from 'viem';
import { compile, SOURCE } from '../contracts/candidates/bnb-swap-adapter-v1-13/scripts/compile.mjs';
const SRC = 'contracts/candidates/bnb-swap-adapter-v1-13/' + SOURCE;
const OUT = 'contracts/audit/bnb-v114-community-readiness';
const EXPECT = '5e82f02854d6cdd0a34ba16e2d2bc0e1c1e605319b4094ebfb2fe9549d6b0425';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const srcHash = sha(fs.readFileSync(SRC));
if (srcHash !== EXPECT) throw new Error('V1.13 source hash drift: ' + srcHash);
const c = compile()[SOURCE].FlowBridgeBnbSwapAdapterV1_13;
const man = JSON.parse(fs.readFileSync('contracts/candidates/bnb-swap-adapter-v1-13/MANIFEST.json', 'utf8'));
const creation = '0x' + c.evm.bytecode.object, runtime = '0x' + c.evm.deployedBytecode.object;
if (keccak256(creation) !== man.creationBytecodeKeccak || keccak256(runtime) !== man.unlinkedRuntimeKeccak) throw new Error('bytecode does not reproduce MANIFEST');
if (JSON.stringify(c.abi) !== JSON.stringify(man.abi)) throw new Error('ABI drift');
fs.writeFileSync(`${OUT}/artifacts/abi.json`, JSON.stringify(c.abi, null, 2) + '\n');
fs.writeFileSync(`${OUT}/artifacts/creation.bytecode.hex`, creation + '\n');
fs.writeFileSync(`${OUT}/artifacts/runtime.unlinked.hex`, runtime + '\n');
fs.writeFileSync(`${OUT}/artifacts/FREEZE.json`, JSON.stringify({
  status: 'LOCAL CANDIDATE — NOT DEPLOYED, NOT AUDITED, NO HUMAN SIGN-OFF', source: SRC, sourceSha256: srcHash,
  compiler: man.compiler, optimizerRuns: 200, evmVersion: 'cancun', creationKeccak: man.creationBytecodeKeccak, runtimeKeccak: man.unlinkedRuntimeKeccak,
  immutableReferences: c.evm.deployedBytecode.immutableReferences }, null, 2) + '\n');
const include = [SRC, 'contracts/candidates/bnb-swap-adapter-v1-13/MANIFEST.json',
  ...fs.readdirSync('docs/security/bnb-bot-v4-parity').map((f) => 'docs/security/bnb-bot-v4-parity/' + f),
  ...fs.readdirSync('contracts/candidates/bnb-swap-adapter-v1-13/test').map((f) => 'contracts/candidates/bnb-swap-adapter-v1-13/test/' + f),
  ...fs.readdirSync(OUT, { recursive: true }).map((f) => `${OUT}/${f}`).filter((p) => fs.statSync(p).isFile() && !p.endsWith('SHA256SUMS'))].sort();
fs.writeFileSync(`${OUT}/SHA256SUMS`, include.map((p) => `${sha(fs.readFileSync(p))}  ${p}`).join('\n') + '\n');
console.log(JSON.stringify({ srcHash, files: include.length, creation: man.creationBytecodeKeccak, runtime: man.runtimeKeccak ?? man.unlinkedRuntimeKeccak }));
