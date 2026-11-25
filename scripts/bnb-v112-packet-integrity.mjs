// Recompute INTEGRITY.json and SHA256SUMS for the private packet after evidence-only changes (never the source freeze).
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = 'contracts/audit/bnb-v112-external/submission';
const skip = new Set(['INTEGRITY.json', 'SHA256SUMS']);
const files = [];
(function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else { const rel = path.relative(root, f); if (!skip.has(rel)) files.push(rel); } } })(root);
files.sort();
const entries = files.map((p) => { const b = fs.readFileSync(`${root}/${p}`); return { path: p, sha256: createHash('sha256').update(b).digest('hex'), bytes: b.length }; });
fs.writeFileSync(`${root}/INTEGRITY.json`, JSON.stringify({ algorithm: 'sha256', selfExcluded: [...skip], files: entries }, null, 2) + '\n');
fs.writeFileSync(`${root}/SHA256SUMS`, entries.map((e) => `${e.sha256}  ${e.path}`).join('\n') + '\n');
console.log(`${entries.length} files inventoried`);
