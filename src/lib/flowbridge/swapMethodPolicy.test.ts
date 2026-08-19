import { describe, expect, it } from 'vitest';
import {
  BOT_MAINNET_CHAIN_ID,
  BOT_TESTNET_CHAIN_ID,
  requireFlowBridgeExecution,
} from './executionRegistry';
import {
  FlowBridgeFeeReadUnavailableError,
  requireSafeSwapDecision,
  resolveSwapMethodMode,
} from './swapMethodPolicy';

const testnet = () => requireFlowBridgeExecution(BOT_TESTNET_CHAIN_ID);
const mainnetLegacy = () => requireFlowBridgeExecution(BOT_MAINNET_CHAIN_ID);

describe('FlowBridge swap method policy', () => {
  it('uses fee-bound safe methods on BOT Testnet 968 when the fee read succeeds', () => {
    expect(resolveSwapMethodMode({ target: testnet(), feeKnown: true })).toEqual({ mode: 'safe' });
    expect(requireSafeSwapDecision({ target: testnet(), feeKnown: true })).toBe(true);
  });

  it('fails closed on BOT Testnet 968 when the fee read fails — no approval, no swap write', () => {
    const decision = resolveSwapMethodMode({ target: testnet(), feeKnown: false });
    expect(decision.mode).toBe('fail-closed');
    expect(() => requireSafeSwapDecision({ target: testnet(), feeKnown: false })).toThrow(
      FlowBridgeFeeReadUnavailableError,
    );
  });

  it('never selects a legacy V3-compatible method on the canonical V4 path', () => {
    for (const feeKnown of [true, false]) {
      expect(resolveSwapMethodMode({ target: testnet(), feeKnown }).mode).not.toBe('legacy');
    }
  });

  it('allows legacy calls only on an explicitly legacy execution target', () => {
    expect(resolveSwapMethodMode({ target: mainnetLegacy(), feeKnown: false })).toEqual({
      mode: 'legacy',
    });
    expect(requireSafeSwapDecision({ target: mainnetLegacy(), feeKnown: true })).toBe(false);
  });

  it('fails closed when a V4 target somehow lacks safe entry points', () => {
    const broken = { chainId: 968, routerVersion: 'v4' as const, supportsSafeSwaps: false };
    expect(resolveSwapMethodMode({ target: broken, feeKnown: true }).mode).toBe('fail-closed');
  });
});
