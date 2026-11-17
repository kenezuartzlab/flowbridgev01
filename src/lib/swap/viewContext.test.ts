import { describe, expect, it } from 'vitest';
import { isSwapView, swapViewCanExecute } from './viewContext';
import { requireFlowBridgeExecution, requireFlowBridgeV4Execution } from '@/lib/flowbridge/executionRegistry';
describe('view selection never authorizes BNB execution', () => {
  it('recognizes exactly BOT 677, BNB 56 and existing BOT Testnet 968', () => {
    expect([677, 56, 968].map(isSwapView)).toEqual([true, true, true]);
    expect([1, 97, 0].map(isSwapView)).toEqual([false, false, false]);
  });
  it('BNB 56 cannot execute even with a matching wallet', () => {
    expect(swapViewCanExecute(56, 56)).toBe(false);
    expect(() => requireFlowBridgeExecution(56)).toThrow();
    expect(() => requireFlowBridgeV4Execution(56)).toThrow();
  });
  it('BOT 677 requires its own wallet network', () => {
    expect(swapViewCanExecute(677, 677)).toBe(true);
    expect(swapViewCanExecute(677, 56)).toBe(false);
    expect(swapViewCanExecute(677, undefined)).toBe(false);
  });
  it('unknown chain fails closed', () => {
    expect(swapViewCanExecute(1, 1)).toBe(false);
    expect(() => requireFlowBridgeExecution(1)).toThrow();
  });
});