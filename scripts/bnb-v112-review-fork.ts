/**
 * TG-12 V1.12 review fork evidence. LOCAL Anvil fork only (127.0.0.1:8548) with real chain-56 WBNB/USDT/
 * Pancake V3 bytecode; candidate deployed only locally from Anvil's unlocked synthetic accounts.
 * No key, signature or mainnet transaction. Upstream RPC is read-only and NOT an independent quorum.
 * Run: nix shell nixpkgs#foundry -c bun scripts/bnb-v112-review-fork.ts
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createPublicClient, createTestClient, decodeFunctionResult, defineChain, encodeAbiParameters, encodeDeployData, encodeFunctionData, http, keccak256, pad, parseAbi, parseEventLogs, toHex, type Address, type Hex } from 'viem';
import { OFFICIAL_RPC, POOL_GATE as G, quoterAbi, poolAbi, factoryAbi } from '../src/lib/rwa/quoteReadiness';
// @ts-expect-error local JS compiler module
import { compile } from '../contracts/candidates/bnb-swap-adapter-v1-12/scripts/compile.mjs';

const OUT = 'docs/security/bnb-v112-review-evidence/fork-review.json';
const W = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as Address, U = G.usdt as Address, R = G.router as Address;
const USER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address, OTHER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address, MOVER = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as Address;
const FEE = '0x000000000000000000000000000000000f1b00fe' as Address, E = 10n ** 18n, LOCAL = 'http://127.0.0.1:8548';
const chain = defineChain({ id: 56, name: 'Local BNB fork only', nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }, rpcUrls: { default: { http: [LOCAL] } } });
const pc = createPublicClient({ chain, transport: http(LOCAL, { timeout: 30_000 }) }) as any;
const tc = createTestClient({ chain, mode: 'anvil', transport: http(LOCAL, { timeout: 30_000 }) }) as any;
const A = compile()['FlowBridgeBnbSwapAdapterV1_12.sol'].FlowBridgeBnbSwapAdapterV1_12;
const erc = parseAbi(['function balanceOf(address) view returns (uint256)', 'function approve(address,uint256) returns (bool)', 'function deposit() payable']);
const routerAbi = parseAbi(['function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256)']);
const ev: any = { generatedAt: new Date().toISOString(), scope: 'LOCAL_ANVIL_FORK_ONLY_NOT_MAINNET', mainnetTransactions: 0, signatures: 0, independentAudit: 'NOT_DONE', release: 'HOLD',
  client: 'anvil (foundry) fork of BSC state; not a BSC validator client; archive/historical state not required (latest-20 fork)', rpcProvenance: { upstream: OFFICIAL_RPC[0], independence: 'SINGLE_OPERATOR_NOT_QUORUM' }, checks: {}, localTransactions: [] };
let anvil: ChildProcess | undefined;
const word = (v: bigint) => pad(toHex(v), { size: 32 });
const slot = (o: Address, i: bigint) => keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [o, i]));
const nested = (o: Address, s: Address, i: bigint) => keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [s, slot(o, i)]));
async function send(from: Address, data: Hex, to?: Address, value = 0n, label = '') {
  const hash = await pc.request({ method: 'eth_sendTransaction', params: [{ from, ...(to ? { to } : {}), data, value: toHex(value), gas: toHex(8_000_000n) }] });
  const rc = await pc.waitForTransactionReceipt({ hash, timeout: 30_000 });
  ev.localTransactions.push({ scope: 'LOCAL_ONLY', label, hash, status: rc.status, gasUsed: rc.gasUsed.toString() });
  return rc;
}
const bal = (t: Address, o: Address) => pc.readContract({ address: t, abi: erc, functionName: 'balanceOf', args: [o] }) as Promise<bigint>;
async function quote(tokenIn: Address, tokenOut: Address, amountIn: bigint, fee: number) {
  const { data } = await pc.call({ to: G.quoter, data: encodeFunctionData({ abi: quoterAbi, functionName: 'quoteExactInputSingle', args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }] }) });
  return decodeFunctionResult({ abi: quoterAbi, functionName: 'quoteExactInputSingle', data }) as readonly [bigint, bigint, number, bigint];
}
async function snap(sell: boolean, amountIn: bigint, minNetOut: bigint, tier: number) {
  const latest = await pc.getBlock(); const prev = await pc.getBlock({ blockNumber: latest.number - 1n });
  return { user: USER, chainId: 56n, tokenIn: sell ? U : W, tokenOut: sell ? W : U, router: R, poolFee: tier, amountIn, minNetOut, deadline: latest.timestamp + 60n, quotedAt: latest.timestamp, quoteBlock: prev.number, quoteBlockHash: prev.hash };
}
const swapData = async (sell: boolean, amt: bigint, min: bigint, tier: number) => encodeFunctionData({ abi: A.abi, functionName: sell ? 'swapExactUsdtForBnb' : 'swapExactBnbForUsdt', args: [await snap(sell, amt, min, tier)] });

async function main() {
  const head = await fetch(OFFICIAL_RPC[0], { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }), signal: AbortSignal.timeout(10_000) }).then((r) => r.json());
  const forkBlock = Number(BigInt(head.result)) - 20; ev.fork = { block: forkBlock };
  anvil = spawn('anvil', ['--fork-url', OFFICIAL_RPC[0], '--fork-block-number', String(forkBlock), '--chain-id', '56', '--host', '127.0.0.1', '--port', '8548', '--silent'], { stdio: 'ignore' });
  for (let i = 0; i < 150; i++) { try { if (await pc.getChainId() === 56) break; } catch { /* starting */ } await new Promise((r) => setTimeout(r, 100)); }
  const pinned = await pc.getBlock({ blockNumber: BigInt(forkBlock) }); ev.fork.blockHash = pinned.hash; ev.fork.timestamp = pinned.timestamp.toString();
  for (const [n, a] of [['WBNB', W], ['USDT', U], ['ROUTER', R]] as const) { const c = await pc.getCode({ address: a }); if (!c || c === '0x') throw Error(`${n} code missing`); ev.fork[`${n}CodeKeccak`] = keccak256(c); }
  ev.pools = [];
  for (const tier of [500, 2500]) { const pool = await pc.readContract({ address: G.factory, abi: factoryAbi, functionName: 'getPool', args: [W, U, tier] }); const liq = await pc.readContract({ address: pool, abi: poolAbi, functionName: 'liquidity' }); ev.pools.push({ tier, pool, liquidity: liq.toString() }); }
  const dep = await send(USER, encodeDeployData({ abi: A.abi, bytecode: `0x${A.evm.bytecode.object}`, args: [OTHER, FEE, 5] }), undefined, 0n, 'local candidate deploy');
  const adapter = dep.contractAddress as Address; ev.localCandidate = { address: adapter, deployment: 'LOCAL_FORK_ONLY_NOT_MAINNET' };
  await tc.setStorageAt({ address: U, index: slot(USER, 1n), value: word(10_000n * E) });
  await tc.setStorageAt({ address: U, index: nested(USER, adapter, 2n), value: word(10_000n * E) });

  // Quoter parity: QuoterV2 eth_call gross vs adapter-measured gross on identical state, both tiers/directions.
  ev.checks.quoterParity = [];
  for (const tier of [500, 2500]) for (const sell of [false, true]) {
    const amt = sell ? 5n * E : E / 100n; const [qGross] = await quote(sell ? U : W, sell ? W : U, amt, tier);
    const net = qGross - qGross * 5n / 10000n;
    const rc = await send(USER, await swapData(sell, amt, net, tier), adapter, sell ? 0n : amt, `parity ${tier} ${sell ? 'USDT->BNB' : 'BNB->USDT'}`);
    const e = parseEventLogs({ abi: A.abi, logs: rc.logs }).find((x: any) => x.eventName === 'Swapped') as any;
    ev.checks.quoterParity.push({ tier, direction: sell ? 'USDT->BNB' : 'BNB->USDT', amountIn: amt.toString(), quoterGross: qGross.toString(), adapterGross: e?.args.grossOut.toString(), exact: e?.args.grossOut === qGross, status: rc.status });
  }
  // Price move between quote and execution: a large direct router swap by MOVER drops output; the stale net floor must revert.
  {
    const amt = E / 100n; const [qGross] = await quote(W, U, amt, 500); const net = qGross - qGross * 5n / 10000n; const pending = await swapData(false, amt, net, 500);
    const big = 200n * E; await send(MOVER, encodeFunctionData({ abi: erc, functionName: 'deposit' }), W, big, 'mover wrap');
    await send(MOVER, encodeFunctionData({ abi: erc, functionName: 'approve', args: [R, big] }), W, 0n, 'mover approve');
    const t = (await pc.getBlock()).timestamp + 60n;
    await send(MOVER, encodeFunctionData({ abi: routerAbi, functionName: 'exactInputSingle', args: [{ tokenIn: W, tokenOut: U, fee: 500, recipient: MOVER, deadline: t, amountIn: big, amountOutMinimum: 1n, sqrtPriceLimitX96: 0n }] }), R, 0n, 'mover price move');
    const [after] = await quote(W, U, amt, 500); const before = await bal(U, USER);
    let reverted = false; try { await pc.call({ account: USER, to: adapter, data: pending, value: amt }); } catch { reverted = true; }
    const fresh = await swapData(false, amt, net, 500); let freshReverted = false; try { await pc.call({ account: USER, to: adapter, data: fresh, value: amt }); } catch { freshReverted = true; }
    ev.checks.priceMove = { quotedGross: qGross.toString(), grossAfterMove: after.toString(), netFloor: net.toString(), staleSnapshotReverted: reverted, refreshedSnapshotSameFloorReverted: freshReverted, userBalanceUnchanged: (await bal(U, USER)) === before, note: 'Net floor, not snapshot freshness, provides the price protection (AF-01).' };
  }
  // Thin 2500 pool: impact at the 1 BNB candidate cap versus a 0.001 BNB reference.
  ev.checks.tierDepth = [];
  for (const tier of [500, 2500]) { const [small] = await quote(W, U, E / 1000n, tier); const [cap] = await quote(W, U, E, tier); const impactBps = Number(((small * 1000n - cap) * 10000n) / (small * 1000n)); ev.checks.tierDepth.push({ tier, out0_001: small.toString(), out1: cap.toString(), impactBpsAtCap: impactBps }); }
  // 2300-gas stipend: real WBNB.withdraw uses transfer(); success proves the adapter receive() fits.
  { const rc = await send(USER, await swapData(true, 5n * E, 1n, 500), adapter, 0n, 'stipend check'); ev.checks.realWbnbWithdrawStipend = { status: rc.status }; }
  ev.checks.contractRecipient = 'MOCK_ONLY (review.evm.test.ts TG-12 HeavyReceiver); not repeated on fork';
  ev.residual = { native: (await pc.getBalance({ address: adapter })).toString(), wbnb: (await bal(W, adapter)).toString(), usdt: (await bal(U, adapter)).toString() };
  ev.status = ev.checks.quoterParity.every((p: any) => p.exact && p.status === 'success') && ev.checks.priceMove.staleSnapshotReverted && ev.checks.realWbnbWithdrawStipend.status === 'success' ? 'PASS_LOCAL_ONLY' : 'FAIL';
}
main().catch((e) => { ev.status = 'BLOCKED'; ev.error = String(e?.message ?? e).slice(0, 500); }).finally(() => { writeFileSync(OUT, JSON.stringify(ev, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2) + '\n'); anvil?.kill('SIGTERM'); console.log(ev.status, ev.error ?? ''); process.exit(0); });
