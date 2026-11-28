/** Source + emitted-module firewall. Executes in tooling only, never in the Worker or client. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const policyPath = 'src/lib/bnb/bnbSwapEmbargo.ts';
const endpointPath = 'src/routes/api/admin.bnb-0x-price.ts';
const archived = /(?:\/lib\/bnb\/(?!bnbSwapEmbargo(?:\.|$))|\/BnbQuoteInspection(?:\.|$)|\/contracts\/(?:candidates\/bnb-swap|audit\/bnb)|FlowBridgeBnbSwapAdapter|bnb-swap-adapter)/i;
const codeFile = /\.(?:[cm]?[jt]sx?)$/;
const excluded = /(?:\.test\.|\.spec\.|\/AGENTS\.md$|routeTree\.gen\.ts$)/;
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
function nodes(source, visit) {
  const tree = ts.createSourceFile('file.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function scan(n) { visit(n); ts.forEachChild(n, scan); }
  scan(tree);
  return tree;
}
function imports(source) {
  const out = [];
  nodes(source, n => {
    if ((ts.isImportDeclaration(n) && !n.importClause?.isTypeOnly) || ts.isExportDeclaration(n)) {
      if (n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) out.push(n.moduleSpecifier.text);
    }
    if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || n.expression.getText() === 'require')) {
      const arg = n.arguments[0];
      if (arg && ts.isStringLiteral(arg)) out.push(arg.text);
    }
  });
  return out;
}
function constant(source, name, value) {
  let matches = 0;
  nodes(source, n => {
    if (!ts.isVariableDeclaration(n) || n.name.getText() !== name || !n.initializer) return;
    let init = n.initializer;
    if (ts.isAsExpression(init)) init = init.expression;
    if (init.getText() === value && n.parent.flags & ts.NodeFlags.Const) matches++;
  });
  return matches === 1;
}
export function checkSource(root = process.cwd(), overrides = {}) {
  const read = f => overrides[f] ?? fs.readFileSync(path.join(root, f), 'utf8');
  const failures = [];
  const policy = read(policyPath);
  for (const [name, value] of Object.entries({ BNB_SWAP_PUBLICATION_EMBARGO: 'true', BNB_EXECUTION_ENABLED: 'false', LAUNCH_HOLD: 'true', BNB_SWAP_EMBARGO_REASON: "'OWNER_PAUSED_FOR_AUTOTRADE_WORKSPACE'" })) {
    if (!constant(policy, name, value)) failures.push(`Source-locked constant changed: ${name}`);
  }
  if (/\b(?:process|import\.meta|fetch|sign|sendTransaction)\b/.test(policy)) failures.push('Policy must have no runtime override or transport');
  const view = read('src/lib/swap/viewContext.ts');
  if (!/type SwapView = 677 \| 968;/.test(view) || !/PUBLIC_SWAP_VIEWS = \[677, 968\] as const/.test(view) || !/return BNB_SWAP_PUBLICATION_EMBARGO && \(value === 677 \|\| value === 968\)/.test(view)) failures.push('Public swap views must be exactly source-locked BOT 677/968');
  for (const absolute of new Set([...walk(path.join(root, 'src')), ...Object.keys(overrides).filter(f => f.startsWith('src/')).map(f => path.join(root, f))])) {
    const file = path.relative(root, absolute).replaceAll('\\', '/');
    if (!codeFile.test(file) || excluded.test(file) || file.startsWith('src/lib/bnb/') || file.endsWith('/BnbQuoteInspection.tsx')) continue;
    const source = read(file);
    if (/BnbSwap|bnb[.-]swap/i.test(file)) failures.push(`New public BNB Swap module: ${file}`);
    for (const spec of imports(source)) {
      const resolved = spec.startsWith('@/') ? 'src/' + spec.slice(2) : spec.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)) : spec;
      if (archived.test('/' + resolved)) failures.push(`Archived BNB Swap executable import: ${file} -> ${spec}`);
    }
    if (file !== endpointPath && /(?:fetch|request|axios)[\s\S]{0,100}['\"]\/api\/admin\/bnb-0x-price/.test(source)) failures.push(`Paused vendor endpoint caller: ${file}`);
    // This scope is swap-only, not BNB bridge, MultiSend, wallets or branding.
    if (file.startsWith('src/components/routetabs/swap/')) {
      nodes(source, n => {
        if (ts.isNumericLiteral(n) && n.text === '56') failures.push(`Chain 56 reintroduced into public Swap: ${file}`);
        if (ts.isStringLiteral(n) && /BNB|WBNB|bnb-0x-price/.test(n.text)) failures.push(`BNB Swap UI reintroduced: ${file}`);
      });
    }
  }
  nodes(read('src/lib/flowbridge/executionRegistry.ts'), n => {
    if (!ts.isObjectLiteralExpression(n)) return;
    const fields = new Map(n.properties.filter(ts.isPropertyAssignment).map(p => [p.name.getText(), p.initializer.getText()]));
    if (fields.get('configured') === 'true' && !['BOT_TESTNET_CHAIN_ID', 'BOT_MAINNET_CHAIN_ID'].includes(fields.get('chainId'))) failures.push('Non-BOT swap execution registry entry');
  });
  nodes(read('src/lib/swap/executionCapability.ts'), n => {
    if (!ts.isPropertyAssignment(n) || !ts.isNumericLiteral(n.name)) return;
    if (!['677', '968'].includes(n.name.text) && ts.isObjectLiteralExpression(n.initializer) && n.initializer.properties.some(p => ts.isPropertyAssignment(p) && ['router', 'nativeV3Multi', 'tokenV3Multi', 'v2CrossRouter'].includes(p.name.getText()))) failures.push('Non-BOT swap deployment/capability entry');
  });
  const picker = read('src/components/routetabs/swap/SwapChainPicker.tsx');
  if (!/const options = PUBLIC_SWAP_VIEWS;/.test(picker)) failures.push('Picker must consume canonical BOT-only views');
  const workspace = read('src/components/routetabs/swap/SwapWorkspace.tsx');
  if (!/if \(!isSwapView\(view\)\) return null;/.test(workspace) || !workspace.includes('normalizeSwapView(view, props.isMainnet)')) failures.push('Unsupported context must invalidate before execution mounts');
  const endpoint = read(endpointPath);
  if (imports(endpoint).some(s => !['@tanstack/react-router', '@/lib/bnb/bnbSwapEmbargo'].includes(s))) failures.push('Paused endpoint must not import authentication, vendor or configuration');
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
    if (!endpoint.includes(`${method}: bnbSwapGoneResponse`)) failures.push(`Paused endpoint missing ${method} tombstone`);
  }
  for (const dir of ['public', 'contracts/production']) {
    for (const f of new Set([...walk(path.join(root, dir)), ...Object.keys(overrides).filter(f => f.startsWith(dir + '/')).map(f => path.join(root, f))])) {
      if (archived.test(f) || (codeFile.test(f) || /\.json$/.test(f)) && /FlowBridgeBnbSwapAdapter|bnb-swap-adapter/.test(read(path.relative(root, f)))) failures.push(`BNB Swap deployable/public artifact: ${path.relative(root, f)}`);
    }
  }
  const pkg = JSON.parse(read('package.json'));
  for (const key of ['build', 'build:dev']) if (!pkg.scripts[key]?.includes('check-bnb-swap-embargo.mjs')) failures.push(`Missing ${key} source firewall`);
  if (!read('vite.config.ts').includes('bnbSwapEmbargoPlugin()')) failures.push('Vite must enforce firewall even when package scripts are bypassed');
  if (failures.length) throw new Error('BNB SWAP PUBLICATION EMBARGO\n' + failures.join('\n'));
  return true;
}
export function checkBundle(bundle) {
  const failures = [];
  for (const [file, entry] of Object.entries(bundle)) {
    if (entry.type !== 'chunk') {
      if (/bnb-swap-adapter|FlowBridgeBnbSwapAdapter/i.test(file)) failures.push(`Forbidden public artifact: ${file}`);
      continue;
    }
    for (const id of Object.keys(entry.modules ?? {})) if (archived.test(id.replaceAll('\\', '/'))) failures.push(`${file}: forbidden emitted module ${id}`);
    if (/FlowBridgeBnbSwapAdapter|BNB swaps coming after security approval|BNB read-only trading view|WBNB\/USDT/.test(entry.code ?? '')) failures.push(`${file}: paused Swap content emitted`);
  }
  if (failures.length) throw new Error('BNB SWAP CLIENT BUNDLE EMBARGO\n' + failures.join('\n'));
  return true;
}
export function bnbSwapEmbargoPlugin() {
  return {
    name: 'flowbridge:bnb-swap-publication-embargo', enforce: 'pre',
    buildStart() { checkSource(); },
    configureServer(server) {
      // Preview must not serve archived source by a guessed Vite /src or /@fs URL.
      server.middlewares.use((request, response, next) => {
        let url;
        try { url = decodeURIComponent((request.url ?? '').split('?')[0]); } catch { response.statusCode = 400; response.end(); return; }
        if (archived.test(url) || /\/(?:docs\/security\/(?:BNB|bnb)|scripts\/(?:bnb-|check-bnb-swap-embargo))/.test(url) || url === '/api/admin/bnb-0x-price') {
          response.statusCode = 410;
          response.setHeader('Content-Type', 'application/json');
          response.setHeader('Cache-Control', 'no-store');
          response.end(JSON.stringify({ error: 'BNB_SWAP_PAUSED', reason: 'OWNER_PAUSED_FOR_AUTOTRADE_WORKSPACE' }));
          return;
        }
        next();
      });
    },
    generateBundle(_options, bundle) {
      // Server keeps only the 410 route; all emitted graphs reject archived modules.
      for (const entry of Object.values(bundle)) if (entry.type === 'chunk') {
        for (const id of Object.keys(entry.modules ?? {})) if (archived.test(id.replaceAll('\\', '/'))) throw new Error(`BNB Swap archived module bundled: ${id}`);
      }
      if (this.environment?.name === 'client') checkBundle(bundle);
    },
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkSource();
  console.log('BNB Swap publication embargo: source PASS (Vite enforces emitted module closure)');
}
