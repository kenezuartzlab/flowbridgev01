import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { FEE_POLICY, describeFee, grossFloorForNet, minNetFromEstimate, splitOutput } from './feePolicy';

const E = 10n ** 18n;
describe('V1.17 owner-selected 5 bps fee policy (non-executable)', () => {
  it('rate is 5 bps / 0.05% to the owner EOA, not payable or charged now', () => {
    expect(FEE_POLICY).toMatchObject({ bps: 5, ratePercent: '0.05%', side: 'OUTPUT', intendedRecipient: '0xb7322660B40561ae7C224F963e51583e923F7fC8', payableConfigurationAuthorized: false, feesChargedNow: false, executionEnabled: false });
  });
  it('fee = floor(gross*5/10000), net = gross - fee', () => {
    expect(splitOutput(6n * E)).toEqual({ grossOut: 6n * E, fee: 3n * 10n ** 15n, userNet: 5_997n * 10n ** 15n });
    expect(splitOutput(1999n)).toEqual({ grossOut: 1999n, fee: 0n, userNet: 1999n });
    expect(splitOutput(2000n)).toEqual({ grossOut: 2000n, fee: 1n, userNet: 1999n });
    expect(splitOutput(0n).fee).toBe(0n);
  });
  it('rejects unsupported rates and negative gross', () => {
    expect(() => splitOutput(1n, 7)).toThrow('UNSUPPORTED_BPS');
    expect(() => splitOutput(-1n)).toThrow('NEGATIVE_GROSS');
  });
  it('gross floor is the smallest gross reaching the net floor', () => {
    for (const net of [1n, 1999n, 2000n, 5_997n * 10n ** 15n, 123_456_789n]) {
      const g = grossFloorForNet(net);
      expect(splitOutput(g).userNet >= net).toBe(true);
      expect(splitOutput(g - 1n).userNet < net).toBe(true);
    }
  });
  it('min net applies slippage once to post-fee net (no double fee)', () => {
    const gross = 6n * E, net = splitOutput(gross).userNet;
    expect(minNetFromEstimate(gross, 0)).toBe(net);
    expect(minNetFromEstimate(gross, 100)).toBe(net * 9900n / 10000n);
    expect(minNetFromEstimate(gross, 100)).not.toBe(splitOutput(net * 9900n / 10000n).userNet);
    expect(() => minNetFromEstimate(gross, -1)).toThrow('BAD_SLIPPAGE');
  });
  it('direction assets: BNB->USDT fee in USDT; USDT->BNB fee in WBNB, user gets native BNB', () => {
    expect(describeFee('BNB_TO_USDT', 6n * E)).toMatchObject({ feePaidIn: 'USDT', userReceives: 'USDT', kind: 'ESTIMATED', gasEstimate: null, poolFeeIncluded: false, executable: false });
    expect(describeFee('USDT_TO_BNB', E / 100n, 'ACTUAL')).toMatchObject({ feePaidIn: 'WBNB', userReceives: 'NATIVE_BNB', kind: 'ACTUAL', fee: 5n * 10n ** 12n });
  });
  it('disclosures mention Pancake pool fees, gas, estimates and no double deduction', () => {
    const d = describeFee('BNB_TO_USDT', E).disclosures.join(' ');
    for (const s of ['PancakeSwap pool fees', 'gas', 'estimates', 'not deducted twice', 'not enabled']) expect(d).toContain(s);
  });
  it('module has no signing, network or execution surface', () => {
    const src = fs.readFileSync('src/lib/bnb/feePolicy.ts', 'utf8');
    for (const bad of ['fetch(', 'eth_send', 'sendTransaction', 'personal_sign', 'signTypedData', 'approve(', 'encodeFunctionData', 'window.']) expect(src).not.toContain(bad);
  });
});
