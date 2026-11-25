// EV-01: regenerate HIGH trace review strictly from the V1.12 Slither "after" run and the frozen V1.12 source.
// Fails on any stale version, wrong path, line drift, or snippet mismatch. The V1.11 "before" traces are kept
// separately and labelled. No detector is suppressed; dispositions remain OPEN pending independent audit.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const EV = 'docs/security/bnb-v112-evidence';
const PATH = 'contracts/candidates/bnb-swap-adapter-v1-12/FlowBridgeBnbSwapAdapterV1_12.sol';
const src = fs.readFileSync(PATH, 'utf8'); const lines = src.split('\n');
const sha = createHash('sha256').update(src).digest('hex');
if (sha !== 'feb06ff5e1e392b2264dca4f86cb40c07af2a033fbd557ea10f2e9d2e333575b') throw Error('frozen source changed');
const after = JSON.parse(fs.readFileSync(`${EV}/slither-after.json`, 'utf8'));
const before = JSON.parse(fs.readFileSync(`${EV}/slither-before.json`, 'utf8'));
const old = JSON.parse(fs.readFileSync(`${EV}/high-trace-review.json`, 'utf8'));
const highs = (s) => s.results.detectors.filter((d) => d.impact === 'High');
const norm = (s) => s.replace(/\s+/g, '');
// Dispositions are matched by (function, external call, stale balance variable), never by array position:
// Slither orders findings differently between runs.
const keyOf = (t) => { const f = /in \S+\.(\w+)\(/.exec(t)?.[1]; const c = t.split('External call allowing reentrancy:')[1]?.split('\n')[1]?.trim().split('(')[0]; const b = /Balance read before the call:\n\t- (\w+)/.exec(t)?.[1]; if (!f || !c || !b) throw Error('unparseable trace'); return `${f}|${c}|${b}`; };
const traces = highs(after).map((d, i) => {
  if (/V1_11|v1-11|amountOutMinimum:1\b/.test(d.description)) throw Error(`stale V1.11 content in after finding ${i}`);
  const elements = d.elements.map((e) => {
    const sm = e.source_mapping;
    if (sm.filename_relative !== PATH) throw Error(`wrong path ${sm.filename_relative}`);
    const snippet = sm.lines.map((n) => lines[n - 1]).join('\n');
    const raw = src.slice(sm.start, sm.start + sm.length);
    if (!snippet.includes(raw.split('\n')[0].trim())) throw Error(`snippet/offset mismatch for ${e.name}`);
    if (e.type === 'node' && !norm(src).includes(norm(e.name).replace(/\{value:amountIn\}/, '{value:amountIn}'))) {
      // Slither prints normalized expressions; require the call target token to appear on the cited line.
      const key = (e.name.match(/(_swap|_safeTransferFrom|deposit|exactInputSingle|balanceOf|t\.call|got != gross|!= amountIn|!= gross|!= netOut|netOut < minNetOut)/) ?? [])[0];
      if (!key || !snippet.replace(/\s+/g, ' ').includes(key)) throw Error(`expression not on cited line: ${e.name}`);
    }
    return { type: e.type, name: e.name, lines: sm.lines, code: snippet.trim() };
  });
  const prior = (old.version === 'V1.12' ? old.traces : old.traces).filter((t) => keyOf(t.trace) === keyOf(d.description));
  if (prior.length !== 1) throw Error(`disposition match not unique for ${keyOf(d.description)}`);
  const disposition = prior[0];
  return { id: `V112-H${i + 1}`, detector: d.check, slitherId: d.id, contract: 'FlowBridgeBnbSwapAdapterV1_12', path: PATH, firstElement: d.first_markdown_element,
    status: 'HIGH_OPEN_PENDING_INDEPENDENT_AUDIT', trace: d.description, elements,
    balancePath: disposition.balancePath, targetedEvidence: disposition.targetedEvidence, tests: disposition.tests, exploitPreconditions: disposition.exploitPreconditions, assumptions: disposition.assumptions };
});
const routerFloorCited = traces.some((t) => /_grossMinimum\(minNetOut\)/.test(t.trace));
if (!routerFloorCited) throw Error('V1.12 router floor not present in regenerated traces');
const out = { version: 'V1.12', regeneratedFrom: `${EV}/slither-after.json`, sourcePath: PATH, sourceSha256: sha, highAfter: traces.length, highBefore: highs(before).length, suppressed: 0,
  professionalAudit: 'NOT_DONE', note: 'Self-review dispositions only. Not an independent audit. Correction of EV-01: previous file embedded V1.11 trace text.', traces };
fs.writeFileSync(`${EV}/high-trace-review.json`, JSON.stringify(out, null, 2) + '\n');
if (!fs.existsSync(`${EV}/high-trace-before-v111.json`)) {
  fs.writeFileSync(`${EV}/high-trace-before-v111.json`, JSON.stringify({ version: 'V1.11 (BEFORE baseline, labelled)', source: 'contracts/candidates/bnb-swap-adapter-v1-11/FlowBridgeBnbSwapAdapterV1_11.sol', regeneratedFrom: `${EV}/slither-before.json`, supersededFile: 'previous high-trace-review.json (mislabelled V1.12, actually V1.11 text)', traces: highs(before).map((d, i) => ({ id: `V111-H${i + 1}`, slitherId: d.id, trace: d.description })) }, null, 2) + '\n');
}
console.log(`regenerated ${traces.length} V1.12 HIGH traces`);
