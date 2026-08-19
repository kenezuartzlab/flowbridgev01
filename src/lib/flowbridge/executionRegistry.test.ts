import { describe, expect, it } from 'vitest';
import {
  BOT_MAINNET_CHAIN_ID,
  BOT_TESTNET_CHAIN_ID,
  FLOW_BRIDGE_ROUTER_LENS_BOT_TESTNET,
  FLOW_BRIDGE_ROUTER_V4_BOT_TESTNET,
  FlowBridgeExecutionUnconfiguredError,
  LEGACY_FLOW_BRIDGE_ROUTER_V3_BOT_TESTNET,
  isFlowBridgeV4Configured,
  isFlowBridgeV4Target,
  requireFlowBridgeExecution,
  requireFlowBridgeV4Execution,
  resolveFlowBridgeExecution,
  resolveFlowBridgeV4Execution,
  resolveFlowBridgeExecutionForNetwork,
} from './executionRegistry';
import { VERIFIED_SWAP_PATHS } from '../swap/verifiedSwapConfig';

describe('FlowBridge execution registry', () => {
  it('resolves BOT Testnet to FlowBridgeRouterV4 with the Lens as discovery target', () => {
    const t = requireFlowBridgeExecution(BOT_TESTNET_CHAIN_ID);
    expect(t.routerVersion).toBe('v4');
    expect(t.router).toBe(FLOW_BRIDGE_ROUTER_V4_BOT_TESTNET);
    expect(t.discovery).toBe(FLOW_BRIDGE_ROUTER_LENS_BOT_TESTNET);
    expect(t.discoveryKind).toBe('lens');
    expect(t.supportsSafeSwaps).toBe(true);
  });

  it('never resolves execution to the legacy v3 testnet router', () => {
    expect(requireFlowBridgeExecution(BOT_TESTNET_CHAIN_ID).router).not.toBe(
      LEGACY_FLOW_BRIDGE_ROUTER_V3_BOT_TESTNET,
    );
  });

  it('classifies BOT Mainnet as legacy v3 with V4 promotion pending', () => {
    const t = requireFlowBridgeExecution(BOT_MAINNET_CHAIN_ID);
    expect(t.routerVersion).toBe('v3-legacy');
    expect(t.discoveryKind).toBe('router');
    expect(t.supportsSafeSwaps).toBe(false);
    expect(t.legacy).toBe(true);
    expect(t.v4Configured).toBe(false);
    expect(t.v4Enabled).toBe(false);
    expect(t.promotionPending).toBe(true);
  });

  it('resolves V4 only on BOT Testnet 968', () => {
    expect(isFlowBridgeV4Configured(BOT_TESTNET_CHAIN_ID)).toBe(true);
    expect(requireFlowBridgeV4Execution(BOT_TESTNET_CHAIN_ID).router).toBe(
      FLOW_BRIDGE_ROUTER_V4_BOT_TESTNET,
    );
  });

  it('reports V4 as unconfigured on BOT Mainnet 677 and BNB Mainnet 56', () => {
    for (const chainId of [BOT_MAINNET_CHAIN_ID, 56]) {
      expect(resolveFlowBridgeV4Execution(chainId).configured).toBe(false);
      expect(isFlowBridgeV4Configured(chainId)).toBe(false);
      expect(() => requireFlowBridgeV4Execution(chainId)).toThrow(
        FlowBridgeExecutionUnconfiguredError,
      );
    }
  });

  it('never resolves a testnet Router/Lens address on chain 677 or 56', () => {
    const testnetAddrs = [
      FLOW_BRIDGE_ROUTER_V4_BOT_TESTNET,
      FLOW_BRIDGE_ROUTER_LENS_BOT_TESTNET,
      LEGACY_FLOW_BRIDGE_ROUTER_V3_BOT_TESTNET,
    ];
    for (const chainId of [BOT_MAINNET_CHAIN_ID, 56]) {
      const entry = resolveFlowBridgeExecution(chainId);
      if (entry.configured) {
        expect(testnetAddrs).not.toContain(entry.router);
        expect(testnetAddrs).not.toContain(entry.discovery);
      }
    }
  });

  it('legacy mainnet metadata cannot satisfy a V4 resolver check', () => {
    const legacy = requireFlowBridgeExecution(BOT_MAINNET_CHAIN_ID);
    expect(legacy.configured).toBe(true);
    expect(isFlowBridgeV4Target(legacy)).toBe(false);
  });

  it('keeps the official bridge direct on every configured chain', () => {
    for (const isMainnet of [true, false]) {
      expect(resolveFlowBridgeExecutionForNetwork(isMainnet).bridgeProxyEnabled).toBe(false);
    }
  });

  it('reports BNB chains and unknown chains as unconfigured, and fails closed', () => {
    for (const chainId of [97, 56, 1]) {
      expect(resolveFlowBridgeExecution(chainId).configured).toBe(false);
      expect(() => requireFlowBridgeExecution(chainId)).toThrow(
        FlowBridgeExecutionUnconfiguredError,
      );
    }
  });

  it('binds the verified swap path to the canonical V4 router', () => {
    const path = VERIFIED_SWAP_PATHS.find((p) => p.chainId === BOT_TESTNET_CHAIN_ID);
    expect(path?.router).toBe(FLOW_BRIDGE_ROUTER_V4_BOT_TESTNET);
  });
});
