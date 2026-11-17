/** V1.3 fixed local read-only sustained observer. No wallet, key, signature, nonce, from/value or send method. */
import { encodeFunctionData, decodeFunctionData, decodeFunctionResult, parseAbi, keccak256, formatUnits, parseUnits, type Abi, type Hex, type Address } from 'viem';
import { mkdir, writeFile } from 'node:fs/promises';
import { BNB_ASSETS } from '../src/lib/bnb/quoteAdapter';
import { POOL_GATE as G, OFFICIAL_RPC, poolAbi, tokenAbi, quoterAbi } from '../src/lib/rwa/quoteReadiness';
import { evaluateSustained, classifyTokenSafety, type SustainedSample } from '../src/lib/bnb/sustainedCriteria';
const W = BNB_ASSETS.WBNB.address as Address, U = G.usdt as Address, X = G.xaut as Address;
const POOLS = [
  { id: 'WBNB/USDT-500', pool: '0x36696169C63e42cd08ce11f5deeBbCeBae652050' as Address, token: W, dec: 18, sellSmall: '0.01' },
  { id: 'XAUt/USDT-500 (RWA, trading pending)', pool: G.pool as Address, token: X, dec: 6, sellSmall: '0.002' },
] as const;
const TARGETS = [G.factory, G.quoter, W, U, X, ...POOLS.map(p => p.pool)].map(a => a.toLowerCase());
const SLOT_IMPL = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc', SLOT_ADMIN = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
const extraAbi = parseAbi(['function owner() view returns (address)', 'function paused() view returns (bool)']);
const METHODS = ['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call', 'eth_getStorageAt'];
const implTargets = new Set<string>();
const calls: { endpoint: string; method: string; params: unknown[]; ok: boolean; error?: string }[] = [];
const MAX_USDT = parseUnits('100', 18);
function validate(ep: string, method: string, params: unknown[]) {
  if (!(OFFICIAL_RPC as readonly string[]).includes(ep) || !METHODS.includes(method)) throw new Error('Forbidden endpoint/method');
  if (method === 'eth_chainId' || method === 'eth_blockNumber') { if (params.length) throw new Error('params'); return; }
  if (method === 'eth_getBlockByNumber') { if (params.length !== 2 || !/^0x[\da-f]+$/i.test(String(params[0])) || params[1] !== false) throw new Error('block'); return; }
  const target = String(method === 'eth_call' ? (params[0] as { to: string }).to : params[0]).toLowerCase();
  if (!TARGETS.includes(target) && !(method === 'eth_getCode' && implTargets.has(target))) throw new Error('Unknown target');
  const blk = params[params.length - 1]; if (!/^0x[\da-f]+$/i.test(String(blk))) throw new Error('Unpinned');
  if (method === 'eth_getStorageAt') { if (![W, U, X].map(a => a.toLowerCase()).includes(target) || ![SLOT_IMPL, SLOT_ADMIN].includes(String(params[1]))) throw new Error('slot'); return; }
  if (method !== 'eth_call') return;
  const call = params[0] as { to: string; data: Hex };
  if (Object.keys(call).some(k => !['to', 'data'].includes(k))) throw new Error('Forbidden call fields');
  if (target === G.quoter.toLowerCase()) {
    const d = decodeFunctionData({ abi: quoterAbi, data: call.data });
    const a = (d.args as readonly [{ tokenIn: string; tokenOut: string; amountIn: bigint; fee: number; sqrtPriceLimitX96: bigint }])[0];
    const pair = [W, X].some(t => [a.tokenIn, a.tokenOut].map(x => x.toLowerCase()).sort().join() === [t, U].map(x => x.toLowerCase()).sort().join());
    const cap = a.tokenIn.toLowerCase() === U.toLowerCase() ? MAX_USDT : a.tokenIn.toLowerCase() === W.toLowerCase() ? parseUnits('1', 18) : parseUnits('0.05', 6);
    if (d.functionName !== 'quoteExactInputSingle' || !pair || a.fee !== 500 || a.sqrtPriceLimitX96 !== 0n || a.amountIn <= 0n || a.amountIn > cap) throw new Error('Unlisted quote');
  } else {
    const sel = call.data.slice(0, 10);
    const allowed = [...[poolAbi, tokenAbi, extraAbi].flatMap(abi => (abi as Abi).filter(x => x.type === 'function').map(f => encodeFunctionData({ abi: [f], functionName: (f as { name: string }).name } as never).slice(0, 10)))];
    if (!allowed.includes(sel) || call.data.length !== 10) throw new Error('Unlisted selector');
  }
}
async function rpc(ep: typeof OFFICIAL_RPC[number], method: string, params: unknown[]) {
  validate(ep, method, params);
  const rec: typeof calls[number] = { endpoint: ep, method, params: method === 'eth_call' ? [{ to: (params[0] as { to: string }).to, selector: (params[0] as { data: string }).data.slice(0, 10) }, params[1]] : params, ok: false }; calls.push(rec);
  try {
    const r = await fetch(ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: calls.length, method, params }), signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json() as { result?: unknown; error?: { code: number; message: string } };
    if (j.error || j.result === undefined) throw new Error(j.error ? `RPC ${j.error.code}: ${j.error.message.slice(0, 80)}` : 'missing');
    rec.ok = true; return j.result;
  } catch (e) { rec.error = e instanceof Error ? e.message : 'fail'; throw e; }
}
const read = async (ep: typeof OFFICIAL_RPC[number], b: Hex, to: Address, abi: Abi, fn: string, args?: readonly unknown[]) =>
  decodeFunctionResult({ abi, functionName: fn, data: await rpc(ep, 'eth_call', [{ to, data: encodeFunctionData({ abi, functionName: fn, args } as never) }, b]) as Hex });
const quote = async (b: Hex, tin: Address, tout: Address, amt: bigint) => await read(OFFICIAL_RPC[0], b, G.quoter as Address, quoterAbi as Abi, 'quoteExactInputSingle', [{ tokenIn: tin, tokenOut: tout, amountIn: amt, fee: 500, sqrtPriceLimitX96: 0n }]) as readonly [bigint, bigint, number, bigint];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const J = (v: unknown) => JSON.stringify(v, (_, x) => typeof x === 'bigint' ? x.toString() : x, 2);
const codeHash = async (ep: typeof OFFICIAL_RPC[number], a: string, b: Hex) => { const c = await rpc(ep, 'eth_getCode', [a, b]) as Hex; return { hash: c === '0x' ? null : keccak256(c), bytes: (c.length - 2) / 2, code: c }; };

async function sampleAt(b: Hex) {
  const [h0, h1] = await Promise.all(OFFICIAL_RPC.map(ep => rpc(ep, 'eth_getBlockByNumber', [b, false]).catch(() => null))) as ({ hash: string; timestamp: Hex } | null)[];
  if (!h0) throw new Error('block unavailable');
  const codes: Record<string, string> = {};
  for (const a of TARGETS) { const c = await codeHash(OFFICIAL_RPC[0], a, b); if (!c.hash) throw new Error(`IDENTITY ABORT: no code ${a}`); codes[a] = c.hash; }
  const out: Record<string, unknown> = {}; const per: Record<string, SustainedSample> = {};
  for (const p of POOLS) {
    const [factory, t0, t1, fee, liq, slot] = await Promise.all(['factory', 'token0', 'token1', 'fee', 'liquidity', 'slot0'].map(fn => read(OFFICIAL_RPC[0], b, p.pool, poolAbi as Abi, fn))) as [string, string, string, number, bigint, readonly unknown[]];
    const pair = [t0, t1].map(x => x.toLowerCase()).sort().join() === [p.token, U].map(x => x.toLowerCase()).sort().join();
    if (factory.toLowerCase() !== G.factory.toLowerCase() || !pair || Number(fee) !== 500) throw new Error(`IDENTITY ABORT: ${p.id}`);
    const sizes = ['10', '100'].map(s => parseUnits(s, 18));
    const buys = await Promise.all(sizes.map(s => quote(b, U, p.token, s)));
    const sellMatched = await quote(b, p.token, U, buys[1][0]);
    const sellSmall = await quote(b, p.token, U, parseUnits(p.sellSmall, p.dec));
    const rate = (usdt: bigint, tok: bigint) => Number(formatUnits(usdt, 18)) / Number(formatUnits(tok, p.dec));
    const smallRate = rate(sizes[0], buys[0][0]), largeRate = rate(sizes[1], buys[1][0]);
    const sellRate = rate(sellSmall[0], parseUnits(p.sellSmall, p.dec));
    const rt = (1 - Number(formatUnits(sellMatched[0], 18)) / 100) * 10000;
    const all = [...buys, sellMatched, sellSmall];
    per[p.id] = { blockNumber: Number(BigInt(b)), blockHash: h0.hash, peerBlockHash: h1?.hash ?? null, blockTime: new Date(Number(BigInt(h0.timestamp)) * 1000).toISOString(), codeHashes: codes, liquidity: String(liq), tick: Number(slot[1]), unlocked: slot[6] === true, smallRate, largeRate, roundTripLossBps: rt, maxTicks: Math.max(...all.map(q => Number(q[2]))), maxGas: Math.max(...all.map(q => Number(q[3]))), finalHashRechecked: false };
    out[p.id] = { liquidity: String(liq), tick: Number(slot[1]), sqrtPriceX96: String(slot[0]), buy10UsdtOut: formatUnits(buys[0][0], p.dec), buy100UsdtOut: formatUnits(buys[1][0], p.dec), matchedSellUsdt: formatUnits(sellMatched[0], 18), sellSmallIn: p.sellSmall, sellSmallUsdtOut: formatUnits(sellSmall[0], 18), buyRateSmall: smallRate, buyRateLarge: largeRate, sellRateSmall: sellRate, directionalSpreadBps: (smallRate / sellRate - 1) * 10000, marginalImpactBps: (largeRate / smallRate - 1) * 10000, roundTripLossBps: rt, ticks: all.map(q => Number(q[2])), gas: all.map(q => String(q[3])) };
  }
  const fin = await rpc(OFFICIAL_RPC[0], 'eth_getBlockByNumber', [b, false]) as { hash: string };
  for (const s of Object.values(per)) s.finalHashRechecked = fin.hash === h0.hash;
  return { blockNumber: Number(BigInt(b)), blockHash: h0.hash, peerBlockHash: h1?.hash ?? null, blockTime: per[POOLS[0].id].blockTime, observedAt: new Date().toISOString(), pools: out, per };
}
const SELECTORS: Record<string, string> = { '8456cb59': 'pause()', '3f4ba83a': 'unpause()', '5c975abb': 'paused()', '0ecb93c0': 'addBlackList(address)', 'e4997dc5': 'removeBlackList(address)', 'e47d6060': 'isBlackListed(address)', 'f3bdc228': 'destroyBlackFunds(address)', '40c10f19': 'mint(address,uint256)', '42966c68': 'burn(uint256)', '3659cfe6': 'upgradeTo(address)', '4f1ef286': 'upgradeToAndCall(address,bytes)', 'f2fde38b': 'transferOwnership(address)', '8f283970': 'changeAdmin(address)', 'f9f92be4': 'blacklist(address)', 'fe575a87': 'isBlacklisted(address)', '8d1fdf2f': 'freeze(address)', '45c8b1a6': 'unfreeze(address)' };
const scan = (code: string) => Object.keys(SELECTORS).filter(s => code.toLowerCase().includes('63' + s)).map(s => SELECTORS[s]);
async function tokenSafety(b: Hex) {
  const res: Record<string, unknown> = {};
  for (const [name, t] of [['USDT', U], ['XAUt', X], ['WBNB', W]] as const) {
    const c = await codeHash(OFFICIAL_RPC[0], t, b);
    const slot = async (s: string) => { try { const v = String(await rpc(OFFICIAL_RPC[0], 'eth_getStorageAt', [t, s, b])); return '0x' + v.slice(-40); } catch { return null; } };
    const impl = await slot(SLOT_IMPL), admin = await slot(SLOT_ADMIN);
    const tryRead = async (fn: string) => { try { return await read(OFFICIAL_RPC[0], b, t, extraAbi as Abi, fn); } catch { return null; } };
    const owner = await tryRead('owner') as string | null, paused = await tryRead('paused') as boolean | null;
    let implCode: { hash: string | null; bytes: number; code: string } | null = null;
    if (impl && !/^0x0{40}$/.test(impl)) { implTargets.add(impl.toLowerCase()); implCode = await codeHash(OFFICIAL_RPC[0], impl, b); }
    const caps = [...new Set([...scan(c.code), ...(implCode ? scan(implCode.code) : [])])];
    const facts = { codePresent: c.bytes > 0, eip1967Implementation: impl, eip1967Admin: admin, pausedNow: paused, owner, capabilitySelectors: caps, verifiedSourceReviewed: false, legalReviewed: false };
    res[name] = { address: t, codeBytes: c.bytes, codeHash: c.hash, implementation: impl, implementationCodeHash: implCode?.hash ?? null, implementationBytes: implCode?.bytes ?? null, admin, owner, pausedNow: paused, bytecodeSelectorHeuristic: caps, classification: classifyTokenSafety(facts) };
  }
  return res;
}
async function main() {
  const startedAt = new Date().toISOString();
  const chains = await Promise.all(OFFICIAL_RPC.map(ep => rpc(ep, 'eth_chainId', [])));
  if (chains.some(c => Number(BigInt(c as Hex)) !== 56)) throw new Error('IDENTITY ABORT: chain');
  const head = BigInt(await rpc(OFFICIAL_RPC[0], 'eth_blockNumber', []) as Hex);
  const historical: unknown[] = [];
  for (const back of [200n, 2000n, 50000n]) {
    const b = ('0x' + (head - back).toString(16)) as Hex;
    try { const s = await sampleAt(b); historical.push({ offset: Number(back), state: 'OBSERVED', ...s, per: undefined }); }
    catch (e) { const m = e instanceof Error ? e.message : 'fail'; if (m.startsWith('IDENTITY ABORT')) throw e; historical.push({ offset: Number(back), blockNumber: Number(head - back), state: 'UNKNOWN', reason: m }); }
  }
  const live: Awaited<ReturnType<typeof sampleAt>>[] = [];
  for (let i = 0; i < 6; i++) {
    if (i) await sleep(9000);
    const b = await rpc(OFFICIAL_RPC[0], 'eth_blockNumber', []) as Hex;
    live.push(await sampleAt(b));
  }
  const evaluation = Object.fromEntries(POOLS.map(p => [p.id, evaluateSustained(live.map(l => l.per[p.id]))]));
  const tokens = await tokenSafety(('0x' + BigInt(live[live.length - 1].blockNumber).toString(16)) as Hex);
  return { schema: 1, gate: 'BNB V1.3 sustained read-only observation', startedAt, completedAt: new Date().toISOString(), chainId: 56, executionEnabled: false, nativeBnbWrapping: 'NOT_OBSERVED — WBNB ERC20 pool only; native BNB wrap/unwrap execution path not simulated', rpcSources: OFFICIAL_RPC, rpcIndependence: 'same operator; not independent quorum', historical, live: live.map(l => ({ ...l, per: undefined })), evaluation, tokens, callCount: calls.length, failedCalls: calls.filter(c => !c.ok).length, calls };
}
const out = process.argv[2] ?? '/tmp/bnb13/sustained.json';
await mkdir(out.slice(0, out.lastIndexOf('/')), { recursive: true });
try { await writeFile(out, J(await main()) + '\n'); console.log('wrote', out); }
catch (e) { await writeFile(out, J({ schema: 1, state: 'BLOCKED', reason: e instanceof Error ? e.message : 'fail', calls }) + '\n'); console.log('BLOCKED', e); }
