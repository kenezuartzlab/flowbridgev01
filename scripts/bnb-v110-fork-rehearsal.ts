/**
 * V1.10 reproducible LOCAL Anvil fork rehearsal with real chain-56 token/router bytecode.
 * The candidate is deployed only to 127.0.0.1 using Anvil's unlocked synthetic accounts.
 * No key, signature, mainnet transaction, real approval, real fee or wallet is used.
 * Run: nix shell nixpkgs#foundry -c bun scripts/bnb-v110-fork-rehearsal.ts
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import {
  createPublicClient, createTestClient, decodeFunctionResult, defineChain, encodeDeployData,
  encodeFunctionData, formatUnits, http, keccak256, encodeAbiParameters, pad, parseEventLogs,
  toFunctionSelector, toHex, type Address, type Hex,
} from 'viem';
import { BNB_ASSETS } from '../src/lib/bnb/quoteAdapter';
import { OFFICIAL_RPC, POOL_GATE as G, quoterAbi } from '../src/lib/rwa/quoteReadiness';
// @ts-expect-error local JavaScript compiler module
import { compile } from '../contracts/candidates/bnb-swap-adapter-v1-6/scripts/compile.mjs';

const OUTPUT = 'docs/security/BNB_SWAP_V1_10_FORK_REHEARSAL_20261118.json';
const W = BNB_ASSETS.WBNB.address as Address;
const U = BNB_ASSETS.USDT.address as Address;
const R = G.router as Address;
const USER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as Address;
const OTHER = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as Address;
const FEE = '0x000000000000000000000000000000000f1b00fe' as Address; // synthetic empty recipient; no key or real funds
const E = 10n ** 18n;
const LOCAL = 'http://127.0.0.1:8545';
const chain = defineChain({ id: 56, name: 'Local BNB fork only', nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 }, rpcUrls: { default: { http: [LOCAL] } } });
const publicClient = createPublicClient({ chain, transport: http(LOCAL, { timeout: 20_000 }) }) as any;
const testClient = createTestClient({ chain, mode: 'anvil', transport: http(LOCAL, { timeout: 20_000 }) }) as any;
const artifact = compile()['FlowBridgeBnbSwapAdapterV1_6.sol'].FlowBridgeBnbSwapAdapterV1_6;
const routerAbi = [{ type: 'function', name: 'exactInputSingle', stateMutability: 'payable', inputs: [{ name: 'params', type: 'tuple', components: [
  { name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' }, { name: 'fee', type: 'uint24' }, { name: 'recipient', type: 'address' },
  { name: 'deadline', type: 'uint256' }, { name: 'amountIn', type: 'uint256' }, { name: 'amountOutMinimum', type: 'uint256' }, { name: 'sqrtPriceLimitX96', type: 'uint160' },
] }], outputs: [{ name: 'amountOut', type: 'uint256' }] }] as const;
const tokenAbi = [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }, { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] }] as const;
const slot = (owner: Address, index: bigint) => keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [owner, index]));
const nested = (owner: Address, spender: Address, index: bigint) => keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [spender, slot(owner, index)]));
const word = (value: bigint) => pad(toHex(value), { size: 32 });
const evidence: any = {
  generatedAt: new Date().toISOString(), status: 'BLOCKED', release: 'HOLD', independentAudit: 'NOT_DONE',
  scope: 'LOCAL_ANVIL_FORK_WITH_REAL_CHAIN56_BYTECODE_AND_LOCAL_ONLY_CANDIDATE_DEPLOYMENT',
  mainnetTransactions: 0, signatures: 0, realFees: 0, proposalFeeBps: 5, feeApproved: false,
  rpcIndependence: 'UPSTREAM_OFFICIAL_ENDPOINT_IS_NOT_AN_INDEPENDENT_QUORUM',
  accounts: 'Anvil unlocked synthetic defaults; no private keys read or used', checks: {}, transactions: [],
};
let anvil: ChildProcess | undefined;
let anvilErrors = '';
const save = () => writeFileSync(OUTPUT, JSON.stringify(evidence, null, 2) + '\n');
const shortError = (error: unknown) => String(error instanceof Error ? error.message : error).replace(/0x[a-fA-F0-9]{100,}/g, '0x…').slice(0, 500);

async function remoteBlock(): Promise<number> {
  const response = await fetch(OFFICIAL_RPC[0], { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }) });
  const json: any = await response.json();
  if (!json.result) throw new Error('Pinned upstream head unavailable');
  return Number(BigInt(json.result)) - 20;
}
async function waitForAnvil() {
  for (let i = 0; i < 100; i++) {
    try { if (await publicClient.getChainId() === 56) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Local Anvil did not start');
}
async function send(from: Address, data: Hex, to?: Address, value = 0n) {
  const hash = await publicClient.request({ method: 'eth_sendTransaction', params: [{ from, ...(to ? { to } : {}), data, value: toHex(value), gas: toHex(8_000_000n) }] });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 20_000 });
  evidence.transactions.push({ scope: 'LOCAL_ONLY', hash, status: receipt.status, gasUsed: receipt.gasUsed.toString() });
  if (receipt.status !== 'success') throw new Error('Local transaction reverted');
  return receipt;
}
const adapterData = (name: string, args: readonly unknown[]) => encodeFunctionData({ abi: artifact.abi, functionName: name, args: args as any });
const routerData = (tokenIn: Address, tokenOut: Address, amountIn: bigint, recipient: Address, deadline: bigint) => encodeFunctionData({ abi: routerAbi, functionName: 'exactInputSingle', args: [{ tokenIn, tokenOut, fee: 500, recipient, deadline, amountIn, amountOutMinimum: 1n, sqrtPriceLimitX96: 0n }] });
const balance = (token: Address, owner: Address) => publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'balanceOf', args: [owner] }) as Promise<bigint>;
const allowance = (token: Address, owner: Address, spender: Address) => publicClient.readContract({ address: token, abi: tokenAbi, functionName: 'allowance', args: [owner, spender] }) as Promise<bigint>;
async function snapshot() { return publicClient.request({ method: 'evm_snapshot', params: [] }); }
async function revert(id: string) { if (!await publicClient.request({ method: 'evm_revert', params: [id] })) throw new Error('Local snapshot revert failed'); }
async function mustRevert(request: any, label: string) {
  try { await publicClient.call(request); throw new Error(`${label}: expected revert`); }
  catch (error) { if (String(error).includes('expected revert')) throw error; evidence.checks[label] = 'REVERTED_AS_REQUIRED'; }
}
async function deadline() { return (await publicClient.getBlock()).timestamp + 60n; }
async function quote(amount: bigint) {
  const { data } = await publicClient.call({ to: G.quoter, data: encodeFunctionData({ abi: quoterAbi, functionName: 'quoteExactInputSingle', args: [{ tokenIn: W, tokenOut: U, amountIn: amount, fee: 500, sqrtPriceLimitX96: 0n }] }) });
  return (decodeFunctionResult({ abi: quoterAbi, functionName: 'quoteExactInputSingle', data }) as readonly [bigint, bigint, number, bigint])[0];
}
async function residual(adapter: Address) {
  const [native, wbnb, usdt, wAllowance, uAllowance] = await Promise.all([publicClient.getBalance({ address: adapter }), balance(W, adapter), balance(U, adapter), allowance(W, adapter, R), allowance(U, adapter, R)]);
  return { native: native.toString(), wbnb: wbnb.toString(), usdt: usdt.toString(), wbnbRouterAllowance: wAllowance.toString(), usdtRouterAllowance: uAllowance.toString() };
}
async function setUsdt(owner: Address, spender: Address, amount: bigint) {
  await testClient.setStorageAt({ address: U, index: slot(owner, 1n), value: word(amount) });
  await testClient.setStorageAt({ address: U, index: nested(owner, spender, 2n), value: word(amount) });
}

async function main() {
  const forkBlock = await remoteBlock();
  evidence.fork = { upstream: OFFICIAL_RPC[0], block: forkBlock, localUrl: LOCAL, chainId: 56 };
  anvil = spawn('anvil', ['--fork-url', OFFICIAL_RPC[0], '--fork-block-number', String(forkBlock), '--chain-id', '56', '--host', '127.0.0.1', '--port', '8545', '--silent'], { stdio: ['ignore', 'pipe', 'pipe'] });
  anvil.stderr?.on('data', (chunk) => { anvilErrors = (anvilErrors + String(chunk)).slice(-2000); });
  await waitForAnvil();
  const code: any = {};
  for (const [name, address] of [['WBNB', W], ['USDT', U], ['PancakeV3SwapRouter', R]] as const) {
    const deployed = await publicClient.getCode({ address });
    if (!deployed || deployed === '0x') throw new Error(`${name} real bytecode missing`);
    code[name] = { address, keccak256: keccak256(deployed), bytes: (deployed.length - 2) / 2 };
  }
  evidence.realBytecode = code;
  const deployment = await send(USER, encodeDeployData({ abi: artifact.abi, bytecode: `0x${artifact.evm.bytecode.object}`, args: [W, U, R, 500, FEE, 5] }));
  const adapter = deployment.contractAddress as Address;
  if (!adapter) throw new Error('No local candidate address');
  evidence.localCandidate = { address: adapter, deployment: 'LOCAL_FORK_ONLY_NOT_MAINNET', runtimeKeccak: keccak256(await publicClient.getCode({ address: adapter })) };

  const amount = E / 1000n;
  const baseSnapshot = await snapshot();
  const userBefore = await balance(U, USER), feeBefore = await balance(U, FEE);
  const adapterReceipt = await send(USER, adapterData('swapExactBnbForUsdt', [1n, await deadline()]), adapter, amount);
  const adapterNet = await balance(U, USER) - userBefore;
  const collected = await balance(U, FEE) - feeBefore;
  const adapterResidual = await residual(adapter);
  const adapterGas = adapterReceipt.gasUsed as bigint;
  await revert(baseSnapshot);
  const directSnapshot = await snapshot(); // Anvil snapshot IDs are single-use, including after restoring the same state.
  const directBefore = await balance(U, USER);
  const directReceipt = await send(USER, routerData(W, U, amount, USER, await deadline()), R, amount);
  const directOut = await balance(U, USER) - directBefore;
  const directGas = directReceipt.gasUsed as bigint;
  await revert(directSnapshot);
  if (adapterNet + collected !== directOut || collected !== directOut * 5n / 10_000n) throw new Error('Fork fee/net parity failed');
  if (adapterResidual.native !== '0' || adapterResidual.wbnb !== '0' || adapterResidual.usdt !== '0' || adapterResidual.wbnbRouterAllowance !== '0' || adapterResidual.usdtRouterAllowance !== '0') throw new Error('Fork residual/allowance invariant failed');
  evidence.checks.sameStateBnbToUsdt = { directOut: directOut.toString(), adapterNet: adapterNet.toString(), proposalFee: collected.toString(), directGas: directGas.toString(), adapterGas: adapterGas.toString(), extraGas: (adapterGas - directGas).toString(), residual: adapterResidual };

  const sellAmount = 5n * E;
  await setUsdt(USER, adapter, 1000n * E);
  const sellReceipt = await send(USER, adapterData('swapExactUsdtForBnb', [sellAmount, 1n, await deadline()]), adapter);
  const events = parseEventLogs({ abi: artifact.abi, logs: sellReceipt.logs });
  if (events.length !== 1 || events[0].eventName !== 'Swapped' || events[0].args.netOut <= 0n) throw new Error('Fork USDT-to-BNB settlement event missing');
  evidence.checks.usdtToNative = { amountIn: sellAmount.toString(), grossOut: events[0].args.grossOut.toString(), proposalFeeWbnb: events[0].args.fee.toString(), netNativeOut: events[0].args.netOut.toString(), residual: await residual(adapter) };
  await mustRevert({ account: OTHER, to: adapter, data: adapterData('swapExactUsdtForBnb', [sellAmount, 1n, await deadline()]) }, 'crossWalletCannotSpendUserAllowance');

  const quoteSnapshot = await snapshot();
  const quotedGross = await quote(amount);
  const quotedNet = quotedGross - quotedGross * 5n / 10_000n;
  await publicClient.call({ account: USER, to: adapter, data: adapterData('swapExactBnbForUsdt', [quotedNet, await deadline()]), value: amount });
  await mustRevert({ account: USER, to: adapter, data: adapterData('swapExactBnbForUsdt', [quotedNet + 1n, await deadline()]), value: amount }, 'minimumNetPlusOneWei');
  await send(OTHER, routerData(W, U, E, OTHER, await deadline()), R, E);
  await mustRevert({ account: USER, to: adapter, data: adapterData('swapExactBnbForUsdt', [quotedNet, await deadline()]), value: amount }, 'staleQuoteAfterRealPoolStateChange');
  await revert(quoteSnapshot);
  evidence.checks.quoteSnapshot = { gross: quotedGross.toString(), exactNetAccepted: true, staleAfterOneBnbPoolMoveRejected: true };

  await mustRevert({ account: USER, to: adapter, data: adapterData('swapExactBnbForUsdt', [1n, (await deadline()) - 120n]), value: amount }, 'expiredDeadline');
  await mustRevert({ account: USER, to: adapter, data: adapterData('swapExactBnbForUsdt', [1n, (await deadline()) + 121n]), value: amount }, 'deadlineTooFar');
  await mustRevert({ account: USER, to: adapter, data: toFunctionSelector('pause()') }, 'noPauseEntryPoint');

  const donationSnapshot = await snapshot();
  await testClient.setStorageAt({ address: U, index: slot(USER, 1n), value: word(1000n * E) });
  await send(USER, encodeFunctionData({ abi: [{ type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] }], functionName: 'transfer', args: [adapter, E] }), U);
  await testClient.setBalance({ address: adapter, value: 2n * E });
  await send(USER, adapterData('swapExactBnbForUsdt', [1n, await deadline()]), adapter, amount);
  const donatedResidual = await residual(adapter);
  if (donatedResidual.native !== (2n * E).toString() || donatedResidual.usdt !== E.toString()) throw new Error('Donation isolation failed');
  evidence.checks.donationsAndForcedNative = { residual: donatedResidual, recoverable: false, note: 'No sweep exists; donated assets remain stranded by design.' };
  await revert(donationSnapshot);

  evidence.checks.chain56AndNoGenericPath = { constructorAndCalls: 'Synthetic suite separately verifies chain fail-closed behavior', xaut: 'BLOCKED', pause: 'ABSENT; UI kill switch cannot stop direct calls' };
  evidence.status = 'PASS';
  evidence.summary = { localTransactions: evidence.transactions.length, directOutUsdt: formatUnits(directOut, 18), adapterNetUsdt: formatUnits(adapterNet, 18), proposalFeeUsdt: formatUnits(collected, 18), extraGas: (adapterGas - directGas).toString(), mainnetTransactions: 0 };
  save();
  console.log(JSON.stringify(evidence.summary));
}

main().catch((error) => {
  evidence.status = 'BLOCKED';
  evidence.error = shortError(error);
  if (anvilErrors) evidence.anvilStderr = shortError(anvilErrors);
  save();
  console.error(`Local fork rehearsal blocked: ${evidence.error}`);
  process.exitCode = 1;
}).finally(() => {
  if (anvil && !anvil.killed) anvil.kill('SIGTERM');
});
