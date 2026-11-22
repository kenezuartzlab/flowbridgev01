import fs from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { keccak256 } from 'viem';
import { compile, standardInput } from './contracts/candidates/bnb-swap-adapter-v1-12/scripts/compile.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const freeze = JSON.parse(fs.readFileSync('SOURCE_FREEZE.json', 'utf8'));
const inventory = JSON.parse(fs.readFileSync('INTEGRITY.json', 'utf8'));
for (const entry of inventory.files) {
  if (entry.path.startsWith('/') || entry.path.split('/').includes('..')) throw Error('Unsafe integrity path');
  assert.equal(hash(fs.readFileSync(entry.path)), entry.sha256, `Frozen packet file changed: ${entry.path}`);
}
const src = fs.readFileSync(freeze.candidatePath);
assert.equal(hash(src), freeze.sha256);
assert.equal(keccak256(src), freeze.sourceKeccak);
assert.ok(src.equals(fs.readFileSync('source/FlowBridgeBnbSwapAdapterV1_12.sol')));
assert.doesNotMatch(src.toString(), /^\s*import\b/m, 'Source closure needs imported dependencies');
const artifact = compile()['FlowBridgeBnbSwapAdapterV1_12.sol'].FlowBridgeBnbSwapAdapterV1_12;
const manifest = JSON.parse(fs.readFileSync('artifacts/MANIFEST.full.json', 'utf8'));
assert.equal(keccak256(`0x${artifact.evm.bytecode.object}`), freeze.creationBytecodeKeccak);
assert.equal(keccak256(`0x${artifact.evm.deployedBytecode.object}`), freeze.unlinkedRuntimeKeccak);
assert.deepEqual(artifact, JSON.parse(fs.readFileSync('artifacts/compiled-artifact.json', 'utf8')));
assert.deepEqual(artifact.abi, manifest.abi);
assert.deepEqual(artifact.evm.deployedBytecode.immutableReferences, manifest.immutableReferences);
assert.deepEqual(standardInput(), JSON.parse(fs.readFileSync('artifacts/standard-input.json', 'utf8')));
console.log(`PASS: ${inventory.files.length} file hashes; source closure, ABI, creation/runtime bytecode and immutable offsets reproduced; NOT an independent audit`);