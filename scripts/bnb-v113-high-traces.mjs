// Regenerates V1.13 HIGH trace evidence from Slither JSON; rejects stale V1.11/V1.12 content.
// Findings are matched by a stable key (check + function + description sans version/lines), never array position.
import fs from 'node:fs';
const EV = 'docs/security/bnb-v113-evidence';
const PATH = 'contracts/candidates/bnb-swap-adapter-v1-13/FlowBridgeBnbSwapAdapterV1_13.sol';
const src = fs.readFileSync(PATH, 'utf8').split('\n');
const highs = (f) => JSON.parse(fs.readFileSync(f, 'utf8')).results.detectors.filter((d) => d.impact === 'High');
const key = (d) => `${d.check}|${d.description.replace(/V1_1\d/g, 'V').replace(/#\d+(-\d+)?/g, '#L').replace(/\(contracts[^)]*\)/g, '()')}`;
const after = highs(`${EV}/slither-v113.json`), prior = highs(`${EV}/slither-v112.json`);
const traces = after.map((d) => {
  if (/V1_1[12]|v1-1[12]/.test(d.description)) throw Error('stale prior-version content in V1.13 trace');
  for (const e of d.elements) {
    if (e.source_mapping.filename_relative !== PATH) throw Error(`wrong path ${e.source_mapping.filename_relative}`);
    for (const l of e.source_mapping.lines) if (src[l - 1] === undefined) throw Error(`line ${l} missing`);
  }
  const fn = d.elements.find((e) => e.type === 'function');
  const lines = fn.source_mapping.lines;
  return { key: key(d), slitherId: d.id, function: fn.name, lines: [lines[0], lines.at(-1)], firstLineSnippet: src[lines[0] - 1].trim(), status: 'OPEN_STATIC_ALERT_NO_EXPLOIT_REPRODUCED', trace: d.description };
});
const priorKeys = new Set(prior.map(key));
const out = { version: 'V1.13', source: PATH, slither: '0.11.5 (all default detectors, no suppression)', highCount: traces.length, sameKeysAsV112: traces.every((t) => priorKeys.has(t.key)) && prior.length === traces.length, traces };
fs.writeFileSync(`${EV}/high-trace-v113.json`, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify({ highCount: out.highCount, sameKeysAsV112: out.sameKeysAsV112, functions: traces.map((t) => t.function) }));
