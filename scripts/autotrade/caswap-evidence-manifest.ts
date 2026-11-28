// Offline deterministic evidence manifest, excluding itself and mutable report text.
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const directory='docs/security/caswap-correction';
const files=[...readdirSync(directory).filter(f=>f!=='manifest.json').map(f=>`${directory}/${f}`),...readdirSync('scripts/autotrade').filter(f=>f.startsWith('caswap-')).map(f=>`scripts/autotrade/${f}`)].sort();
const records=files.map(path=>{const b=readFileSync(path);return{path,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')};});
writeFileSync(`${directory}/manifest.json`,JSON.stringify({algorithm:'SHA-256',kind:'OFFLINE_READ_ONLY_AUDIT_EVIDENCE',files:records},null,2)+'\n');
console.log(`${records.length} evidence/script files hashed`);
