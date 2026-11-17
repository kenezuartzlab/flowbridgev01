import { describe, it, expect } from 'vitest';
import { platformFee, netAfterFeeAndGas, breakevenGrossOut, providerQuoteStatus, userCostBpsX100, weiToOutput } from './routeEconomics';
const E = 10n ** 18n;
describe('routeEconomics', () => {
  it('10 bps fee floors like the candidate', () => { expect(platformFee(5_906_915_275_001_778_263n, 10)).toBe(5_906_915_275_001_778n); });
  it('5 bps fee on 100 USDT is 0.05 USDT', () => { expect(platformFee(100n * E, 5)).toBe(5n * 10n ** 16n); });
  it('dust fee rounds to zero', () => { expect(platformFee(999n, 10)).toBe(0n); });
  it('rejects fee outside proposal range', () => { expect(() => platformFee(E, 101)).toThrow(); expect(() => platformFee(E, 2.5)).toThrow(); });
  it('gas counted once: 94,275 gas at 0.05 gwei and 600 USDT/BNB = 0.00282825 USDT', () => {
    const r = netAfterFeeAndGas({ grossOut: 100n * E, feeBps: 0, gasUnits: 94_275n, gasPriceWei: 50_000_000n, outPerBnbE18: 600n * E });
    expect(r.gasOut).toBe(2_828_250_000_000_000n); expect(r.net).toBe(100n * E - 2_828_250_000_000_000n);
  });
  it('breakeven: 94,275 gas, 0.05 gwei, 600 USDT/BNB, 5 bps -> 5.6565 USDT', () => {
    expect(breakevenGrossOut(5, 94_275n, 50_000_000n, 600n * E)).toBe(5_656_500_000_000_000_000n);
    expect(breakevenGrossOut(0, 94_275n, 1n, E)).toBeNull();
  });
  it('cost in bps: 10 bps fee and no gas = 10.00 bps', () => { expect(userCostBpsX100(100n * E, platformFee(100n * E, 10), 0n)).toBe(1000n); });
  it('weiToOutput floors', () => { expect(weiToOutput(1n, 600n * E)).toBe(600n); });
  it('0x fails closed without credentials or valid quote', () => {
    expect(providerQuoteStatus('BLOCKED_NO_CREDENTIALS', { buyAmount: '1' }).status).toBe('BLOCKED');
    expect(providerQuoteStatus('AVAILABLE', null).status).toBe('BLOCKED');
    expect(providerQuoteStatus('AVAILABLE', { buyAmount: '1e18' }).status).toBe('BLOCKED');
    expect(providerQuoteStatus('AVAILABLE', { buyAmount: '5' }).executable).toBe(false);
  });
});
