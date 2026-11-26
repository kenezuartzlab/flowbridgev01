import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { createVM } from '@ethereumjs/vm';
import { createCustomCommon, Mainnet, Hardfork } from '@ethereumjs/common';
import { Account, createAddressFromString, bytesToHex, hexToBytes } from '@ethereumjs/util';
import { decodeEventLog, decodeFunctionResult, encodeDeployData, encodeFunctionData, keccak256, toBytes } from 'viem';
import { grossFloorForNet, splitOutput } from '../../../src/lib/bnb/feePolicy';
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
const grossOf = (sell: boolean, amount: bigint) => sell ? amount * (E / 600n) / E : amount * 600n;
const swappedEvents = (result: any) => result.execResult.logs
  .filter((l: any) => bytesToHex(l[0]).toLowerCase() === adapter.toLowerCase())
  .map((l: any) => { try { return decodeEventLog({ abi: A.abi, topics: l[1].map((t: Uint8Array) => bytesToHex(t)), data: bytesToHex(l[2]) }); } catch { return null; } })
  .filter((e: any) => e?.eventName === 'Swapped');
const ledger = async () => [await native(user), await native(treasury), await read(U.abi, u, 'balanceOf', [user]), await read(U.abi, u, 'balanceOf', [treasury]), await read(W.abi, w, 'balanceOf', [treasury])];

beforeEach(async () => {
  vm = await createVM({ common, blockchain });
  for (const address of [user, other, guardian]) await vm.stateManager.putAccount(createAddressFromString(address), new Account(0n, 10n ** 25n));
  for (const [address, artifact] of [[w, W], [u, U], [r, R]] as const) await vm.stateManager.putCode(createAddressFromString(address), hexToBytes(`0x${artifact.evm.deployedBytecode.object}`));
  await ok(R.abi, r, 'setRate', [w, 600n * E]); await ok(R.abi, r, 'setRate', [u, E / 600n]);
  await ok(U.abi, u, 'mint', [user, 10000n * E]); await ok(U.abi, u, 'mint', [r, 1000000n * E]);
  await ok(W.abi, w, 'deposit', [], user, 1000n * E); await ok(W.abi, w, 'transfer', [r, 1000n * E]);
  const deployed = await deploy(A, [guardian, treasury, 5]); expect(deployed.execResult.exceptionError).toBeUndefined(); adapter = deployed.createdAddress.toString();
  await ok(U.abi, u, 'approve', [adapter, 10000n * E]);
});

describe('V1.17 owner-selected 5 bps on frozen V1.13 — local mock EVM only, no deployment', () => {
  it('immutables are exact owner EOAs and 5 bps', async () => {
    expect((await read(A.abi, adapter, 'GUARDIAN')).toLowerCase()).toBe(guardian.toLowerCase());
    expect((await read(A.abi, adapter, 'FEE_RECIPIENT')).toLowerCase()).toBe(treasury.toLowerCase());
    expect(await read(A.abi, adapter, 'FEE_BPS')).toBe(5);
  });

  for (const tier of [500, 2500]) for (const sell of [false, true]) {
    it(`${sell ? 'USDT->BNB' : 'BNB->USDT'} tier ${tier}: exact fee/net, event, Treasury asset, zero residual`, async () => {
      const amount = sell ? 6n * E : E / 100n, { fee, userNet, grossOut } = splitOutput(grossOf(sell, amount));
      const before = await ledger();
      const result = await swap(sell, { poolFee: tier, minNetOut: userNet }); expect(result.execResult.exceptionError).toBeUndefined();
      const after = await ledger();
      if (sell) { expect(after[0]! - before[0]!).toBe(userNet); expect(after[4]! - before[4]!).toBe(fee); expect(after[3]).toBe(before[3]); expect(after[1]).toBe(before[1]); }
      else { expect(after[2]! - before[2]!).toBe(userNet); expect(after[3]! - before[3]!).toBe(fee); expect(after[4]).toBe(before[4]); }
      const ev = swappedEvents(result); expect(ev).toHaveLength(1);
      expect(ev[0].args).toMatchObject({ bnbToUsdt: !sell, amountIn: amount, grossOut, fee, netOut: userNet });
      expect(ev[0].args.user.toLowerCase()).toBe(user);
      expect(await read(R.abi, r, 'lastTier')).toBe(tier);
      expect(await read(R.abi, r, 'lastMinimum')).toBe(grossFloorForNet(userNet));
      expect(await residual()).toEqual([0n, 0n, 0n, 0n, 0n]);
    });
  }

  for (const [amount, expectedFee] of [[3n, 0n], [4n, 1n], [1n, 0n]] as const) {
    it(`tiny BNB->USDT input ${amount} wei rounds fee down to ${expectedFee}`, async () => {
      const { fee, userNet } = splitOutput(amount * 600n); expect(fee).toBe(expectedFee);
      const before = await ledger();
      expect((await swap(false, { amountIn: amount, minNetOut: userNet })).execResult.exceptionError).toBeUndefined();
      const after = await ledger(); expect(after[2]! - before[2]!).toBe(userNet); expect(after[3]! - before[3]!).toBe(fee);
      expect(await residual()).toEqual([0n, 0n, 0n, 0n, 0n]);
    });
  }

  for (const sell of [false, true]) {
    it(`${sell ? 'USDT->BNB' : 'BNB->USDT'}: net+1 floor reverts with no ledger change`, async () => {
      const { userNet } = splitOutput(grossOf(sell, sell ? 6n * E : E / 100n));
      const before = await ledger();
      const result = await swap(sell, { minNetOut: userNet + 1n }); expect(result.execResult.exceptionError).toBeDefined();
      expect(await ledger()).toEqual(before); expect(await residual()).toEqual([0n, 0n, 0n, 0n, 0n]);
    });
  }

  it('Treasury USDT transfer failure rolls back whole swap, no residual', async () => {
    await ok(U.abi, u, 'setBlocked', [treasury, true]);
    const before = await ledger();
    expect((await swap(false)).execResult.exceptionError).toBeDefined();
    expect(await ledger()).toEqual(before); expect(await residual()).toEqual([0n, 0n, 0n, 0n, 0n]);
  });

  it('unauthorized pause rejected; Guardian pause blocks both directions', async () => {
    await reverted(call(A.abi, adapter, 'setPaused', [true], other), 'UnauthorizedGuardian()');
    await reverted(call(A.abi, adapter, 'setPaused', [true], treasury), 'UnauthorizedGuardian()');
    await ok(A.abi, adapter, 'setPaused', [true], guardian);
    await reverted(swap(false), 'Paused()'); await reverted(swap(true), 'Paused()');
  });

  it('chain 677 fence rejects deploy, swap and pause', async () => {
    vm = await createVM({ common: createCustomCommon({ chainId: 677 }, Mainnet, { hardfork: Hardfork.Cancun }), stateManager: vm.stateManager, blockchain });
    await reverted(deploy(A, [guardian, treasury, 5]), 'WrongChain()');
    await reverted(swap(false), 'WrongChain()');
    await reverted(call(A.abi, adapter, 'setPaused', [true], guardian), 'WrongChain()');
  });

  it('Treasury and Guardian receive nothing beyond fee in local fixture', async () => {
    const g0 = await native(guardian);
    await swap(false); await swap(true);
    expect(await native(guardian)).toBe(g0);
    expect(await native(treasury)).toBe(0n);
  });
});
