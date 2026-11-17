// Synthetic adversarial tests in a local in-memory EVM with chainId 56 and MOCK tokens/router.
// These are NOT mainnet proof and do NOT make the candidate production-ready.
import fs from 'node:fs';
import { describe, it, expect, beforeEach } from 'vitest';
import { createVM } from '@ethereumjs/vm';
import { createCustomCommon, Mainnet } from '@ethereumjs/common';
import { Account, createAddressFromString, bytesToHex, hexToBytes } from '@ethereumjs/util';
import { encodeDeployData, encodeFunctionData, decodeFunctionResult, keccak256 } from 'viem';
import { compile } from '../scripts/compile.mjs';
import { compile as compileV14 } from '../../bnb-swap-adapter-v1/scripts/compile.mjs';

const dir = 'contracts/candidates/bnb-swap-adapter-v1-5';
const out = compile({ 'Mocks.sol': { content: fs.readFileSync(`${dir}/test/Mocks.sol`, 'utf8') } });
const A = out['FlowBridgeBnbSwapAdapterV1_5.sol'].FlowBridgeBnbSwapAdapterV1_5;
const W = out['Mocks.sol'].MockWBNB, U = out['Mocks.sol'].MockUSDT, R = out['Mocks.sol'].MockRouter, RU = out['Mocks.sol'].RejectingUser;
const deployer = '0x00000000000000000000000000000000000000d1', user = '0x00000000000000000000000000000000000000a1';
const feeTo = '0x00000000000000000000000000000000000000fe', other = '0x00000000000000000000000000000000000000b2';
const E18 = 10n ** 18n, NOW = 1_800_000_000n;
let vm: any, wbnb = '', usdt = '', router = '', adapter = '';

async function run(from: string, to: string | undefined, data: string, value = 0n, ts = NOW) {
  return vm.evm.runCall({ caller: createAddressFromString(from), ...(to ? { to: createAddressFromString(to) } : {}), value, data: hexToBytes(data as `0x${string}`), gasLimit: 30_000_000n,
    block: { header: { timestamp: ts, number: 1n, gasLimit: 30_000_000n, coinbase: createAddressFromString(deployer), baseFeePerGas: 0n, prevRandao: new Uint8Array(32), difficulty: 0n } } });
}
async function deploy(art: any, args: any[] = [], from = deployer) { const r = await run(from, undefined, encodeDeployData({ abi: art.abi, bytecode: `0x${art.evm.bytecode.object}`, args })); return r; }
async function send(abi: any, to: string, fn: string, args: any[] = [], from = user, value = 0n, ts = NOW) { return run(from, to, encodeFunctionData({ abi, functionName: fn, args }), value, ts); }
async function ok(...a: Parameters<typeof send>) { const r = await send(...a); expect(r.execResult.exceptionError?.error).toBeUndefined(); return r; }
async function read(abi: any, to: string, fn: string, args: any[] = []) { const r = await ok(abi, to, fn, args, deployer); return decodeFunctionResult({ abi, functionName: fn, data: bytesToHex(r.execResult.returnValue) }) as any; }
async function errName(r: any) { const d = bytesToHex(r.execResult.returnValue); const e = A.abi.filter((x: any) => x.type === 'error').find((x: any) => keccak256(new TextEncoder().encode(`${x.name}()`) as any).slice(0, 10) === d.slice(0, 10)); return e?.name ?? (r.execResult.exceptionError ? 'revert' : 'none'); }
async function native(a: string) { return (await vm.stateManager.getAccount(createAddressFromString(a)))?.balance ?? 0n; }
const buy = (min = 1n, value = E18 / 100n, dl = NOW + 60n, from = user) => send(A.abi, adapter, 'swapExactBnbForUsdt', [min, dl], from, value);
const sell = (amt = 10n * E18, min = 1n, dl = NOW + 60n) => send(A.abi, adapter, 'swapExactUsdtForBnb', [amt, min, dl]);
async function snapshot() { return { n: await native(adapter), w: await read(W.abi, wbnb, 'balanceOf', [adapter]), u: await read(U.abi, usdt, 'balanceOf', [adapter]) }; }

async function setup(chainId = 56n, feeBps = 10) {
  vm = await createVM({ common: createCustomCommon({ chainId: Number(chainId) }, Mainnet) });
  for (const a of [deployer, user, other]) await vm.stateManager.putAccount(createAddressFromString(a), new Account(0n, 10n ** 24n));
  wbnb = (await deploy(W)).createdAddress.toString(); usdt = (await deploy(U)).createdAddress.toString(); router = (await deploy(R)).createdAddress.toString();
  await ok(R.abi, router, 'setRate', [wbnb, 600n * E18], deployer); await ok(R.abi, router, 'setRate', [usdt, E18 / 600n], deployer);
  await ok(U.abi, usdt, 'mint', [router, 1_000_000n * E18], deployer); await ok(U.abi, usdt, 'mint', [user, 10_000n * E18], deployer);
  await ok(W.abi, wbnb, 'deposit', [], deployer, 1000n * E18); await ok(W.abi, wbnb, 'transfer', [router, 1000n * E18], deployer);
  const d = await deploy(A, [wbnb, usdt, router, 500, feeTo, feeBps]); if (!d.execResult.exceptionError) adapter = d.createdAddress.toString(); return d;
}
beforeEach(async () => { await setup(); });

describe('BNB adapter V1.5 candidate — synthetic adversarial EVM tests (mocks, chainId 56)', () => {
  it('constructor rejects wrong chain', async () => { expect((await setup(1n)).execResult.exceptionError).toBeDefined(); });
  it('constructor accepts only 5 or 10 bps proposal values', async () => {
    for (const bps of [0, 1, 11, 30, 10000]) expect((await deploy(A, [wbnb, usdt, router, 500, feeTo, bps])).execResult.exceptionError).toBeDefined();
    expect((await deploy(A, [wbnb, usdt, router, 500, feeTo, 5])).execResult.exceptionError).toBeUndefined();
  });
  it('constructor rejects non-contract targets, contract fee recipient, identical tokens and other pool fees', async () => {
    for (const args of [[other, usdt, router, 500, feeTo, 10], [wbnb, other, router, 500, feeTo, 10], [wbnb, usdt, other, 500, feeTo, 10], [wbnb, wbnb, router, 500, feeTo, 10], [wbnb, usdt, router, 500, router, 10], [wbnb, usdt, router, 500, '0x0000000000000000000000000000000000000000', 10], [wbnb, usdt, router, 100, feeTo, 10], [wbnb, usdt, router, 10000, feeTo, 10]])
      expect((await deploy(A, args)).execResult.exceptionError).toBeDefined();
  });
  it('has no owner, admin, sweep, pause or arbitrary call surface', () => {
    const fns = A.abi.filter((x: any) => x.type === 'function' && x.stateMutability !== 'view' && x.stateMutability !== 'pure').map((x: any) => x.name).sort();
    expect(fns).toEqual(['swapExactBnbForUsdt', 'swapExactUsdtForBnb']);
  });
  it('native BNB -> USDT: exact accounting, 10 bps fee from output, net to sender only, zero residual', async () => {
    const before = await read(U.abi, usdt, 'balanceOf', [user]);
    await ok(A.abi, adapter, 'swapExactBnbForUsdt', [5_990_000_000_000_000_000n, NOW + 60n], user, E18 / 100n);
    const gross = 6n * E18, fee = gross * 10n / 10000n;
    expect((await read(U.abi, usdt, 'balanceOf', [user])) - before).toBe(gross - fee);
    expect(await read(U.abi, usdt, 'balanceOf', [feeTo])).toBe(fee);
    expect(await snapshot()).toEqual({ n: 0n, w: 0n, u: 0n });
    expect(await read(W.abi, wbnb, 'allowance', [adapter, router])).toBe(0n);
  });
  it('USDT -> native BNB: unwraps via WBNB.withdraw, pays net native, fee native, zero residual and allowance', async () => {
    await ok(U.abi, usdt, 'approve', [adapter, 600n * E18]);
    const nb = await native(user);
    await ok(A.abi, adapter, 'swapExactUsdtForBnb', [600n * E18, 1n, NOW + 60n]);
    const gross = 600n * E18 * (E18 / 600n) / E18, fee = gross * 10n / 10000n;
    expect((await native(user)) - nb).toBe(gross - fee);
    expect(await read(W.abi, wbnb, 'balanceOf', [feeTo])).toBe(fee); expect(await native(feeTo)).toBe(0n);
    expect(await snapshot()).toEqual({ n: 0n, w: 0n, u: 0n });
    expect(await read(U.abi, usdt, 'allowance', [adapter, router])).toBe(0n);
  });
  it('5 bps proposal variant computes fee correctly', async () => {
    await setup(56n, 5); await ok(A.abi, adapter, 'swapExactBnbForUsdt', [1n, NOW + 60n], user, E18 / 100n);
    expect(await read(U.abi, usdt, 'balanceOf', [feeTo])).toBe(6n * E18 * 5n / 10000n);
  });
  it('minimum is enforced NET of platform fee (gross would pass, net fails) and full refund on revert', async () => {
    const nb = await native(user); const r = await buy(6n * E18);
    expect(await errName(r)).toBe('InsufficientOutput'); expect(await native(user)).toBe(nb); expect(await snapshot()).toEqual({ n: 0n, w: 0n, u: 0n });
    await ok(U.abi, usdt, 'approve', [adapter, 600n * E18]); expect(await errName(await sell(600n * E18, E18))).toBe('InsufficientOutput');
    expect(await read(U.abi, usdt, 'balanceOf', [user])).toBe(10_000n * E18);
  });
  it('rejects expired deadlines and deadlines beyond the 120 s window', async () => {
    expect(await errName(await buy(1n, E18 / 100n, NOW - 1n))).toBe('Expired');
    expect(await errName(await buy(1n, E18 / 100n, NOW + 121n))).toBe('DeadlineTooFar');
    expect((await buy(1n, E18 / 100n, NOW + 120n)).execResult.exceptionError).toBeUndefined();
  });
  it('rejects zero / over-ceiling amounts and zero minimums', async () => {
    expect(await errName(await buy(1n, 0n))).toBe('BadAmount'); expect(await errName(await buy(1n, E18 + 1n))).toBe('BadAmount'); expect(await errName(await buy(0n))).toBe('BadAmount');
    expect(await errName(await sell(0n))).toBe('BadAmount'); expect(await errName(await sell(1000n * E18 + 1n))).toBe('BadAmount');
  });
  it('rejects value sent to USDT->BNB (nonpayable), direct native sends and unknown calldata', async () => {
    await ok(U.abi, usdt, 'approve', [adapter, 10n * E18]);
    expect((await send(A.abi, adapter, 'swapExactUsdtForBnb', [10n * E18, 1n, NOW + 60n], user, 1n)).execResult.exceptionError).toBeDefined();
    expect((await run(user, adapter, '0x', 1n)).execResult.exceptionError).toBeDefined();
    expect((await run(user, adapter, '0xdeadbeef', 0n)).execResult.exceptionError).toBeDefined();
    expect((await run(user, adapter, encodeFunctionData({ abi: [{ type: 'function', name: 'sweepToken', inputs: [{ type: 'address' }, { type: 'uint256' }, { type: 'address' }], outputs: [], stateMutability: 'nonpayable' }], functionName: 'sweepToken', args: [usdt, 0n, user] }))).execResult.exceptionError).toBeDefined();
  });
  it('rejects fee-on-transfer input (received != amountIn)', async () => {
    await ok(U.abi, usdt, 'setFee', [1n], deployer); await ok(U.abi, usdt, 'approve', [adapter, 10n * E18]);
    expect(await errName(await sell())).toBe('InputMismatch');
  });
  it('rejects tokens that return false', async () => {
    await ok(U.abi, usdt, 'approve', [adapter, 10n * E18]); await ok(U.abi, usdt, 'setReturnFalse', [true], deployer);
    expect(await errName(await sell())).toBe('TransferFailed');
  });
  it('blocked (blacklisted) accounts revert atomically with no loss', async () => {
    await ok(U.abi, usdt, 'setBlocked', [user, true], deployer); const nb = await native(user);
    expect((await buy()).execResult.exceptionError).toBeDefined(); expect(await native(user)).toBe(nb);
  });
  it('router that reports output but pays nothing is rejected', async () => { await ok(R.abi, router, 'setMode', [1n, other], deployer); expect(await errName(await buy())).toBe('InputMismatch'); });
  it('router that leaves allowance (under-pull) is rejected', async () => { await ok(R.abi, router, 'setMode', [2n, other], deployer); expect(await errName(await buy())).toBe('AllowanceNotCleared'); });
  it('router cannot over-pull beyond exact approval', async () => { await ok(R.abi, router, 'setMode', [3n, other], deployer); expect((await buy()).execResult.exceptionError).toBeDefined(); });
  it('reentrancy from router callback is rejected', async () => { await ok(R.abi, router, 'setMode', [4n, other], deployer); expect((await buy()).execResult.exceptionError).toBeDefined(); expect(await snapshot()).toEqual({ n: 0n, w: 0n, u: 0n }); });
  it('unexpected native from router is rejected (only WBNB may send BNB)', async () => {
    { const acc = await vm.stateManager.getAccount(createAddressFromString(router)); acc.balance += 10n ** 18n; await vm.stateManager.putAccount(createAddressFromString(router), acc); } // V1.5: preserve router code (V1.4 test wiped it — vacuous, finding T-1)
    await ok(R.abi, router, 'setMode', [5n, other], deployer);
    const r = await buy(); expect(r.execResult.exceptionError).toBeDefined(); expect(bytesToHex(r.execResult.returnValue)).not.toBe('0x');
  });
  it('router paying a different recipient is rejected', async () => { await ok(R.abi, router, 'setMode', [6n, other], deployer); expect(await errName(await buy())).toBe('InputMismatch'); });
  it('router over-reporting output is rejected', async () => { await ok(R.abi, router, 'setMode', [7n, other], deployer); expect(await errName(await buy())).toBe('InputMismatch'); });
  it('router over-paying (residual) is rejected rather than kept', async () => { await ok(R.abi, router, 'setMode', [8n, other], deployer); expect(await errName(await buy())).toBe('InputMismatch'); });
  it('recipient that rejects native reverts the whole swap (refund-on-fail)', async () => {
    const ru = (await deploy(RU)).createdAddress.toString(); await ok(U.abi, usdt, 'mint', [ru, 10n * E18], deployer);
    expect((await send(RU.abi, ru, 'sell', [adapter, usdt, 10n * E18, NOW + 60n])).execResult.exceptionError).toBeDefined();
    expect(await read(U.abi, usdt, 'balanceOf', [ru])).toBe(10n * E18);
  });
  it('pre-existing stray balances are never paid out to the next user', async () => {
    await ok(U.abi, usdt, 'transfer', [adapter, 5n * E18]);
    const before = await read(U.abi, usdt, 'balanceOf', [user]);
    await ok(A.abi, adapter, 'swapExactBnbForUsdt', [1n, NOW + 60n], user, E18 / 100n);
    expect((await read(U.abi, usdt, 'balanceOf', [user])) - before).toBe(6n * E18 - 6n * E18 * 10n / 10000n);
    expect(await read(U.abi, usdt, 'balanceOf', [adapter])).toBe(5n * E18);
  });
  it('runtime fits EIP-170', () => { expect(A.evm.deployedBytecode.object.length / 2).toBeLessThan(24576); });
});

const A14 = compileV14()['FlowBridgeBnbSwapAdapterV1.sol'].FlowBridgeBnbSwapAdapterV1;
const REJECT_CODE = hexToBytes('0x5f5ffd'); // PUSH0 PUSH0 REVERT — a recipient that gains code (e.g. EIP-7702 delegation) and rejects native
const BURN_CODE = hexToBytes('0x5b600056'); // JUMPDEST PUSH1 0 JUMP — infinite loop, consumes all forwarded gas
function rng(seed: number) { return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; }; }

describe('V1.5 hardening — findings and adversarial properties', () => {
  it('FINDING F-1 (V1.4): fee recipient that later gains rejecting code DoSes every USDT->BNB swap', async () => {
    const d = await deploy(A14, [wbnb, usdt, router, 500, feeTo, 10]); const a14 = d.createdAddress.toString();
    await vm.stateManager.putCode(createAddressFromString(feeTo), REJECT_CODE);
    await ok(U.abi, usdt, 'approve', [a14, 10n * E18]);
    expect((await send(A14.abi, a14, 'swapExactUsdtForBnb', [10n * E18, 1n, NOW + 60n])).execResult.exceptionError).toBeDefined();
  });
  it('FIX F-1 (V1.5): rejecting / gas-burning fee recipient code cannot block USDT->BNB; fee arrives as WBNB', async () => {
    for (const code of [REJECT_CODE, BURN_CODE]) {
      await setup(); await vm.stateManager.putCode(createAddressFromString(feeTo), code);
      await ok(U.abi, usdt, 'approve', [adapter, 10n * E18]); await ok(A.abi, adapter, 'swapExactUsdtForBnb', [10n * E18, 1n, NOW + 60n]);
      expect(await read(W.abi, wbnb, 'balanceOf', [feeTo])).toBeGreaterThan(0n);
    }
  });
  it('forced native (selfdestruct/coinbase-style) and unsolicited USDT/WBNB donations do not block swaps and are never paid out', async () => {
    { const acc = await vm.stateManager.getAccount(createAddressFromString(adapter)); acc.balance += 7n * E18; await vm.stateManager.putAccount(createAddressFromString(adapter), acc); }
    expect((await vm.stateManager.getCode(createAddressFromString(adapter))).length).toBeGreaterThan(0);
    await ok(U.abi, usdt, 'transfer', [adapter, 3n * E18]); await ok(W.abi, wbnb, 'deposit', [], user, 2n * E18); await ok(W.abi, wbnb, 'transfer', [adapter, 2n * E18]);
    const ub = await read(U.abi, usdt, 'balanceOf', [user]);
    await ok(A.abi, adapter, 'swapExactBnbForUsdt', [1n, NOW + 60n], user, E18 / 100n);
    await ok(U.abi, usdt, 'approve', [adapter, 6n * E18]); const nb = await native(user);
    await ok(A.abi, adapter, 'swapExactUsdtForBnb', [6n * E18, 1n, NOW + 60n]);
    expect((await read(U.abi, usdt, 'balanceOf', [user])) - ub).toBe(6n * E18 - 6n * E18 * 10n / 10000n - 6n * E18);
    const g = 6n * E18 * (E18 / 600n) / E18; expect((await native(user)) - nb).toBe(g - g * 10n / 10000n);
    expect(await snapshot()).toEqual({ n: 7n * E18, w: 2n * E18, u: 3n * E18 }); // donations stay, permanently, untouched
  });
  it('custom errors bubble with selector (revert data preserved)', async () => { expect(await errName(await buy(1n, E18 / 100n, NOW - 1n))).toBe('Expired'); });
  it('sandwich / pool drift between quote and inclusion: user net minimum protects, swap reverts with full refund', async () => {
    const quotedNet = 6n * E18 - 6n * E18 * 10n / 10000n; const minNet = quotedNet * 9950n / 10000n; // 50 bps tolerance
    await ok(R.abi, router, 'setRate', [wbnb, 600n * E18 * 9940n / 10000n], deployer); // attacker moved price 60 bps
    const nb = await native(user); expect(await errName(await buy(minNet))).toBe('InsufficientOutput'); expect(await native(user)).toBe(nb);
    await ok(R.abi, router, 'setRate', [wbnb, 600n * E18 * 9960n / 10000n], deployer); // 40 bps: within tolerance
    expect((await buy(minNet)).execResult.exceptionError).toBeUndefined();
  });
  it('fuzz (seeded, 120 runs): random sizes/rates/directions keep net+fee=gross, zero residual delta, zero allowance', async () => {
    const r = rng(1729); await ok(U.abi, usdt, 'approve', [adapter, 10n ** 30n]);
    for (let i = 0; i < 120; i++) {
      const rate = BigInt(1 + (r() % 2000)) * E18; await ok(R.abi, router, 'setRate', [wbnb, rate], deployer); await ok(R.abi, router, 'setRate', [usdt, E18 * E18 / rate], deployer);
      const before = await snapshot(); const fb = await read(U.abi, usdt, 'balanceOf', [feeTo]); const fw = await read(W.abi, wbnb, 'balanceOf', [feeTo]);
      if (r() % 2) {
        const v = BigInt(1 + (r() % 1_000_000)) * 10n ** 12n; const gross = v * rate / E18; const ub = await read(U.abi, usdt, 'balanceOf', [user]);
        const res = await buy(1n, v);
        if (gross - gross * 10n / 10000n === 0n) { expect(res.execResult.exceptionError).toBeDefined(); continue; }
        expect(res.execResult.exceptionError).toBeUndefined();
        const net = (await read(U.abi, usdt, 'balanceOf', [user])) - ub, fee = (await read(U.abi, usdt, 'balanceOf', [feeTo])) - fb;
        expect(net + fee).toBe(gross); expect(fee).toBe(gross * 10n / 10000n);
      } else {
        const amt = BigInt(1 + (r() % 1000)) * 10n ** 15n; const gross = amt * (E18 * E18 / rate) / E18;
        await ok(U.abi, usdt, 'mint', [user, amt], deployer); const nb = await native(user); const res = await sell(amt);
        if (gross - gross * 10n / 10000n === 0n) { expect(res.execResult.exceptionError).toBeDefined(); continue; }
        expect(res.execResult.exceptionError).toBeUndefined();
        const net = (await native(user)) - nb, fee = (await read(W.abi, wbnb, 'balanceOf', [feeTo])) - fw; expect(net + fee).toBe(gross);
      }
      expect(await snapshot()).toEqual(before); expect(await read(W.abi, wbnb, 'allowance', [adapter, router])).toBe(0n); expect(await read(U.abi, usdt, 'allowance', [adapter, router])).toBe(0n);
    }
  }, 120_000);
  it('repeated swaps under monotonic pool drift stay exact', async () => {
    for (let i = 0; i < 10; i++) { const rate = (600n - BigInt(i) * 7n) * E18; await ok(R.abi, router, 'setRate', [wbnb, rate], deployer);
      const fb = await read(U.abi, usdt, 'balanceOf', [feeTo]); await ok(A.abi, adapter, 'swapExactBnbForUsdt', [1n, NOW + 60n], user, E18 / 100n);
      expect((await read(U.abi, usdt, 'balanceOf', [feeTo])) - fb).toBe((rate / 100n) * 10n / 10000n); }
    expect(await snapshot()).toEqual({ n: 0n, w: 0n, u: 0n });
  });
  it('FINDING F-4 (LOW, accepted): dust trades round the fee down to zero; user still receives full net, no loss of user funds', async () => {
    const ub = await read(U.abi, usdt, 'balanceOf', [user]); await ok(A.abi, adapter, 'swapExactBnbForUsdt', [1n, NOW + 60n], user, 1n);
    expect((await read(U.abi, usdt, 'balanceOf', [user])) - ub).toBe(600n); expect(await read(U.abi, usdt, 'balanceOf', [feeTo])).toBe(0n);
  });
  it('local gas (mock router; informative only, not mainnet): adapter overhead measured', async () => {
    const r = await ok(A.abi, adapter, 'swapExactBnbForUsdt', [1n, NOW + 60n], user, E18 / 100n);
    console.log('local-mock adapter BNB->USDT execution gas', r.execResult.executionGasUsed.toString());
    expect(r.execResult.executionGasUsed).toBeLessThan(400_000n);
  });
  it('V1.4 frozen source untouched and V1.5 source/ABI match its manifest', () => {
    const m14 = JSON.parse(fs.readFileSync('contracts/candidates/bnb-swap-adapter-v1/MANIFEST.json', 'utf8'));
    expect(keccak256(fs.readFileSync('contracts/candidates/bnb-swap-adapter-v1/FlowBridgeBnbSwapAdapterV1.sol'))).toBe(m14.sourceKeccak);
    expect(m14.sourceKeccak).toBe('0x06f90355e83aa0940d3c73cfe165a2e5c074bf67361cdea8e1e7def81c41a173');
    const m15 = JSON.parse(fs.readFileSync(`${dir}/MANIFEST.json`, 'utf8'));
    expect(keccak256(fs.readFileSync(`${dir}/FlowBridgeBnbSwapAdapterV1_5.sol`))).toBe(m15.sourceKeccak);
    expect(m15.abi).toEqual(A.abi); expect(keccak256(`0x${A.evm.bytecode.object}`)).toBe(m15.creationBytecodeKeccak);
  });
});
