import { describe, expect, it } from 'vitest';
import { isBridgeDirectionSelectable, isBridgePeerSelectable, SELECTABLE_BRIDGE_PEERS } from './peerAvailability';

describe('bridge peer availability', () => {
  it('Tron is not selectable', () => {
    expect(isBridgePeerSelectable('TRX')).toBe(false);
    expect(SELECTABLE_BRIDGE_PEERS).not.toContain('TRX');
  });
  it('both Tron directions are blocked, including stale selections', () => {
    expect(isBridgeDirectionSelectable('BOT_TO_TRX')).toBe(false);
    expect(isBridgeDirectionSelectable('TRX_TO_BOT')).toBe(false);
  });
  it('Ethereum and BNB choices remain unchanged', () => {
    for (const peer of ['BNB', 'ETH']) {
      expect(isBridgePeerSelectable(peer)).toBe(true);
      expect(isBridgeDirectionSelectable(`BOT_TO_${peer}`)).toBe(true);
      expect(isBridgeDirectionSelectable(`${peer}_TO_BOT`)).toBe(true);
    }
  });
});