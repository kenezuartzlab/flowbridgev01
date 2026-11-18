import { describe, expect, it } from 'vitest';
import { customRouteCost } from './customRouteEconomics';

const E = 10n ** 18n;
const base = { grossOutput: (1000n * E).toString(), proposalFeeBps: 5 as const, extraGasUnits: '94275', gasPriceWei: '50000000', outputPerBnb: (59428n * E / 100n).toString() };

describe('custom route incremental cost disclosure', () => {
  it('combines the proposed 5 bps output fee and 94,275 extra gas exactly once', () => {
    const result = customRouteCost(base)!;
    const expectedGas = 94_275n * 50_000_000n * (59428n * E / 100n) / E;
    expect(result.feeOutput).toBe((E / 2n).toString());
    expect(result.extraGasOutput).toBe(expectedGas.toString());
    expect(result.incrementalCostOutput).toBe((E / 2n + expectedGas).toString());
    expect(result.directRoutePlatformFeeBps).toBe(0);
    expect(result.proposalOnly).toBe(true);
    expect(result.approved).toBe(false);
  });

  it('doubles only the output-fee component for the unapproved 10 bps scenario', () => {
    const five = customRouteCost(base)!;
    const ten = customRouteCost({ ...base, proposalFeeBps: 10 })!;
    expect(ten.feeOutput).toBe((BigInt(five.feeOutput) * 2n).toString());
    expect(ten.extraGasOutput).toBe(five.extraGasOutput);
  });

  it('shows a small-swap gas burden instead of hiding it behind a fee-only percentage', () => {
    const small = customRouteCost({ ...base, grossOutput: E.toString() })!;
    expect(BigInt(small.extraGasOutput)).toBeGreaterThan(BigInt(small.feeOutput));
    expect(small.comparison).toBe('ADAPTER_INCREMENT_ONLY_COMMON_DIRECT_GAS_EXCLUDED');
  });

  it('fails closed on malformed values, zero rates and non-proposal fee values', () => {
    expect(customRouteCost({ ...base, grossOutput: '1.5' })).toBeNull();
    expect(customRouteCost({ ...base, outputPerBnb: '0' })).toBeNull();
    expect(customRouteCost({ ...base, proposalFeeBps: 0 as 5 })).toBeNull();
  });
});
