import { describe, expect, it } from 'vitest';
import { deliveryStartBlock, deliveryPollCursor, readDeliveryChunk } from './deliverySearch';

describe('BOT / BNB destination discovery recovery', () => {
  it.each([['BOT', 750n], ['BNB', 450n]])('finds old %s source-time bounds without spacing assumptions', async (_chain, spacing) => {
    const timestampAt = async (n: bigint) => 1_700_000_000n + n * spacing / 1000n;
    const sourceTime = await timestampAt(100_000n);
    const start = await deliveryStartBlock(2_000_000n, sourceTime, timestampAt);
    expect(await timestampAt(start)).toBeLessThanOrEqual(sourceTime - 600n);
    expect(await timestampAt(start + 1n)).toBeGreaterThan(sourceTime - 600n);
    expect(start).toBeLessThan(100_000n);
  });
  it('shrinks a rejected RPC range without skipping any blocks', async () => {
    const calls: [bigint, bigint][] = [];
    const result = await readDeliveryChunk(100n, 20_000n, 10_000n, async (from, to) => {
      calls.push([from, to]);
      if (to - from + 1n > 1000n) throw Error('range limit');
      return ['linked-release'];
    });
    expect(calls.map(([from]) => from)).toEqual([100n, 100n, 100n, 100n, 100n]);
    expect(result).toEqual({ logs: ['linked-release'], next: 725n });
  });
  it('does not treat an unavailable single block as an empty successful read', async () => {
    await expect(readDeliveryChunk(10n, 10n, 1n, async () => { throw Error('offline'); })).rejects.toThrow('offline');
  });
  it('rediscovers a release indexed after an initially empty head read', async () => {
    let indexed = false;
    const read = async (from: bigint, to: bigint) => indexed && from <= 999n && to >= 999n ? ['release'] : [];
    const first = await readDeliveryChunk(900n, 1000n, 5000n, read);
    expect(first.logs).toEqual([]);
    indexed = true;
    const cursor = deliveryPollCursor(first.next, 1015n, 800n, 200n, 1000n);
    expect(cursor).toBe(800n);
    expect((await readDeliveryChunk(cursor, 1015n, 5000n, read)).logs).toEqual(['release']);
  });
  it('retains unfinished historical progress and never rewinds before start', () => {
    expect(deliveryPollCursor(600n, 1000n, 500n, 200n)).toBe(600n);
    expect(deliveryPollCursor(1001n, 1000n, 950n, 200n)).toBe(950n);
  });
});