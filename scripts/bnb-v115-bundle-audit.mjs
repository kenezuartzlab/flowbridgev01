// V1.15 actual-build import graph audit. Read-only; requires `bun run build` first.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CLIENT = 'dist/client/assets';
const OUT = 'docs/security/bnb-v115-evidence';
if (!fs.existsSync(CLIENT)) throw new Error('Missing dist/client/assets; run bun run build first');
const files = fs.readdirSync(CLIENT).filter((file) => file.endsWith('.js')).sort();
const source = new Map(files.map((file) => [file, fs.readFileSync(path.join(CLIENT, file), 'utf8')]));
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const local = (specifier) => specifier?.startsWith('./') ? specifier.slice(2) : null;
function importsOf(code, dynamic) {
  const found = new Set();
  const patterns = dynamic
    ? [/import\s*\(\s*["'`]([^"'`]+\.js)["'`]\s*\)/g]
    : [/(?:import|export)\s*[^;]*?from\s*["'`]([^"'`]+\.js)["'`]/g, /import\s*["'`]([^"'`]+\.js)["'`]/g];
  for (const pattern of patterns) for (const match of code.matchAll(pattern)) {
    const file = local(match[1]);
    if (file && source.has(file)) found.add(file);
  }
  return [...found].sort();
}
const graph = new Map(files.map((file) => [file, { static: importsOf(source.get(file), false), dynamic: importsOf(source.get(file), true) }]));
function closure(entries, includeDynamic) {
  const visited = new Set();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.shift();
    if (!file || visited.has(file)) continue;
    visited.add(file);
    const edges = graph.get(file);
    if (!edges) continue;
    queue.push(...edges.static, ...(includeDynamic ? edges.dynamic : []));
  }
  return [...visited].sort();
}

const manifests = fs.readdirSync('dist/server').filter((file) => file.startsWith('_tanstack-start-manifest_') && file.endsWith('.mjs'));
if (manifests.length !== 1) throw new Error(`Expected one client manifest, found ${manifests.length}`);
const manifest = fs.readFileSync(`dist/server/${manifests[0]}`, 'utf8');
const entryMatch = manifest.match(/src:\s*["']\/assets\/([^"']+\.js)["']/);
if (!entryMatch || !source.has(entryMatch[1])) throw new Error('Could not identify built client entrypoint');
const entry = entryMatch[1];
const entryStatic = closure([entry], false);
const entryAll = closure([entry], true);
const wcConnectorChunks = files.filter((file) => source.get(file).includes('dependency "@walletconnect/ethereum-provider" not found'));
const wcSdkEntries = [...new Set(wcConnectorChunks.flatMap((file) => graph.get(file).dynamic))].sort();
if (wcConnectorChunks.length === 0 || wcSdkEntries.length === 0) throw new Error('WalletConnect dynamic SDK edge not found; inspect build manually');
const wcSdkStatic = closure(wcSdkEntries, false);
const wcSdkAll = closure(wcSdkEntries, true);
const reownSchemaChunks = files.filter((file) => /W3mFrame|APP_EVENT|FRAME_READY/.test(source.get(file)));
const cdpChunks = files.filter((file) => /@coinbase\/cdp-sdk|Coinbase CDP|CDP SDK/.test(source.get(file)));
const patchedZod4Chunks = files.filter((file) => source.get(file).includes('safeint') && source.get(file).includes('_zod.def'));
const sdkInEntry = wcSdkEntries.filter((file) => entryStatic.includes(file));
const reownSchemaInEntry = reownSchemaChunks.filter((file) => entryStatic.includes(file));
if (sdkInEntry.length || reownSchemaInEntry.length) throw new Error(`WalletConnect SDK/schema leaked into static entry: ${[...sdkInEntry, ...reownSchemaInEntry].join(', ')}`);
if (!reownSchemaChunks.every((file) => wcSdkAll.includes(file))) throw new Error('Reown schema chunk is outside the SDK dynamic closure; manual review required');

const report = {
  schema: 'flowbridge-bnb-v115-bundle-graph-v1',
  buildEntry: entry,
  buildEntrySha256: sha256(source.get(entry)),
  clientJsFiles: files.length,
  entryStaticFileCount: entryStatic.length,
  entryStaticIncludesWalletConnectSdk: false,
  entryStaticIncludesReownZod3Schemas: false,
  walletConnectSecurityHoldRequired: true,
  walletConnectAdvisoryStatus: 'OPEN_INSTALLED_NOT_PATCHED',
  coinbaseZod32576Status: 'INSTALLED_VIA_WAGMI_BASE_ACCOUNT_NO_CDP_CLIENT_CHUNK_FOUND',
  wcConnectorChunks,
  wcConnectorChunksEagerInEntry: wcConnectorChunks.filter((file) => entryStatic.includes(file)),
  wcSdkEntries,
  wcSdkStaticFileCount: wcSdkStatic.length,
  wcSdkDynamicClosureFileCount: wcSdkAll.length,
  reownSchemaChunks,
  reownSchemaChunksDynamicOnly: reownSchemaChunks.every((file) => !entryStatic.includes(file) && entryAll.includes(file)),
  patchedZod4ChunksInEntry: patchedZod4Chunks.filter((file) => entryStatic.includes(file)),
  cdpChunks,
  dynamicReachableFileCount: entryAll.length,
  entryStaticFiles: entryStatic,
  wcSdkStaticFiles: wcSdkStatic,
  note: 'The eager wagmi connector wrapper and disabled flag strings are not the vulnerable SDK. The Reown/W3m schema path and SDK are dynamic-only in this build. This does not patch or remove installed Zod 3.22.4; global security hold remains mandatory.',
};
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/bundle-import-graph.json`, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, entryStaticFiles: undefined, wcSdkStaticFiles: undefined }, null, 2));
