/**
 * V1.5 local read-only native BNB feasibility. Uses ONLY eth_call with ephemeral state overrides on
 * SYNTHETIC addresses (no real wallet, key, signature, nonce or eth_send*). Nothing is broadcast; overrides
 * exist only inside the node's simulation. Fixed endpoints/targets; candidate code is injected at a synthetic address.
 */
import { encodeFunctionData, decodeFunctionResult, parseAbi, keccak256, encodeAbiParameters, pad, toHex, formatUnits, type Hex, type Address } from 'viem';
import fs from 'node:fs';
import { BNB_ASSETS } from '../src/lib/bnb/quoteAdapter';
import { POOL_GATE as G, OFFICIAL_RPC } from '../src/lib/rwa/quoteReadiness';
// @ts-expect-error local mjs
import { compile } from '../contracts/candidates/bnb-swap-adapter-v1-5/scripts/compile.mjs';

const W = BNB_ASSETS.WBNB.address as Address, U = G.usdt as Address, R = G.router as Address;
const SYN_USER = '0x000000000000000000000000000000000f1b0001' as Address; // synthetic, no key exists
const SYN_ADAPTER = '0x000000000000000000000000000000000f1b00ad' as Address;
const SYN_FEE = '0x000000000000000000000000000000000f1b00fe' as Address;
const TARGETS = [W, U, R, SYN_ADAPTER, G.xaut].map(a => a.toLowerCase());
const METHODS = ['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call', 'eth_estimateGas'];
const MAX_VALUE = 10n ** 16n; // 0.01 BNB simulated value cap
const calls: any[] = [];
let id = 0;
async function rpc(ep: string, method: string, params: unknown[]) {
  if (!(OFFICIAL_RPC as readonly string[]).includes(ep) || !METHODS.includes(method)) throw new Error('forbidden method');
  if (method === 'eth_getCode' || method === 'eth_call' || method === 'eth_estimateGas') {
    const to = String(method !== 'eth_getCode' ? (params[0] as any).to : params[0]).toLowerCase();
    if (!TARGETS.includes(to)) throw new Error('unknown target');
    if (!/^0x[\da-f]+$/i.test(String(params[1]))) throw new Error('unpinned');
    if (method === 'eth_call' || method === 'eth_estimateGas') {
      const c = params[0] as any; if (c.from && c.from.toLowerCase() !== SYN_USER.toLowerCase()) throw new Error('only synthetic from');
      if (c.value && BigInt(c.value) > MAX_VALUE) throw new Error('value cap');
      const ov = (params[2] ?? {}) as Record<string, unknown>;
      if (Object.keys(ov).some(a => ![SYN_USER, SYN_ADAPTER, W, U].map(x => x.toLowerCase()).includes(a.toLowerCase()))) throw new Error('override target');
    }
  }
  const t0 = new Date().toISOString();
  const res = await fetch(ep, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
  const j: any = await res.json();
  const rec = { endpoint: ep, method, at: t0, params: (method === 'eth_call' || method === 'eth_estimateGas') ? [{ ...(params[0] as any), data: String((params[0] as any).data).slice(0, 138) + '…' }, params[1], params[2] ? Object.fromEntries(Object.entries(params[2] as any).map(([k, v]: any) => [k, { ...v, code: v.code ? `keccak:${keccak256(v.code)}` : undefined }])) : undefined] : params, ok: !j.error, error: j.error?.message, result: method === 'eth_getCode' ? (j.result ? `keccak:${keccak256(j.result)} bytes:${(j.result.length - 2) / 2}` : null) : j.result };
  calls.push(rec); return j;
}
const wAbi = parseAbi(['function deposit() payable', 'function withdraw(uint256)', 'function balanceOf(address) view returns (uint256)']);
const rAbi = parseAbi(['function WETH9() view returns (address)', 'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)', 'function refundETH() payable']);
const uAbi = parseAbi(['function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)']);
const slot = (key: Address, idx: bigint) => keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [key, idx]));
const slot2 = (o: Address, s: Address, idx: bigint) => keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [s, slot(o, idx)]));
const word = (v: bigint) => pad(toHex(v), { size: 32 });

const art = compile()['FlowBridgeBnbSwapAdapterV1_5.sol'].FlowBridgeBnbSwapAdapterV1_5;
function patchedRuntime(feeBps: number) {
  let code = art.evm.deployedBytecode.object as string;
  const ids: Record<string, string> = {};
  for (const n of art.abi) void n;
  // map immutable AST ids to names via storageLayout-free approach: order of declaration in source
  const names = ['WBNB', 'USDT', 'ROUTER', 'POOL_FEE', 'FEE_RECIPIENT', 'FEE_BPS'];
  const vals: Record<string, bigint> = { WBNB: BigInt(W), USDT: BigInt(U), ROUTER: BigInt(R), POOL_FEE: 500n, FEE_RECIPIENT: BigInt(SYN_FEE), FEE_BPS: BigInt(feeBps) };
  const refs = Object.entries(art.evm.deployedBytecode.immutableReferences as Record<string, { start: number; length: number }[]>).sort((a, b) => Number(a[0]) - Number(b[0]));
  if (refs.length !== names.length) throw new Error('immutable mapping changed');
  refs.forEach(([k], i) => { ids[k] = names[i]; });
  for (const [k, list] of refs) for (const { start, length } of list) { const hex = word(vals[ids[k]]).slice(2); code = code.slice(0, start * 2) + hex + code.slice(start * 2 + length * 2); }
  return `0x${code}` as Hex;
}

async function main() {
  const out: any = { generatedAt: new Date().toISOString(), scope: 'read-only eth_call simulation with ephemeral state overrides on synthetic addresses; no transaction, signature or key', endpoints: OFFICIAL_RPC, results: {} };
  const [ep, peer] = OFFICIAL_RPC;
  const chain = (await rpc(ep, 'eth_chainId', [])).result; if (chain !== '0x38') throw new Error('not chain 56');
  const head = BigInt((await rpc(ep, 'eth_blockNumber', [])).result) - 2n; const B = toHex(head);
  const blk = (await rpc(ep, 'eth_getBlockByNumber', [B, false])).result; const peerBlk = (await rpc(peer, 'eth_getBlockByNumber', [B, false])).result;
  out.block = { number: head.toString(), hash: blk.hash, timestamp: new Date(Number(BigInt(blk.timestamp)) * 1000).toISOString(), peerHashEqual: blk.hash === peerBlk.hash };
  const ts = BigInt(blk.timestamp);
  // bytecode identity vs Sourcify-verified on-chain bytecode (archived separately)
  const src = JSON.parse(fs.readFileSync('docs/security/BNB_SWAP_V1_4_SOURCE_ARCHIVE_20261117.json', 'utf8'));
  out.results.codeIdentity = {};
  for (const [label, a] of [['WBNB', W], ['USDT', U], ['PancakeV3SwapRouter', R]] as const) {
    const code = (await rpc(ep, 'eth_getCode', [a, B])).result as Hex;
    out.results.codeIdentity[label] = { liveKeccak: keccak256(code), sourcifyOnchainKeccak: src.contracts[label].onchainRuntimeKeccak, match: keccak256(code) === src.contracts[label].onchainRuntimeKeccak };
  }
  const call = (to: Address, data: Hex, extra: any = {}, ov?: any, e = ep) => rpc(e, 'eth_call', ov ? [{ to, data, ...extra }, B, ov] : [{ to, data, ...extra }, B]);
  const weth = await call(R, encodeFunctionData({ abi: rAbi, functionName: 'WETH9' }));
  out.results.routerWETH9 = { value: weth.result, equalsWBNB: weth.result?.toLowerCase().endsWith(W.slice(2).toLowerCase()) };
  const V = 10n ** 16n; const fund = { [SYN_USER]: { balance: toHex(10n ** 18n) } };
  const dep = await call(W, encodeFunctionData({ abi: wAbi, functionName: 'deposit' }), { from: SYN_USER, value: toHex(V) }, fund);
  out.results.wbnbDepositPayable = { ok: !dep.error, error: dep.error?.message ?? null };
  const wd = await call(W, encodeFunctionData({ abi: wAbi, functionName: 'withdraw', args: [V] }), { from: SYN_USER }, { [W]: { stateDiff: { [slot(SYN_USER, 3n)]: word(V) } } });
  out.results.wbnbWithdrawWithBalance = { ok: !wd.error, error: wd.error?.message ?? null };
  const wdNo = await call(W, encodeFunctionData({ abi: wAbi, functionName: 'withdraw', args: [V] }), { from: SYN_USER });
  out.results.wbnbWithdrawWithoutBalanceReverts = { reverted: !!wdNo.error };
  const p = (tokenIn: Address, tokenOut: Address, amountIn: bigint, recipient: Address) => ({ tokenIn, tokenOut, fee: 500, recipient, deadline: ts + 60n, amountIn, amountOutMinimum: 1n, sqrtPriceLimitX96: 0n });
  const rNat = await call(R, encodeFunctionData({ abi: rAbi, functionName: 'exactInputSingle', args: [p(W, U, V, SYN_USER)] }), { from: SYN_USER, value: toHex(V) }, fund);
  const routerOut = rNat.result ? BigInt(rNat.result) : null;
  out.results.routerNativeExactInputSingle = { ok: !rNat.error, usdtOut: routerOut === null ? null : formatUnits(routerOut, 18), error: rNat.error?.message ?? null, note: 'router wraps msg.value via pay(); excess msg.value would remain in router and is publicly refundable via refundETH — candidate does not use this path' };
  const rExcess = await call(R, encodeFunctionData({ abi: rAbi, functionName: 'exactInputSingle', args: [p(W, U, V / 2n, SYN_USER)] }), { from: SYN_USER, value: toHex(V) }, fund);
  out.results.routerExcessValueNotRefundedInSameCall = { ok: !rExcess.error, note: 'succeeds while 0.005 BNB stays in router (requires multicall refundETH); demonstrates residual hazard' };
  for (const bps of [10, 5]) {
    const ov = { ...fund, [SYN_ADAPTER]: { code: patchedRuntime(bps), stateDiff: { [word(0n)]: word(1n) } } };
    const aAbi = art.abi;
    const buy = await call(SYN_ADAPTER, encodeFunctionData({ abi: aAbi, functionName: 'swapExactBnbForUsdt', args: [1n, ts + 60n] }), { from: SYN_USER, value: toHex(V) }, ov);
    const net = buy.result ? (decodeFunctionResult({ abi: aAbi, functionName: 'swapExactBnbForUsdt', data: buy.result }) as bigint) : null;
    const expectedNet = routerOut === null ? null : routerOut - routerOut * BigInt(bps) / 10000n;
    const usdtAmt = 10n * 10n ** 18n;
    const sellOv = { ...ov, [U]: { stateDiff: { [slot(SYN_USER, 1n)]: word(usdtAmt), [slot2(SYN_USER, SYN_ADAPTER, 2n)]: word(usdtAmt) } } };
    const bal = await call(U, encodeFunctionData({ abi: uAbi, functionName: 'balanceOf', args: [SYN_USER] }), {}, sellOv);
    const sell = await call(SYN_ADAPTER, encodeFunctionData({ abi: aAbi, functionName: 'swapExactUsdtForBnb', args: [usdtAmt, 1n, ts + 60n] }), { from: SYN_USER }, sellOv);
    const sNet = sell.result ? (decodeFunctionResult({ abi: aAbi, functionName: 'swapExactUsdtForBnb', data: sell.result }) as bigint) : null;
    const tooHigh = await call(SYN_ADAPTER, encodeFunctionData({ abi: aAbi, functionName: 'swapExactBnbForUsdt', args: [routerOut ?? 1n, ts + 60n] }), { from: SYN_USER, value: toHex(V) }, ov);
    const expired = await call(SYN_ADAPTER, encodeFunctionData({ abi: aAbi, functionName: 'swapExactBnbForUsdt', args: [1n, ts - 1n] }), { from: SYN_USER, value: toHex(V) }, ov);
    const far = await call(SYN_ADAPTER, encodeFunctionData({ abi: aAbi, functionName: 'swapExactBnbForUsdt', args: [1n, ts + 10_000n] }), { from: SYN_USER, value: toHex(V) }, ov);
    const xaut = await call(SYN_ADAPTER, '0x9a8a0592' as Hex, { from: SYN_USER }, sellOv); // unknown selector (no sweep/arbitrary call surface)

    const exactMin = await call(SYN_ADAPTER, encodeFunctionData({ abi: aAbi, functionName: 'swapExactBnbForUsdt', args: [net ?? 1n, ts + 60n] }), { from: SYN_USER, value: toHex(V) }, ov);
    const exactMinPlus1 = await call(SYN_ADAPTER, encodeFunctionData({ abi: aAbi, functionName: 'swapExactBnbForUsdt', args: [(net ?? 0n) + 1n, ts + 60n] }), { from: SYN_USER, value: toHex(V) }, ov);
    const gasAdapter = await rpc(ep, 'eth_estimateGas', [{ to: SYN_ADAPTER, from: SYN_USER, value: toHex(V), data: encodeFunctionData({ abi: aAbi, functionName: 'swapExactBnbForUsdt', args: [1n, ts + 60n] }) }, B, ov]);
    const gasDirect = await rpc(ep, 'eth_estimateGas', [{ to: R, from: SYN_USER, value: toHex(V), data: encodeFunctionData({ abi: rAbi, functionName: 'exactInputSingle', args: [p(W, U, V, SYN_USER)] }) }, B, fund]);
    const feeWbnbOv = { ...sellOv }; void feeWbnbOv;
    out.results[`candidate_${bps}bps_extra`] = { minEqualsExactNetPasses: !exactMin.error, minExactNetPlus1Rejected: !!exactMinPlus1.error,
      gasEstimate: { adapter: gasAdapter.result ? BigInt(gasAdapter.result).toString() : `UNKNOWN (${gasAdapter.error?.message})`, directRouterNative: gasDirect.result ? BigInt(gasDirect.result).toString() : `UNKNOWN (${gasDirect.error?.message})` } };
    out.results[`candidate_${bps}bps`] = {
      bnbToUsdt: { ok: !buy.error, netUsdt: net === null ? null : formatUnits(net, 18), expectedNetFromRouterSim: expectedNet === null ? null : formatUnits(expectedNet, 18), exactMatch: net !== null && net === expectedNet, error: buy.error?.message ?? null },
      usdtOverrideBalanceCheck: bal.result ? formatUnits(BigInt(bal.result), 18) : null,
      usdtToBnb: { ok: !sell.error, netBnb: sNet === null ? null : formatUnits(sNet, 18), error: sell.error?.message ?? null },
      minNetEqualGrossRejected: !!tooHigh.error, expiredRejected: !!expired.error, deadlineTooFarRejected: !!far.error, nonAbiCalldataRejected: !!xaut.error,
    };
  }
  const finalHash = (await rpc(ep, 'eth_getBlockByNumber', [B, false])).result.hash;
  out.block.finalHashEqual = finalHash === blk.hash;
  out.calls = calls; out.callCount = calls.length; out.failedCalls = calls.filter(c => !c.ok).length;
  fs.writeFileSync('docs/security/BNB_SWAP_V1_5_NATIVE_RPC_EVIDENCE_20261117.json', JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify({ block: out.block, results: out.results, callCount: out.callCount, failed: out.failedCalls }, null, 1));
}
main().catch(e => { console.error(e); process.exit(1); });
