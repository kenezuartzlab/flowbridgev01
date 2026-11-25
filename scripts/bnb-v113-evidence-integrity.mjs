// V1.13 evidence-integrity check: source hash, fresh-compile vs MANIFEST, V1.12 freeze, HIGH traces, fork evidence,
// privacy (no public/app import), then writes SHA256SUMS. Fails loudly; never edits contract source.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { keccak256 } from 'viem';
import { compile } from '../contracts/candidates/bnb-swap-adapter-v1-13/scripts/compile.mjs';
const sha = (f) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const must = (c, m) => { if (!c) throw Error(m); };
const C = 'contracts/candidates/bnb-swap-adapter-v1-13', SRC = `${C}/FlowBridgeBnbSwapAdapterV1_13.sol`, EV = 'docs/security/bnb-v113-evidence';
must(sha(SRC) === '5e82f02854d6cdd0a34ba16e2d2bc0e1c1e605319b4094ebfb2fe9549d6b0425', 'V1.13 source hash drift');
must(sha('contracts/candidates/bnb-swap-adapter-v1-12/FlowBridgeBnbSwapAdapterV1_12.sol') === 'feb06ff5e1e392b2264dca4f86cb40c07af2a033fbd557ea10f2e9d2e333575b', 'V1.12 freeze broken');
const m = JSON.parse(fs.readFileSync(`${C}/MANIFEST.json`, 'utf8'));
const a = compile()['FlowBridgeBnbSwapAdapterV1_13.sol'].FlowBridgeBnbSwapAdapterV1_13;
must(m.sourceKeccak === keccak256(fs.readFileSync(SRC)), 'manifest sourceKeccak');
must(m.creationBytecodeKeccak === keccak256(`0x${a.evm.bytecode.object}`), 'creation bytecode mismatch');
must(m.unlinkedRuntimeKeccak === keccak256(`0x${a.evm.deployedBytecode.object}`), 'runtime bytecode mismatch');
must(m.compiler.startsWith('0.8.38') && m.optimizerRuns === 200 && m.evmVersion === 'cancun', 'compiler settings');
const t = JSON.parse(fs.readFileSync(`${EV}/high-trace-v113.json`, 'utf8'));
must(t.source === SRC && t.highCount === 6 && t.traces.every((x) => !/V1_1[12]/.test(x.trace)), 'stale or wrong HIGH traces');
const s = JSON.parse(fs.readFileSync(`${EV}/slither-v113.json`, 'utf8')).results.detectors;
must(s.filter((d) => d.impact === 'High').length === 6 && s.length === 18, 'slither counts changed');
const f = JSON.parse(fs.readFileSync(`${EV}/fork-rehearsal-v113.json`, 'utf8'));
must(f.status === 'PASS' && f.mainnetTransactions === 0 && f.fork.chainId === 56 && f.fork.blockHash && f.realBytecode.WBNB.keccak256, 'fork evidence');
const leaks = execSync(`rg -l "bnb-swap-adapter-v1-13|bnb-v113" src public || true`, { encoding: 'utf8' }).split('\n').filter((x) => x && !x.endsWith('.test.ts'));
must(leaks.length === 0, `V1.13 referenced by app/public: ${leaks}`);
const files = [SRC, `${C}/MANIFEST.json`, `${C}/scripts/compile.mjs`, `${C}/test/Mocks.sol`, `${C}/test/adapter.evm.test.ts`, 'docs/security/bnb-v113-source.diff',
  ...fs.readdirSync(EV).filter((x) => x !== 'SHA256SUMS').sort().map((x) => `${EV}/${x}`)];
fs.writeFileSync(`${EV}/SHA256SUMS`, files.map((x) => `${sha(x)}  ${x}`).join('\n') + '\n');
console.log(JSON.stringify({ ok: true, files: files.length, sourceSha256: sha(SRC), forkBlock: f.fork.block, high: 6, total: s.length }));
