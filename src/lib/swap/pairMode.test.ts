import { describe, expect, it } from 'vitest';
import { initialSwapPair } from './pairMode';

describe('swap pair defaults', () => {
  it('starts Any pair with BOT and USDT', () => {
    expect(initialSwapPair('ANY', null)).toEqual({ tokenInSymbol: 'BOT', tokenOutSymbol: 'USDT', amount: '' });
  });
  it('keeps the deliberate Any pair draft', () => {
    expect(initialSwapPair('ANY', { chainScope: 'MAINNET', tokenInSymbol: 'FLOW', tokenOutSymbol: 'CA', amount: '12' }))
      .toEqual({ tokenInSymbol: 'FLOW', tokenOutSymbol: 'CA', amount: '12' });
  });
  it('CA/BOT starts with CA to BOT, not the unrelated Any pair draft', () => {
    expect(initialSwapPair('CA/BOT', { chainScope: 'MAINNET', tokenInSymbol: 'FLOW', tokenOutSymbol: 'USDT', amount: '12' }))
      .toEqual({ tokenInSymbol: 'CA', tokenOutSymbol: 'BOT', amount: '' });
  });
});