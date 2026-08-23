/**
 * V15.3M — canonical economic evidence identity for CORE_SWAP accrual.
 *
 * The ledger writer must fail closed without a canonical verified activity and
 * must never substitute log index 0 for an unknown event position.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const inserted: any[] = [];

vi.mock('@/integrations/supabase/client.server', () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      insert: (row: any) => {
        inserted.push({ table, row });
        return Promise.resolve({ error: null });
      },
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock('./flowPointsV2Policy.server', () => ({
  resolveFlowPointsV2Policy: async () => ({
    version: 'v2',
    minSwapUsd: 1,
    dailyCoreSwapCap: 500,
    pointsPerUsd: 1,
  }),
}));

const load = async () => await import('./flowPointsV2Ledger.server');

describe('V15.3M CORE_SWAP canonical identity', () => {
  beforeEach(() => {
    inserted.length = 0;
  });

  it('fails closed without a verified activity id', async () => {
    const { accrueCoreSwapPoints } = await load();
    const out = await accrueCoreSwapPoints({
      userId: 'u1',
      walletAddress: '0xAbC',
      verifiedUsd: 10,
      chainId: 968,
      txHash: '0xdead',
      verifiedActivityId: '',
      sourceLogIndex: 8,
    });
    expect(out.award).toBe(0);
    expect(out.recorded).toBe(false);
    expect(out.failClosedReason).toBe('MISSING_VERIFIED_ACTIVITY_ID');
    expect(inserted).toHaveLength(0);
  });

  it('fails closed on a non-canonical log index instead of defaulting to 0', async () => {
    const { accrueCoreSwapPoints } = await load();
    const out = await accrueCoreSwapPoints({
      userId: 'u1',
      walletAddress: '0xAbC',
      verifiedUsd: 10,
      chainId: 968,
      txHash: '0xdead',
      verifiedActivityId: '0xact',
      sourceLogIndex: Number.NaN,
    });
    expect(out.recorded).toBe(false);
    expect(out.failClosedReason).toBe('MISSING_SOURCE_LOG_INDEX');
    expect(inserted).toHaveLength(0);
  });

  it('writes the canonical activity id and the exact receipt log index', async () => {
    const { accrueCoreSwapPoints } = await load();
    const out = await accrueCoreSwapPoints({
      userId: 'u1',
      walletAddress: '0xAbC',
      verifiedUsd: 10,
      chainId: 968,
      txHash: '0xB89D',
      verifiedActivityId: '0x7DD7',
      sourceLogIndex: 8,
    });
    expect(out.recorded).toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].row).toMatchObject({
      verified_activity_id: '0x7dd7',
      source_log_index: 8,
      activity_key: '968:0xb89d:8',
    });
  });
});
