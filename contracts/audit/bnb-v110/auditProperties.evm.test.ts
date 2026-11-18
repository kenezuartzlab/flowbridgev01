// Additional V1.10 audit-readiness properties. V1.6 remains frozen; these tests use mocks, not mainnet proof.
import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createVM } from '@ethereumjs/vm';
import { createCustomCommon, Mainnet } from '@ethereumjs/common';
import { Account, createAddressFromString, bytesToHex, hexToBytes } from '@ethereumjs/util';
import { decodeFunctionResult, encodeDeployData, encodeFunctionData, keccak256 } from 'viem';
// @ts-expect-error local compiler module
import { compile } from '../../candidates/bnb-swap-adapter-v1-6/scripts/compile.mjs';

const dir = 'contracts/candidates/bnb-swap-adapter-v1-6';
const out = compile({ 'Mocks.sol': { content: fs.readFileSync(`${dir}/test/Mocks.sol`, 'utf8') } });
const A = out['FlowBridgeBnbSwapAdapterV1_6.sol'].FlowBridgeBnbSwapAdapterV1_6;
const W = out['Mocks.sol'].MockWBNB, U = out['Mocks.sol'].MockUSDT, R = out['Mocks.sol'].MockRouter;
const deployer = '0x00000000000000000000000000000000000000d1', user = '0x00000000000000000000000000000000000000a1';
const other = '0x00000000000000000000000000000000000000b2', feeTo = '0x000000000000000000000000000000000f1b00fe';
const E = 10n ** 18n, NOW = 1_800_000_000n;
let vm: any, wbnb = '', usdt = '', router = '', adapter = '';

async function run(from: string, to: string | undefined, data: string, value = 0n) {
  return vm.evm.runCall({ caller: createAddressFromString(from), ...(to ? { to: createAddressFromString(to) } : {}), value, data: hexToBytes(data as `0x${string}`), gasLimit: 30_000_000n,
    block: { header: { timestamp: NOW, number: 1n, gasLimit: 30_000_000n, coinbase: createAddressFromString(deployer), baseFeePerGas: 0n, prevRandao: new Uint8Array(32), difficulty: 0n } } });
}
async function deploy(artifact: any, args: any[] = []) { return run(deployer, undefined, encodeDeployData({ abi: artifact.abi, bytecode: `0x${artifact.evm.bytecode.object}`, args })); }
async function send(abi: any, to: string, fn: string, args: any[] = [], from = user, value = 0n) { return run(from, to, encodeFunctionData({ abi, functionName: fn, args }), value); }
async function ok(...args: Parameters<typeof send>) { const result = await send(...args); expect(result.execResult.exceptionError).toBeUndefined(); return result; }
async function read(abi: any, to: string, fn: string, args: any[] = []) { const result = await ok(abi, to, fn, args, deployer); return decodeFunctionResult({ abi, functionName: fn, data: bytesToHex(result.execResult.returnValue) }) as any; }
const native = async (address: string) => (await vm.stateManager.getAccount(createAddressFromString(address)))?.balance ?? 0n;
const buy = (min = 1n, value = E / 100n, from = user) => send(A.abi, adapter, 'swapExactBnbForUsdt', [min, NOW + 60n], from, value);
const sell = (amount = 10n * E, min = 1n, from = user) => send(A.abi, adapter, 'swapExactUsdtForBnb', [amount, min, NOW + 60n], from);
async function residual() { return { n: await native(adapter), w: await read(W.abi, wbnb, 'balanceOf', [adapter]), u: await read(U.abi, usdt, 'balanceOf', [adapter]) }; }
async function allowances() { return [await read(W.abi, wbnb, 'allowance', [adapter, router]), await read(U.abi, usdt, 'allowance', [adapter, router])]; }

beforeEach(async () => {
  vm = await createVM({ common: createCustomCommon({ chainId: 56 }, Mainnet) });
  for (const address of [deployer, user, other]) await vm.stateManager.putAccount(createAddressFromString(address), new Account(0n, 10n ** 24n));
  wbnb = (await deploy(W)).createdAddress.toString(); usdt = (await deploy(U)).createdAddress.toString(); router = (await deploy(R)).createdAddress.toString();
  await ok(R.abi, router, 'setRate', [wbnb, 600n * E], deployer); await ok(R.abi, router, 'setRate', [usdt, E / 600n], deployer);
  await ok(U.abi, usdt, 'mint', [router, 1_000_000n * E], deployer);
  for (const address of [user, other]) { await ok(U.abi, usdt, 'mint', [address, 10_000n * E], deployer); await ok(U.abi, usdt, 'approve', [adapter || router, 0n], address); }
  await ok(W.abi, wbnb, 'deposit', [], deployer, 1000n * E); await ok(W.abi, wbnb, 'transfer', [router, 1000n * E], deployer);
  adapter = (await deploy(A, [wbnb, usdt, router, 500, feeTo, 5])).createdAddress.toString();
});

describe('V1.10 independent-style properties against frozen V1.6', () => {
  it('seeded 256-run two-wallet fuzz preserves net+fee, per-call residuals and exact allowances with random dust', async () => {
    let seed = 0x51f0a;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed; };
    for (const address of [user, other]) await ok(U.abi, usdt, 'approve', [adapter, 10n ** 30n], address);
    for (let i = 0; i < 256; i++) {
      const caller = i % 2 ? user : other;
      const rate = BigInt(1 + random() % 2000) * E;
      await ok(R.abi, router, 'setRate', [wbnb, rate], deployer); await ok(R.abi, router, 'setRate', [usdt, E * E / rate], deployer);
      if (random() % 3 === 0) await ok(U.abi, usdt, 'transfer', [adapter, BigInt(random() % 1000)], caller);
      if (random() % 4 === 0) { await ok(W.abi, wbnb, 'deposit', [], caller, E / 1000n); await ok(W.abi, wbnb, 'transfer', [adapter, BigInt(1 + random() % 1000)], caller); }
      const before = await residual();
      if (i % 3) {
        const amount = BigInt(1 + random() % 1_000_000) * 10n ** 12n, gross = amount * rate / E, fee = gross * 5n / 10_000n;
        const recipientBefore = await read(U.abi, usdt, 'balanceOf', [caller]), feeBefore = await read(U.abi, usdt, 'balanceOf', [feeTo]);
        const result = await buy(1n, amount, caller);
        if (gross - fee === 0n) expect(result.execResult.exceptionError).toBeDefined();
        else {
          expect(result.execResult.exceptionError).toBeUndefined();
          expect((await read(U.abi, usdt, 'balanceOf', [caller])) - recipientBefore).toBe(gross - fee);
          expect((await read(U.abi, usdt, 'balanceOf', [feeTo])) - feeBefore).toBe(fee);
        }
      } else {
        const amount = BigInt(1 + random() % 1000) * 10n ** 15n, gross = amount * (E * E / rate) / E, fee = gross * 5n / 10_000n;
        const nativeBefore = await native(caller), feeBefore = await read(W.abi, wbnb, 'balanceOf', [feeTo]);
        const result = await sell(amount, 1n, caller);
        if (gross - fee === 0n) expect(result.execResult.exceptionError).toBeDefined();
        else {
          expect(result.execResult.exceptionError).toBeUndefined();
          expect((await native(caller)) - nativeBefore).toBe(gross - fee);
          expect((await read(W.abi, wbnb, 'balanceOf', [feeTo])) - feeBefore).toBe(fee);
        }
      }
      expect(await residual()).toEqual(before);
      expect(await allowances()).toEqual([0n, 0n]);
    }
  }, 180_000);

  it('accepts exact net minimum and rejects one wei more in both directions without residual allowance', async () => {
    const buyGross = 6n * E, buyNet = buyGross - buyGross * 5n / 10_000n;
    expect((await buy(buyNet)).execResult.exceptionError).toBeUndefined();
    const rejectedBuy = await buy(buyNet + 1n); expect(rejectedBuy.execResult.exceptionError).toBeDefined();
    expect(await allowances()).toEqual([0n, 0n]);
    const amount = 600n * E, sellGross = amount * (E / 600n) / E, sellNet = sellGross - sellGross * 5n / 10_000n;
    await ok(U.abi, usdt, 'approve', [adapter, amount * 2n]);
    expect((await sell(amount, sellNet)).execResult.exceptionError).toBeUndefined();
    expect((await sell(amount, sellNet + 1n)).execResult.exceptionError).toBeDefined();
    expect(await allowances()).toEqual([0n, 0n]);
  });

  it('another wallet cannot consume the user allowance or redirect the recipient', async () => {
    const before = await read(U.abi, usdt, 'balanceOf', [user]);
    await ok(U.abi, usdt, 'approve', [adapter, 10n * E]);
    const result = await sell(10n * E, 1n, other);
    expect(result.execResult.exceptionError).toBeDefined();
    expect(await read(U.abi, usdt, 'balanceOf', [user])).toBe(before);
    expect(await residual()).toEqual({ n: 0n, w: 0n, u: 0n });
  });

  it('both swap entry points fail closed if the chain changes after deployment', async () => {
    const stateManager = vm.stateManager;
    vm = await createVM({ common: createCustomCommon({ chainId: 1 }, Mainnet), stateManager });
    for (const result of [await buy(), await sell()]) {
      expect(result.execResult.exceptionError).toBeDefined();
      expect(bytesToHex(result.execResult.returnValue).slice(0, 10)).toBe(keccak256(new TextEncoder().encode('WrongChain()') as any).slice(0, 10));
    }
  });

  it('minimum-output reverts restore the buyer native input and seller token input', async () => {
    const nativeBefore = await native(user);
    expect((await buy(7n * E)).execResult.exceptionError).toBeDefined();
    expect(await native(user)).toBe(nativeBefore);
    const tokenBefore = await read(U.abi, usdt, 'balanceOf', [user]);
    await ok(U.abi, usdt, 'approve', [adapter, 600n * E]);
    expect((await sell(600n * E, 2n * E)).execResult.exceptionError).toBeDefined();
    expect(await read(U.abi, usdt, 'balanceOf', [user])).toBe(tokenBefore);
    expect(await residual()).toEqual({ n: 0n, w: 0n, u: 0n });
  });

  it('the ABI exposes no pause, sweep, owner, recipient override or generic token path', () => {
    const names = A.abi.filter((item: any) => item.type === 'function').map((item: any) => item.name);
    for (const forbidden of ['pause', 'unpause', 'sweep', 'setOwner', 'setRecipient', 'swapExactTokensForTokens']) expect(names).not.toContain(forbidden);
    expect(names.sort()).toEqual(['BPS', 'CHAIN_ID', 'FEE_BPS', 'FEE_RECIPIENT', 'MAX_BNB_IN', 'MAX_DEADLINE_WINDOW', 'MAX_USDT_IN', 'POOL_FEE', 'ROUTER', 'USDT', 'WBNB', 'swapExactBnbForUsdt', 'swapExactUsdtForBnb'].sort());
  });
});
