/**
 * V1.7 read-only route-economics sampler (chain 56, BNB<>USDT). Fixed official RPC endpoints and fixed targets only:
 * eth_chainId/eth_blockNumber/eth_getBlockByNumber/eth_getCode/eth_call/eth_gasPrice/eth_feeHistory. No state
 * overrides, no from/value, no eth_send*, no keys. Quotes are QuoterV2 eth_call simulations, NOT receipts.
 */
import { encodeFunctionData, decodeFunctionResult, keccak256, toHex, formatUnits, type Hex, type Address } from 'viem';
import fs from 'node:fs';
import { BNB_ASSETS, BNB_OBSERVED_POOLS } from '../src/lib/bnb/quoteAdapter';
import { POOL_GATE as G, OFFICIAL_RPC, factoryAbi, quoterAbi, poolAbi } from '../src/lib/rwa/quoteReadiness';
import { FEE_HYPOTHESES_BPS, platformFee, gasCostWei, weiToOutput, breakevenGrossOut, userCostBpsX100 } from '../src/lib/bnb/routeEconomics';

const W = BNB_ASSETS.WBNB.address as Address, U = G.usdt as Address;
const POOLS = (BNB_OBSERVED_POOLS as readonly { pair: string; fee: number; pool: string }[]).filter(p => p.pair === 'WBNB/USDT');
const TARGETS = [W, U, G.factory, G.quoter, G.router, ...POOLS.map(p => p.pool)].map(a => a.toLowerCase());
const METHODS = ['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call', 'eth_gasPrice', 'eth_feeHistory'];
const SIZES_USDT = [5, 25, 100, 500, 1000];
// Measured in V1.6 evidence (single block 134112945, eth_estimateGas, synthetic state overrides): NOT per-size, NOT receipts.
const GAS = { direct: 187_814n, adapter: 282_089n, source: 'docs/security/BNB_SWAP_V1_6_NATIVE_RPC_EVIDENCE_20261117.json (eth_estimateGas, state overrides, single block)' };
const calls: any[] = []; let id = 0;
async function rpc(ep: string, method: string, params: unknown[]) {
  if (!(OFFICIAL_RPC as readonly string[]).includes(ep) || !METHODS.includes(method)) throw new Error('forbidden');
  if (method === 'eth_call' || method === 'eth_getCode') {
    const c: any = params[0]; const to = String(method === 'eth_call' ? c.to : c).toLowerCase();
    if (!TARGETS.includes(to)) throw new Error('unknown target');
    if (method === 'eth_call' && (Object.keys(c).some(k => !['to', 'data'].includes(k)) || params.length !== 2)) throw new Error('no overrides/from/value');
    if (!/^0x[\da-f]+$/i.test(String(params[1]))) throw new Error('unpinned');
  }
  const at = new Date().toISOString();
  const j: any = await (await fetch(ep, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) })).json();
  calls.push({ endpoint: ep, method, at, to: method === 'eth_call' ? (params[0] as any).to : undefined, ok: !j.error, error: j.error?.message });
  return j;
}
async function main() {
  const [ep, peer] = OFFICIAL_RPC;
  if ((await rpc(ep, 'eth_chainId', [])).result !== '0x38') throw new Error('not 56');
  const head = BigInt((await rpc(ep, 'eth_blockNumber', [])).result) - 2n; const B = toHex(head);
  const blk = (await rpc(ep, 'eth_getBlockByNumber', [B, false])).result, pb = (await rpc(peer, 'eth_getBlockByNumber', [B, false])).result;
  const out: any = { generatedAt: new Date().toISOString(), scope: 'read-only eth_call quotes at one pinned block; gas from V1.6 eth_estimateGas; no receipts', endpoints: OFFICIAL_RPC, endpointsIndependent: false,
    block: { number: head.toString(), hash: blk.hash, timestamp: new Date(Number(BigInt(blk.timestamp)) * 1000).toISOString(), peerHashEqual: blk.hash === pb.hash }, gasSource: GAS };
  const call = async (to: string, data: Hex) => rpc(ep, 'eth_call', [{ to, data }, B]);
  out.codes = {};
  for (const [k, a] of Object.entries({ WBNB: W, USDT: U, factory: G.factory, quoter: G.quoter, router: G.router })) { const c = (await rpc(ep, 'eth_getCode', [a, B])).result; out.codes[k] = { address: a, keccak: keccak256(c), bytes: (c.length - 2) / 2 }; }
  out.pools = [];
  for (const p of POOLS) {
    const f = decodeFunctionResult({ abi: factoryAbi, functionName: 'getPool', data: (await call(G.factory, encodeFunctionData({ abi: factoryAbi, functionName: 'getPool', args: [W, U, p.fee] }))).result });
    const liq = decodeFunctionResult({ abi: poolAbi, functionName: 'liquidity', data: (await call(p.pool, encodeFunctionData({ abi: poolAbi, functionName: 'liquidity' }))).result });
    const c = (await rpc(ep, 'eth_getCode', [p.pool, B])).result;
    out.pools.push({ fee: p.fee, pool: p.pool, factoryMatch: String(f).toLowerCase() === p.pool.toLowerCase(), liquidity: liq.toString(), codeKeccak: keccak256(c) });
  }
  const gp = BigInt((await rpc(ep, 'eth_gasPrice', [])).result);
  const fh = (await rpc(ep, 'eth_feeHistory', ['0x5', B, [50]])).result;
  out.gas = { gasPriceWei: gp.toString(), gasPriceGwei: formatUnits(gp, 9), feeHistoryBaseFee: fh?.baseFeePerGas, feeHistoryReward50: fh?.reward };
  const quote = async (tin: Address, tout: Address, amt: bigint, fee: number) => {
    const r = await call(G.quoter, encodeFunctionData({ abi: quoterAbi, functionName: 'quoteExactInputSingle', args: [{ tokenIn: tin, tokenOut: tout, amountIn: amt, fee, sqrtPriceLimitX96: 0n }] }));
    if (r.error) return null; const d = decodeFunctionResult({ abi: quoterAbi, functionName: 'quoteExactInputSingle', data: r.result }) as any;
    return { out: d[0] as bigint, ticks: Number(d[2]), quoterGas: (d[3] as bigint).toString() };
  };
  // live reference price: 1 BNB -> USDT at the 0.05% pool (no external USD spot)
  const ref = await quote(W, U, 10n ** 18n, 500); if (!ref) throw new Error('ref quote failed');
  const usdtPerBnb = ref.out; out.reference = { usdtPerBnb: formatUnits(usdtPerBnb, 18), source: 'QuoterV2 1 WBNB->USDT fee 500 same block' };
  const extraGas = GAS.adapter - GAS.direct;
  const extraWei = gasCostWei(extraGas, gp), directWei = gasCostWei(GAS.direct, gp);
  out.extraGasCost = { gasUnits: extraGas.toString(), bnb: formatUnits(extraWei, 18), usdt: formatUnits(weiToOutput(extraWei, usdtPerBnb), 18) };
  out.breakevenUsdtGross = Object.fromEntries(FEE_HYPOTHESES_BPS.filter(b => b > 0).map(b => [`${b}bps`, formatUnits(breakevenGrossOut(b, extraGas, gp, usdtPerBnb)!, 18)]));
  out.rows = [];
  for (const p of POOLS) for (const s of SIZES_USDT) {
    const usdtIn = BigInt(s) * 10n ** 18n, bnbIn = (usdtIn * 10n ** 18n) / usdtPerBnb;
    for (const dir of ['BNB->USDT', 'USDT->BNB'] as const) {
      const q = dir === 'BNB->USDT' ? await quote(W, U, bnbIn, p.fee) : await quote(U, W, usdtIn, p.fee);
      if (!q) { out.rows.push({ dir, fee: p.fee, sizeUsdt: s, status: 'UNKNOWN' }); continue; }
      const toOut = (wei: bigint) => dir === 'BNB->USDT' ? weiToOutput(wei, usdtPerBnb) : wei; // output units
      const variants = FEE_HYPOTHESES_BPS.map(b => {
        const fee = platformFee(q.out, b), gasW = b === 0 ? directWei : directWei + extraWei; const gasOut = toOut(gasW);
        return { variant: b === 0 ? 'DIRECT_PANCAKE_V3' : `V1_6_ADAPTER_${b}bps`, fee: formatUnits(fee, 18), gasInOutput: formatUnits(gasOut, 18), net: formatUnits(q.out - fee - gasOut, 18), costVsDirectBps: b === 0 ? '0' : (Number(userCostBpsX100(q.out, fee, toOut(extraWei))) / 100).toFixed(2), platformGrossUsdtEq: formatUnits(dir === 'BNB->USDT' ? fee : (fee * usdtPerBnb) / 10n ** 18n, 18) };
      });
      out.rows.push({ dir, poolFee: p.fee, sizeUsdtEq: s, amountIn: formatUnits(dir === 'BNB->USDT' ? bnbIn : usdtIn, 18), grossOut: formatUnits(q.out, 18), ticksCrossed: q.ticks, status: 'SIMULATED_ETH_CALL', variants });
    }
  }
  out.rpcCalls = calls; out.rpcCallCount = calls.length; out.rpcFailures = calls.filter(c => !c.ok).length;
  fs.writeFileSync('docs/security/BNB_SWAP_V1_7_ECONOMICS_EVIDENCE_20261117.json', JSON.stringify(out, (_k, v) => typeof v === "bigint" ? v.toString() : v, 2));
  console.log(JSON.stringify({ block: out.block, gas: out.gas.gasPriceGwei, ref: out.reference, extra: out.extraGasCost, be: out.breakevenUsdtGross, pools: out.pools, n: out.rows.length, calls: out.rpcCallCount, fails: out.rpcFailures }, (_k, v) => typeof v === "bigint" ? v.toString() : v, 1));
  for (const r of out.rows) console.log(r.dir, r.poolFee, r.sizeUsdtEq, r.grossOut, r.variants?.map((v: any) => `${v.variant}:${v.net}(${v.costVsDirectBps})`).join(' '));
}
main().catch(e => { console.error(e); process.exit(1); });
