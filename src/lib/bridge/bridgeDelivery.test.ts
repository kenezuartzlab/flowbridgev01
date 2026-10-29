import { describe, it, expect } from 'vitest';
import { encodeAbiParameters, pad, type Hex } from 'viem';
import pair from './__fixtures__/testnetBridgePair.json';
import { bridgeRoute, decodeSourceDeposit, matchDelivery, scaleAmount, type RawLog } from './bridgeDelivery';
import { trackingState } from './trackingState';

// Real BOT Testnet deposit 0x5213…e733 (nonce 1104) and BNB Testnet release 0x44c9…008e.
const route = bridgeRoute('BOT_TO_BNB', false)!;
const src = pair.source as { status: 'success'; logs: RawLog[] };
const dst = pair.destination as { status: 'success' | 'reverted'; logs: RawLog[] };
const RECIPIENT = '0xFA3DE5CFa1DE8EcC36197dCC0FC34fef5c1C7e47';

describe('official bridge delivery correlation', () => {
  it('decodes the source transfer identity (nonce + destination chain)', () => {
    const dep = decodeSourceDeposit(src.logs, route)!;
    expect(dep.nonce).toBe(1104n);
    expect(dep.destinationChainId).toBe(97n);
    expect(dep.receiveAmount).toBe(100_000_000n);
  });
  it('a valid correlated release + USDT transfer matches and advances the tracker', () => {
    const dep = decodeSourceDeposit(src.logs, route)!;
    const m = matchDelivery(dst, dep, route, RECIPIENT);
    expect(m).toEqual({ ok: true, amount: 100n * 10n ** 18n });
    const s = trackingState({ txHash: '0x1', source: 'success', sourceConfirmedAt: 1, providerRequired: true, providerAcceptedAt: 2, destinationTxHash: '0x2', destinationConfirmed: true, destinationTokenArrival: true }, 3);
    expect(s.phase).toBe('received');
  });
  it('rejects a release for a different nonce', () => {
    const dep = { ...decodeSourceDeposit(src.logs, route)!, nonce: 1105n };
    expect(matchDelivery(dst, dep, route).ok).toBe(false);
  });
  it('rejects wrong recipient, wrong chain route and failed destination receipt', () => {
    const dep = decodeSourceDeposit(src.logs, route)!;
    expect(matchDelivery(dst, dep, route, '0x0000000000000000000000000000000000000001').ok).toBe(false);
    expect(matchDelivery({ ...dst, status: 'reverted' }, dep, route).ok).toBe(false);
    const wrongChain = { ...route, source: { ...route.source, chainId: 677 } };
    expect(matchDelivery(dst, dep, wrongChain).ok).toBe(false);
    expect(decodeSourceDeposit(src.logs, bridgeRoute('BOT_TO_BNB', true)!)).toBeNull();
  });
  it('rejects an ExecuteEvent without the matching USDT transfer, or from another contract', () => {
    const dep = decodeSourceDeposit(src.logs, route)!;
    const noTransfer = { ...dst, logs: dst.logs.filter(l => l.address.toLowerCase() !== route.destination.usdt.toLowerCase()) };
    expect(matchDelivery(noTransfer, dep, route)).toEqual({ ok: false, reason: 'no USDT transfer to recipient' });
    const spoofed = { ...dst, logs: dst.logs.map(l => ({ ...l, address: '0x000000000000000000000000000000000000dEaD' })) };
    expect(matchDelivery(spoofed, dep, route).ok).toBe(false);
  });
  it('an unrelated USDT transfer to the recipient never completes the bridge', () => {
    const dep = decodeSourceDeposit(src.logs, route)!;
    const unrelated: RawLog = {
      address: route.destination.usdt,
      topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', pad('0x1234', { size: 32 }), pad(RECIPIENT as Hex, { size: 32 })],
      data: encodeAbiParameters([{ type: 'uint256' }], [100n * 10n ** 18n]),
    };
    expect(matchDelivery({ status: 'success', logs: [unrelated] }, dep, route).ok).toBe(false);
  });
  it('source confirmed but destination missing stays not received', () => {
    const s = trackingState({ txHash: '0x1', source: 'success', sourceConfirmedAt: 1, providerRequired: true, deliveryCheck: 'searching' }, 10);
    expect(s.phase).toBe('awaiting_relay');
    expect(s.received).toBe(false);
  });
  it('destination evidence without a linked hash is never received', () => {
    expect(trackingState({ txHash: '0x1', source: 'success', destinationConfirmed: true, destinationTokenArrival: true }, 1).received).toBe(false);
  });
  it('Tron routes are reported unsupported, not completed', () => {
    expect(bridgeRoute('BOT_TO_TRX', true)).toBeNull();
    expect(bridgeRoute('TRX_TO_BOT', true)).toBeNull();
    expect(trackingState({ txHash: '0x1', source: 'success', sourceConfirmedAt: 1, providerRequired: true, deliveryCheck: 'unsupported' }, 2).received).toBe(false);
  });
  it('wallet rejection never shows progress', () => {
    expect(trackingState({ walletState: 'rejected' }, 1).phase).toBe('canceled');
  });
  it('scales 6-decimal BOT USDT to 18-decimal BNB USDT', () => {
    expect(scaleAmount(100_000_000n, 6, 18)).toBe(100n * 10n ** 18n);
    expect(scaleAmount(100n * 10n ** 18n, 18, 6)).toBe(100_000_000n);
  });
});
