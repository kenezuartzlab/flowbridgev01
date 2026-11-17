import { describe, it, expect } from 'vitest';
import { MAINNET_CONTRACTS, USDT_BRIDGE_RESOURCE_ID } from '@/lib/contracts';
import { ETHEREUM_RPC_URLS } from '@/lib/wagmi';

// Values from https://dev-docs.botchain.ai/docs/Bridge/contract-addresses/ (checked 2026-11-17).
describe('official BOT bridge Ethereum config', () => {
  it('uses the official Ethereum BridgeGateway and USDT', () => {
    expect(MAINNET_CONTRACTS.ethBridgeProxy.toLowerCase()).toBe('0x2945d3af6f012e49f7421252b5fb57d1bb7e6edd');
    expect(MAINNET_CONTRACTS.usdtEth.toLowerCase()).toBe('0xdac17f958d2ee523a2206206994597c13d831ec7');
    expect(MAINNET_CONTRACTS.botBridgeProxy.toLowerCase()).toBe('0xef8dc669eca13e612b67ff09478352e85bd6cc53');
    expect(MAINNET_CONTRACTS.usdtBot.toLowerCase()).toBe('0xababc7ddc03e501d190c676bf3d92ef0e6e87a3c');
    expect(USDT_BRIDGE_RESOURCE_ID).toBe('0xac589789ed8c9d2c61f17b13369864b5f181e58eba230a6ee4ec4c3e7750cd1d');
  });
  it('never uses the failing llamarpc Ethereum endpoint', () => {
    expect(ETHEREUM_RPC_URLS).not.toContain('https://eth.llamarpc.com');
    expect(ETHEREUM_RPC_URLS.length).toBeGreaterThanOrEqual(2);
  });
});
