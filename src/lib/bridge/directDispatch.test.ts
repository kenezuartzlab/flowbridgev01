import { describe, expect, it } from 'vitest';
import { directApprovalSpender, resolveBridgeDispatch } from './directDispatch';
import {
  findOfficialTestnetRoute,
  officialSourceDecimals,
  OFFICIAL_CHAIN_IDS,
} from './officialBridgeConfig';
import {
  isBridgeAdapterExecutionTestnetEnabled,
  isBridgeAdapterRefundClaimTestnetEnabled,
  isBridgeAdapterTestnetEnabled,
} from './adapterConfig';

const base = { isMainnet: false, walletChainId: OFFICIAL_CHAIN_IDS.bnbTestnet };

describe('Phase A1 direct official bridge dispatch', () => {
  it('adapter flags are unset in this environment', () => {
    expect(isBridgeAdapterTestnetEnabled()).toBe(false);
    expect(isBridgeAdapterExecutionTestnetEnabled()).toBe(false);
    expect(isBridgeAdapterRefundClaimTestnetEnabled()).toBe(false);
  });

  it('selects the direct official gateway branch with flags unset', () => {
    for (const bridgeDirection of ['BNB_TO_BOT', 'BOT_TO_BNB']) {
      const d = resolveBridgeDispatch({ ...base, bridgeDirection });
      expect(d.strategy).toBe('direct-official');
      expect(d.adapterRoute).toBeNull();
    }
  });

  it('stays direct on mainnet even if flags were forced on', () => {
    const d = resolveBridgeDispatch({
      isMainnet: true,
      bridgeDirection: 'BNB_TO_BOT',
      flagEnabled: true,
      executionFlagEnabled: true,
      walletChainId: OFFICIAL_CHAIN_IDS.bnbMainnet,
    });
    expect(d.strategy).toBe('direct-official');
  });

  it('preview flag alone never leaves the direct path', () => {
    const d = resolveBridgeDispatch({
      ...base,
      bridgeDirection: 'BNB_TO_BOT',
      flagEnabled: true,
      executionFlagEnabled: false,
    });
    expect(d.strategy).toBe('direct-official');
  });

  it('approval spender on the direct path is the official gateway', () => {
    const route = findOfficialTestnetRoute('BNB_TO_BOT')!;
    expect(directApprovalSpender(route.gateway)).toBe(route.gateway);
    expect(route.direct).toBe(true);
  });

  it('official testnet route config matches the verified addresses', () => {
    const bnb = findOfficialTestnetRoute('BNB_TO_BOT')!;
    expect(bnb.gateway).toBe('0xbCAA929FdB16f5a7185C96A4Ed0CC4F25ab86E40');
    expect(bnb.sourceToken).toBe('0x5d012516D129Ab3aE7673FE32E5ABFCD9be4d086');
    const bot = findOfficialTestnetRoute('BOT_TO_BNB')!;
    expect(bot.gateway).toBe('0x6239404Aa276ba68486E2Fa40E90CDd36ff8ec3A');
    expect(bot.sourceToken).toBe('0x75edC9335175Fc0552D51D48439F229c10420fe3');
  });

  it('uses 18 decimals on BNB testnet source and 6 on BOT testnet source', () => {
    expect(findOfficialTestnetRoute('BNB_TO_BOT')!.sourceDecimals).toBe(18);
    expect(findOfficialTestnetRoute('BOT_TO_BNB')!.sourceDecimals).toBe(6);
    expect(officialSourceDecimals(OFFICIAL_CHAIN_IDS.bnbTestnet)).toBe(18);
    expect(officialSourceDecimals(OFFICIAL_CHAIN_IDS.botTestnet)).toBe(6);
  });
});
