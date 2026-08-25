import { describe, expect, it } from 'vitest';
import {
  BOT_MAINNET_CHAIN_ID,
  BOT_TESTNET_CHAIN_ID,
  assertProductionNetworkIdentifier,
  botChainId,
  classifyNetworkIdentifier,
  explorerBaseForChain,
  isBotChainId,
  isProductionNetworkIdentifierAllowed,
} from './canonicalNetworks';
import { OFFICIAL_CHAIN_IDS } from '@/lib/bridge/officialBridgeConfig';

describe('V30.1A canonical BOT network identity', () => {
  it('resolves BOT Mainnet to 677 and BOT Testnet to 968', () => {
    expect(BOT_MAINNET_CHAIN_ID).toBe(677);
    expect(BOT_TESTNET_CHAIN_ID).toBe(968);
    expect(botChainId('mainnet')).toBe(677);
    expect(botChainId('testnet')).toBe(968);
  });

  it('keeps the bridge configuration on the canonical identities', () => {
    expect(OFFICIAL_CHAIN_IDS.botMainnet).toBe(677);
    expect(OFFICIAL_CHAIN_IDS.botTestnet).toBe(968);
  });

  it('classifies 1024 as unverified legacy configuration', () => {
    expect(classifyNetworkIdentifier(1024)).toBe('UNVERIFIED_LEGACY');
    expect(classifyNetworkIdentifier(677)).toBe('BOT_MAINNET');
    expect(classifyNetworkIdentifier(968)).toBe('BOT_TESTNET');
    expect(classifyNetworkIdentifier(56)).toBe('FOREIGN');
    expect(isBotChainId(1024)).toBe(false);
  });

  it('fails closed on any production use of 1024', () => {
    expect(isProductionNetworkIdentifierAllowed(1024)).toBe(false);
    expect(isProductionNetworkIdentifierAllowed(677)).toBe(true);
    expect(() => assertProductionNetworkIdentifier(1024, 'wallet network request')).toThrow(
      /1024/,
    );
    expect(assertProductionNetworkIdentifier(677, 'deployment')).toBe(677);
  });

  it('maps explorers only for canonical BOT chains', () => {
    expect(explorerBaseForChain(677)).toBe('https://scan.botchain.ai');
    expect(explorerBaseForChain(968)).toBeTruthy();
    expect(explorerBaseForChain(1024)).toBeNull();
  });
});
