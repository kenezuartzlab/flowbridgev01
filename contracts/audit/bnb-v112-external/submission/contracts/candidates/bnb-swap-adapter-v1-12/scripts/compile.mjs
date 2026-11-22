import fs from 'node:fs';
import solc from 'solc-0.8.38';
import { keccak256 } from 'viem';
const dir = 'contracts/candidates/bnb-swap-adapter-v1-12';
export const SOURCE = 'FlowBridgeBnbSwapAdapterV1_12.sol';
export function standardInput(extra = {}) {
  return { language: 'Solidity', sources: { [SOURCE]: { content: fs.readFileSync(`${dir}/${SOURCE}`, 'utf8') }, ...extra },
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'evm.deployedBytecode.immutableReferences'] } } } };
}
export function compile(extra = {}) {
  const out = JSON.parse(solc.compile(JSON.stringify(standardInput(extra))));
  const errors = (out.errors ?? []).filter((e) => e.severity === 'error');
  if (errors.length) throw new Error(errors.map((e) => e.formattedMessage).join('\n'));
  return out.contracts;
}
if (process.argv[1]?.endsWith('compile.mjs')) {
  const c = compile()[SOURCE].FlowBridgeBnbSwapAdapterV1_12;
  const src = fs.readFileSync(`${dir}/${SOURCE}`);
  const freeze = { status: 'LOCAL CANDIDATE — NOT DEPLOYED, NOT AUDITED, NOT REGISTERED', compiler: solc.version(), optimizerRuns: 200, evmVersion: 'cancun',
    sourceKeccak: keccak256(src), creationBytecodeKeccak: keccak256(`0x${c.evm.bytecode.object}`), unlinkedRuntimeKeccak: keccak256(`0x${c.evm.deployedBytecode.object}`),
    runtimeBytes: c.evm.deployedBytecode.object.length / 2, immutableReferences: c.evm.deployedBytecode.immutableReferences, note: 'Runtime contains immutables; compare only after constructor patching.', abi: c.abi };
  fs.writeFileSync(`${dir}/MANIFEST.json`, JSON.stringify(freeze, null, 2) + '\n');
  console.log(JSON.stringify({ ...freeze, abi: undefined }, null, 1));
}
