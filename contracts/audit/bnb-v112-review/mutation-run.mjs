// TG-13: real source-mutation run. Each mutant is written ONLY to /tmp, compiled by the review suite via
// V112_MUTANT_SOURCE, and must make at least one review test fail ("killed"). The frozen file is never written.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
const SRC = 'contracts/candidates/bnb-swap-adapter-v1-12/FlowBridgeBnbSwapAdapterV1_12.sol';
const original = fs.readFileSync(SRC, 'utf8');
const sha = (s) => createHash('sha256').update(s).digest('hex');
if (sha(original) !== 'feb06ff5e1e392b2264dca4f86cb40c07af2a033fbd557ea10f2e9d2e333575b') throw Error('frozen source changed');
const mutants = [
  ['M01 minNetOut==0 accepted (BNB in)', 'if (amountIn == 0 || amountIn > MAX_BNB_IN || minNetOut == 0) revert BadAmount();', 'if (amountIn == 0 || amountIn > MAX_BNB_IN) revert BadAmount();'],
  ['M02 minNetOut==0 accepted (USDT in)', 'if (amountIn == 0 || amountIn > MAX_USDT_IN || minNetOut == 0) revert BadAmount();', 'if (amountIn == 0 || amountIn > MAX_USDT_IN) revert BadAmount();'],
  ['M03 msg.value vs q.amountIn unchecked', '|| q.amountIn != amountIn) revert BadSnapshot();', ') revert BadSnapshot();'],
  ['M04 deadline==now rejected', 'if (deadline < block.timestamp) revert Expired();', 'if (deadline <= block.timestamp) revert Expired();'],
  ['M05 deadline window off-by-one', 'if (deadline > block.timestamp + MAX_DEADLINE_WINDOW)', 'if (deadline >= block.timestamp + MAX_DEADLINE_WINDOW)'],
  ['M06 deadline window removed', 'if (deadline > block.timestamp + MAX_DEADLINE_WINDOW) revert DeadlineTooFar();', ''],
  ['M07 quote age off-by-one', 'block.timestamp - q.quotedAt > MAX_QUOTE_AGE', 'block.timestamp - q.quotedAt >= MAX_QUOTE_AGE'],
  ['M08 quote age removed', '|| block.timestamp - q.quotedAt > MAX_QUOTE_AGE', ''],
  ['M09 block lag off-by-one', 'block.number - q.quoteBlock > MAX_BLOCK_LAG', 'block.number - q.quoteBlock >= MAX_BLOCK_LAG'],
  ['M10 block lag removed', '|| block.number - q.quoteBlock > MAX_BLOCK_LAG', ''],
  ['M11 blockhash binding removed', ' || blockhash(q.quoteBlock) != q.quoteBlockHash', ''],
  ['M12 fee recipient == this accepted', ' || feeRecipient == address(this)', ''],
  ['M13 non-minimal gross floor', 'return (net - 1) * BPS / (BPS - FEE_BPS) + 1;', 'return net * BPS / (BPS - FEE_BPS) + 1;'],
  ['M14 one-wei gross floor (V1.11 regression)', 'amountOutMinimum: _grossMinimum(minNetOut)', 'amountOutMinimum: 1'],
  ['M15 PauseChanged value inverted', 'emit PauseChanged(value);', 'emit PauseChanged(!value);'],
];
const results = [];
for (const [id, from, to] of mutants) {
  if (!original.includes(from)) throw Error(`pattern missing for ${id}`);
  const file = `/tmp/v112-mutant-${id.slice(0, 3)}.sol`;
  fs.writeFileSync(file, original.replace(from, to));
  const run = spawnSync('bunx', ['vitest', 'run', 'contracts/audit/bnb-v112-review/review.evm.test.ts'], { env: { ...process.env, V112_MUTANT_SOURCE: file, NO_COLOR: '1', FORCE_COLOR: '0' }, encoding: 'utf8', timeout: 300_000 });
  const text = ((run.stdout ?? '') + (run.stderr ?? '')).replace(/\x1b\[[0-9;]*m/g, '');
  const failed = Number(/Tests\s+(\d+) failed/.exec(text)?.[1] ?? 0);
  results.push({ id, mutantSha256: sha(fs.readFileSync(file)), exitCode: run.status, failedTests: failed, status: run.status !== 0 && failed > 0 ? 'KILLED' : 'SURVIVED' });
  console.log(id, results.at(-1).status, failed);
}
if (sha(fs.readFileSync(SRC, 'utf8')) !== sha(original)) throw Error('frozen source was modified');
const outFile = process.argv[2] ?? 'docs/security/bnb-v112-review-evidence/mutation-results.json';
const prev = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')).results : [];
const merged = [...prev.filter((p) => !results.some((r) => r.id === p.id)), ...results].sort((a, b) => a.id.localeCompare(b.id));
fs.mkdirSync('docs/security/bnb-v112-review-evidence', { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ tool: 'hand-written textual mutants + vitest review suite (MOCK EVM)', frozenSourceSha256: sha(original), observedAt: new Date().toISOString(), killed: merged.filter((r) => r.status === 'KILLED').length, total: merged.length, results: merged }, null, 2) + '\n');
