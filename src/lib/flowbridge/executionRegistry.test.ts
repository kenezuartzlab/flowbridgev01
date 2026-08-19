import { describe, expect, it } from 'vitest';
import {
  BOT_MAINNET_CHAIN_ID,
  BOT_TESTNET_CHAIN_ID,
  FLOW_BRIDGE_ROUTER_LENS_BOT_TESTNET,
  FLOW_BRIDGE_ROUTER_V4_BOT_TESTNET,
  FlowBridgeExecutionUnconfiguredError,
  LEGACY_FLOW_BRIDGE_ROUTER_V3_BOT_TESTNET,
  requireFlowBridgeExecution,
  resolveFlowBridgeExecution,
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

  it('keeps BOT Mainnet on the existing v3 router (V4 mainnet deferred)', () => {
    const t = requireFlowBridgeExecution(BOT_MAINNET_CHAIN_ID);
    expect(t.routerVersion).toBe('v3');
    expect(t.discoveryKind).toBe('router');
    expect(t.supportsSafeSwaps).toBe(false);
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
