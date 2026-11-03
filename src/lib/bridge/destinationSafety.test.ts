import { describe, expect, it } from 'vitest';
import { bridgeDestinationReview, resolveBridgeDestination } from './destinationSafety';

const WALLET = '0x1111111111111111111111111111111111111111';
const OTHER = '0x2222222222222222222222222222222222222222';
describe('bridge destination safety', () => {
  it('defaults to the connected wallet', () => {
    expect(resolveBridgeDestination(WALLET)).toBe(WALLET);
  });
  it('retains only an explicit override for the current wallet', () => {
    expect(resolveBridgeDestination(WALLET, { wallet: WALLET, value: OTHER })).toBe(OTHER);
  });
  it('resets to the new connected wallet rather than an old destination', () => {
    expect(resolveBridgeDestination(OTHER, { wallet: WALLET, value: WALLET })).toBe(OTHER);
  });
  it('does not retain a destination when disconnected', () => {
    expect(resolveBridgeDestination(undefined, { wallet: WALLET, value: OTHER })).toBe('');
    expect(bridgeDestinationReview(OTHER, undefined, '').canConfirm).toBe(false);
  });
  it('requires acknowledgement for a different destination', () => {
    expect(bridgeDestinationReview(OTHER, WALLET, '').canConfirm).toBe(false);
    const review = bridgeDestinationReview(OTHER, WALLET, '');
    expect(bridgeDestinationReview(OTHER, WALLET, review.key).canConfirm).toBe(true);
  });
  it('invalidates acknowledgement after editing the destination', () => {
    const key = bridgeDestinationReview(OTHER, WALLET, '').key;
    expect(bridgeDestinationReview('0x3333333333333333333333333333333333333333', WALLET, key).canConfirm).toBe(false);
  });
  it('invalidates acknowledgement when the connected wallet changes', () => {
    const key = bridgeDestinationReview(OTHER, WALLET, '').key;
    expect(bridgeDestinationReview(OTHER, '0x3333333333333333333333333333333333333333', key).canConfirm).toBe(false);
  });
  it('compares case-insensitively and trims pasted addresses', () => {
    const wallet = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
    const review = bridgeDestinationReview(` ${wallet.toUpperCase().replace('0X', '0x')} `, wallet, '');
    expect(review.different).toBe(false);
    expect(review.canConfirm).toBe(true);
  });
  it('rejects empty malformed and zero recipients even if acknowledged', () => {
    for (const recipient of ['', '0x123', '0x0000000000000000000000000000000000000000']) {
      const review = bridgeDestinationReview(recipient, WALLET, '');
      expect(bridgeDestinationReview(recipient, WALLET, review.key).canConfirm).toBe(false);
    }
  });
});