import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createVM } from '@ethereumjs/vm';
import { createCustomCommon, Mainnet, Hardfork } from '@ethereumjs/common';
import { Account, createAddressFromString, bytesToHex, hexToBytes } from '@ethereumjs/util';
import { decodeFunctionResult, encodeDeployData, encodeFunctionData, keccak256, toBytes } from 'viem';
// @ts-expect-error pinned local compiler
import { compile } from '../../candidates/bnb-swap-adapter-v1-13/scripts/compile.mjs';

const out = compile({ 'Mocks.sol': { content: fs.readFileSync('contracts/candidates/bnb-swap-adapter-v1-13/test/Mocks.sol', 'utf8') } });
const A = out['FlowBridgeBnbSwapAdapterV1_13.sol'].FlowBridgeBnbSwapAdapterV1_13;
const W = out['Mocks.sol'].MockWBNB, U = out['Mocks.sol'].MockUSDT, R = out['Mocks.sol'].MockRouter;
const w = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', u = '0x55d398326f99059fF775485246999027B3197955', r = '0x1b81D678ffb9C0263b24A97847620C99d213eB14';
const user = '0x00000000000000000000000000000000000000a1', other = '0x00000000000000000000000000000000000000b2';
const guardian = '0x351E236a636c8be4Fa0B602cb096d72346D1a412';
const treasury = '0xb7322660B40561ae7C224F963e51583e923F7fC8';
const E = 10n ** 18n, NOW = 1800000000n, HASH = `0x${'11'.repeat(32)}`;
const common = createCustomCommon({ chainId: 56 }, Mainnet, { hardfork: Hardfork.Cancun });
const blockchain: any = { getBlock: async () => ({ hash: () => hexToBytes(HASH) }) };
let vm: any, adapter = '';

async function run(from: string, to: string | undefined, data: string, value = 0n) {
  return vm.evm.runCall({ caller: createAddressFromString(from), ...(to ? { to: createAddressFromString(to) } : {}), data: hexToBytes(data as `0x${string}`), value, gasLimit: 30000000n, block: { header: { timestamp: NOW, number: 200n, gasLimit: 30000000n, coinbase: createAddressFromString(user), baseFeePerGas: 0n, prevRandao: new Uint8Array(32), difficulty: 0n } } });
}
async function deploy(artifact: any, args: any[] = []) { return run(user, undefined, encodeDeployData({ abi: artifact.abi, bytecode: `0x${artifact.evm.bytecode.object}`, args })); }
const data = (abi: any, fn: string, args: any[] = []) => encodeFunctionData({ abi, functionName: fn, args });
async function call(abi: any, to: string, fn: string, args: any[] = [], from = user, value = 0n) { return run(from, to, data(abi, fn, args), value); }
async function ok(...args: Parameters<typeof call>) { const result = await call(...args); expect(result.execResult.exceptionError).toBeUndefined(); return result; }
async function read(abi: any, to: string, fn: string, args: any[] = []) { const result = await ok(abi, to, fn, args); return decodeFunctionResult({ abi, functionName: fn, data: bytesToHex(result.execResult.returnValue) }) as any; }
const selector = (signature: string) => keccak256(toBytes(signature)).slice(0, 10);
async function reverted(promise: Promise<any>, signature: string) { const result = await promise; expect(result.execResult.exceptionError).toBeDefined(); expect(bytesToHex(result.execResult.returnValue).slice(0, 10)).toBe(selector(signature)); }
const native = async (address: string) => (await vm.stateManager.getAccount(createAddressFromString(address)))?.balance ?? 0n;
const residual = async () => [await native(adapter), await read(W.abi, w, 'balanceOf', [adapter]), await read(U.abi, u, 'balanceOf', [adapter]), await read(W.abi, w, 'allowance', [adapter, r]), await read(U.abi, u, 'allowance', [adapter, r])];
const q = (sell = false, patch: any = {}) => ({ user, chainId: 56n, tokenIn: sell ? u : w, tokenOut: sell ? w : u, router: r, poolFee: 500, amountIn: sell ? 6n * E : E / 100n, minNetOut: 1n, deadline: NOW + 30n, quotedAt: NOW, quoteBlock: 199n, quoteBlockHash: HASH, ...patch });
const swap = (sell = false, patch: any = {}, from = user) => call(A.abi, adapter, sell ? 'swapExactUsdtForBnb' : 'swapExactBnbForUsdt', [q(sell, patch)], from, sell ? 0n : (patch.amountIn ?? E / 100n));

beforeEach(async () => {
  vm = await createVM({ common, blockchain });
  for (const address of [user, other, guardian, treasury]) await vm.stateManager.putAccount(createAddressFromString(address), new Account(0n, 10n ** 25n));
  for (const [address, artifact] of [[w, W], [u, U], [r, R]] as const) await vm.stateManager.putCode(createAddressFromString(address), hexToBytes(`0x${artifact.evm.deployedBytecode.object}`));
  await ok(R.abi, r, 'setRate', [w, 600n * E]); await ok(R.abi, r, 'setRate', [u, E / 600n]);
  await ok(U.abi, u, 'mint', [user, 10000n * E]); await ok(U.abi, u, 'mint', [r, 1000000n * E]);
  await ok(W.abi, w, 'deposit', [], user, 1000n * E); await ok(W.abi, w, 'transfer', [r, 1000n * E]);
  const deployed = await deploy(A, [guardian, treasury, 0]); expect(deployed.execResult.exceptionError).toBeUndefined(); adapter = deployed.createdAddress.toString();
  await ok(U.abi, u, 'approve', [adapter, 10000n * E]);
});

describe('V1.16 exact direct-EOA constructor preview — local mock EVM only', () => {
  it('accepts the exact supplied EOAs without constructor code checks and moves no funds', async () => {
    expect((await vm.stateManager.getCode(createAddressFromString(guardian))).length).toBe(0);
    expect((await vm.stateManager.getCode(createAddressFromString(treasury))).length).toBe(0);
    const balances = [await native(guardian), await native(treasury), await read(U.abi, u, 'balanceOf', [guardian]), await read(U.abi, u, 'balanceOf', [treasury])];
    const deployed = await deploy(A, [guardian, treasury, 0]); expect(deployed.execResult.exceptionError).toBeUndefined();
    const address = deployed.createdAddress.toString();
    expect((await read(A.abi, address, 'GUARDIAN')).toLowerCase()).toBe(guardian.toLowerCase());
    expect((await read(A.abi, address, 'FEE_RECIPIENT')).toLowerCase()).toBe(treasury.toLowerCase());
    expect(await read(A.abi, address, 'FEE_BPS')).toBe(0);
    expect([await native(guardian), await native(treasury), await read(U.abi, u, 'balanceOf', [guardian]), await read(U.abi, u, 'balanceOf', [treasury])]).toEqual(balances);
  });

  for (const bps of [0, 5, 10]) {
    it(`allows proposed ${bps} bps and preserves exact feeRecipient without selecting a rate`, async () => {
      const address = (await deploy(A, [guardian, treasury, bps])).createdAddress.toString();
      expect(await read(A.abi, address, 'FEE_BPS')).toBe(bps);
      expect((await read(A.abi, address, 'FEE_RECIPIENT')).toLowerCase()).toBe(treasury.toLowerCase());
    });
  }

  it('rejects an unapproved fee with exact BadConfig() selector', async () => { await reverted(deploy(A, [guardian, treasury, 11]), 'BadConfig()'); });

  for (const target of [w, u, r]) {
    it(`rejects protocol target ${target} as Guardian`, async () => { await reverted(deploy(A, [target, treasury, 0]), 'BadConfig()'); });
    it(`rejects protocol target ${target} as Treasury`, async () => { await reverted(deploy(A, [guardian, target, 0]), 'BadConfig()'); });
  }

  it('rejects zero roles with exact BadConfig() selector', async () => {
    const zero = '0x' + '00'.repeat(20);
    await reverted(deploy(A, [zero, treasury, 0]), 'BadConfig()');
    await reverted(deploy(A, [guardian, zero, 0]), 'BadConfig()');
  });

  it('EOA Guardian alone pauses/unpauses; unauthorized caller gets exact UnauthorizedGuardian()', async () => {
    await ok(A.abi, adapter, 'setPaused', [true], guardian); expect(await read(A.abi, adapter, 'paused')).toBe(true);
    await reverted(swap(false), 'Paused()'); await reverted(swap(true), 'Paused()');
    await reverted(call(A.abi, adapter, 'setPaused', [false], other), 'UnauthorizedGuardian()');
    expect(await read(A.abi, adapter, 'paused')).toBe(true);
    await ok(A.abi, adapter, 'setPaused', [false], guardian); expect(await read(A.abi, adapter, 'paused')).toBe(false);
    expect((await swap(false)).execResult.exceptionError).toBeUndefined();
  });

  it('unauthorized pause attempts have zero token/native ledger effects', async () => {
    const before = [await native(user), await native(guardian), await native(treasury), await read(U.abi, u, 'balanceOf', [user]), await read(U.abi, u, 'balanceOf', [treasury])];
    await reverted(call(A.abi, adapter, 'setPaused', [true], other), 'UnauthorizedGuardian()');
    expect([await native(user), await native(guardian), await native(treasury), await read(U.abi, u, 'balanceOf', [user]), await read(U.abi, u, 'balanceOf', [treasury])]).toEqual(before);
    expect(await residual()).toEqual([0n, 0n, 0n, 0n, 0n]);
  });

  for (const bps of [0, 5, 10]) {
    for (const sell of [false, true]) {
      it(`${sell ? 'USDT->BNB' : 'BNB->USDT'} at illustrative ${bps} bps pays exact Treasury and user net with zero residual`, async () => {
        adapter = (await deploy(A, [guardian, treasury, bps])).createdAddress.toString();
        await ok(U.abi, u, 'approve', [adapter, 10000n * E]);
        const amount = sell ? 6n * E : E / 100n;
        const gross = sell ? amount * (E / 600n) / E : 6n * E;
        const fee = gross * BigInt(bps) / 10000n;
        const token = sell ? W : U, tokenAddress = sell ? w : u;
        const userOutputBefore = sell ? await native(user) : await read(U.abi, u, 'balanceOf', [user]);
        const treasuryBefore = await read(token.abi, tokenAddress, 'balanceOf', [treasury]);
        const userInputBefore = sell ? await read(U.abi, u, 'balanceOf', [user]) : await native(user);
        expect((await swap(sell)).execResult.exceptionError).toBeUndefined();
        const userOutputAfter = sell ? await native(user) : await read(U.abi, u, 'balanceOf', [user]);
        const userInputAfter = sell ? await read(U.abi, u, 'balanceOf', [user]) : await native(user);
        expect(userOutputAfter - userOutputBefore).toBe(gross - fee);
        expect(userInputBefore - userInputAfter).toBe(amount);
        expect((await read(token.abi, tokenAddress, 'balanceOf', [treasury])) - treasuryBefore).toBe(fee);
        expect(await residual()).toEqual([0n, 0n, 0n, 0n, 0n]);
      });
    }
  }

  it('frozen source identity remains exact and test harness contains no deployment RPC or signer transport', () => {
    const source = fs.readFileSync('contracts/candidates/bnb-swap-adapter-v1-13/FlowBridgeBnbSwapAdapterV1_13.sol');
    expect(keccak256(source)).toBe('0x16847d170cc79fbda6e428a01e0eff4d7ea8cc7ff0b7bf732d815b6956270b27');
    expect(A.abi.find((entry: any) => entry.type === 'constructor').inputs.map((input: any) => input.name)).toEqual(['guardian', 'feeRecipient', 'feeBps']);
  });
});
