/**
 * V15.3M — canonical economic evidence identity for CORE_SWAP accrual.
 *
 * The ledger writer must fail closed without a canonical verified activity and
 * must never substitute log index 0 for an unknown event position.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const inserted: any[] = [];
const ingest = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('@/lib/activity/mainnetRouterV4Ingest.server', () => ({ingestMainnetRouterV4Swap: ingest.call}));
vi.mock('@/lib/activity/mainnetRouterV3Ingest.server', () => ({ingestMainnetRouterV3Swap: ingest.call}));

vi.mock('@/integrations/supabase/client.server', () => ({
  supabaseAdmin: {
    from: (table: string) => ({
      insert: (row: any) => {
        // Internal diagnostics are not economic ledger writes.
        if (table !== 'reward_processing_events') inserted.push({ table, row });
        return Promise.resolve({ error: null });
      },
      select: () => {
        // Chainable read builder (eq / in / gte), resolving to no rows.
        const q: any = Promise.resolve({ data: [], error: null });
        q.eq = () => q;
        q.in = () => q;
        q.gte = () => q;
        q.maybeSingle = async () => ({data:{wallet_address:"0xabc"},error:null});
        return q;
      },
    }),
  },
}));

// Internal diagnostics are a separate side channel, not ledger writes.
vi.mock('./rewardDiagnostics.server', () => ({ recordRewardDiagnostic: async () => {} }));

vi.mock('@/lib/appConfig.server', () => ({getRewardSettings: async () => ({})}));
vi.mock('./approvedRewardPolicy', () => ({ validateApprovedRewardPolicy: (p: unknown) => p }));
vi.mock('./unusedPolicy', () => ({
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
    ingest.call.mockResolvedValue({status:'VERIFIED',activity:{activityId:'0x7dd7',logIndex:8,tokenIn:'a',tokenOut:'b',occurredAt:1791504000,evidenceSource:'ROUTER_V4_SWAP_ACTIVITY'},verifiedUsd:10});
  });

  it('fails closed without a verified activity id', async () => {
    const { accrueCoreSwapPoints } = await load();
    const out = await accrueCoreSwapPoints({
      userId: 'u1',
      walletAddress: '0xAbC',
      verifiedUsd: 10,
      chainId: 677,
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
      chainId: 677,
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
      chainId: 677,
      txHash: '0xB89D',
      verifiedActivityId: '0x7DD7',
      sourceLogIndex: 8,
    });
    expect(out.recorded).toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].row).toMatchObject({
      verified_activity_id: '0x7dd7',
      source_log_index: 8,
      activity_key: '677:0xb89d:8',
    });
  });
  it.each(['REJECTED','NOT_FINAL'])('untrusted %s trades award zero even with forged USD', async (status) => {
    ingest.call.mockResolvedValue({status,reason:'unverified'});
    const {accrueCoreSwapPoints}=await load();
    const result=await accrueCoreSwapPoints({userId:'u1',walletAddress:'0xabc',verifiedUsd:1000000,chainId:677,txHash:'0xb89d',verifiedActivityId:'0x7dd7',sourceLogIndex:8});
    expect(result.award).toBe(0);expect(inserted).toHaveLength(0);
  });
  it('a genuine verified trade ignores forged browser USD and earns exactly 10', async () => {
    const {accrueCoreSwapPoints}=await load();
    const result=await accrueCoreSwapPoints({userId:'u1',walletAddress:'0xabc',verifiedUsd:1000000,chainId:677,txHash:'0xb89d',verifiedActivityId:'0x7dd7',sourceLogIndex:8});
    expect(result.award).toBe(10);expect(inserted[0].row.verified_usd).toBe(10);
  });
  it('wrong-chain reports cannot earn a single point',async()=>{
    const {accrueCoreSwapPoints}=await load();
    const result=await accrueCoreSwapPoints({userId:'u1',walletAddress:'0xabc',verifiedUsd:1000000,chainId:968,txHash:'0xb89d',verifiedActivityId:'0x7dd7',sourceLogIndex:8});
    expect(result.award).toBe(0);expect(inserted).toHaveLength(0);
  });
});
