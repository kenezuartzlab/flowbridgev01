import fs from 'node:fs';
import path from 'node:path';
if (process.cwd().includes('/dev-server')) throw Error('Restore only in a disposable exported copy outside the application checkout');
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith('.test.ts.audit')) fs.copyFileSync(file, file.slice(0, -6));
  }
}
walk('contracts');
console.log('Restored byte-identical test filenames in disposable private export');