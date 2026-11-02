import { beforeEach, expect, it, vi } from 'vitest';
import { loadFullLedgers, loadVaultAccountReconciliation, VAULT_RECON_LIMITS } from './vaultV2Reconciliation.server';
import { scanEligibleVaultSources, VAULT_SOURCE_SCAN, type VaultSourceRow } from './vaultV2Allocator.server';

const uid = (i: number) => `00000000-0000-4000-8000-${i.toString().padStart(12, '0')}`;
const wallet = (i: number) => `0x${(4096 + i).toString(16).padStart(40, '0')}`;

/** Minimal PostgREST-like fake honoring in/order/gt/limit so pagination is exercised for real. */
type Row = Record<string, any>;
function fakeDb(tables: Record<string, Row[]>, opts: { failLedgerPage?: number; sources?: VaultSourceRow[] } = {}) {
  const calls = { ledgerPages: 0, profileQueries: 0, inSizes: [] as number[], sourcePages: 0 };
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])]; let lim = 1000;
    const q: any = {
      select: () => q,
      in: (col: string, vals: string[]) => { calls.inSizes.push(vals.length); rows = rows.filter(r => vals.includes(r[col])); return q; },
      order: (col: string) => { rows.sort((a, b) => (a[col] < b[col] ? -1 : 1)); return q; },
      gt: (col: string, v: string) => { rows = rows.filter(r => r[col] > v); return q; },
      limit: (n: number) => { lim = Math.min(n, 1000); return q; },
      then: (res: (v: unknown) => void) => {
        if (table === 'flow_points_ledger') { calls.ledgerPages++; if (opts.failLedgerPage === calls.ledgerPages) return res({ data: null, error: { message: 'timeout' } }); }
        if (table === 'profiles') calls.profileQueries++;
        return res({ data: rows.slice(0, lim), error: null });
      },
    };
    return q;
  };
  const rpc = async (name: string, args: { p_after: string | null; p_limit: number }) => {
    if (name !== 'vault_v2_source_rows_scan') return { data: null, error: { message: 'unexpected' } };
    calls.sourcePages++;
    const all = [...(opts.sources ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    return { data: all.filter(r => !args.p_after || r.id > args.p_after).slice(0, Math.min(args.p_limit, 1000)), error: null };
  };
  return { db: { from, rpc } as never, calls };
}
const ledgerRow = (i: number, user: string, extra: Row = {}) => ({ id: `l-${i.toString().padStart(8, '0')}`, user_id: user, reason: 'SWAP_POINTS', points: 1, chain_id: 677, created_at: '2026-12-01T00:00:00Z', activity_key: `a${i}`, tx_hash: null, source_log_index: null, verified_usd: 5, day_key: '2026-12-01', metadata: {}, reservation_id: null, funding_state: 'FUNDED', provenance_state: 'VERIFIED', ...extra });
const source = (i: number, user = uid(i)): VaultSourceRow => ({ id: uid(i), user_id: user, economic_award_id: `e${i}`, wallet: wallet(i), points: 5, program_id: 'CORE_SWAP', destination: 'VAULT_V2', created_at: '2026-12-02T00:00:00Z', policy_version: 'FLOW_POINTS_V2' });

beforeEach(() => vi.restoreAllMocks());

it('full ledger history beyond 50,000 global rows is fetched completely by keyset pages for candidates', async () => {
  const candidate = uid(1);
  const ledger = [...Array.from({ length: 52_000 }, (_, i) => ledgerRow(i, uid(2 + (i % 50)))), ...Array.from({ length: 2_500 }, (_, i) => ledgerRow(60_000 + i, candidate))];
  const { db, calls } = fakeDb({ flow_points_ledger: ledger });
  const rows = await loadFullLedgers(db, [candidate]);
  expect(rows).toHaveLength(2_500);
  expect(new Set(rows.map(r => r.id)).size).toBe(2_500);
  expect(calls.ledgerPages).toBe(3); // 1000 + 1000 + 500, no global 50k read
});
it('incomplete ledger history fails closed instead of reconciling a partial account', async () => {
  const { db } = fakeDb({ flow_points_ledger: Array.from({ length: 2_500 }, (_, i) => ledgerRow(i, uid(1))) }, { failLedgerPage: 2 });
  await expect(loadFullLedgers(db, [uid(1)])).rejects.toThrow('COMPLETE_RECONCILIATION_REQUIRED');
});
it('ledger page bound is enforced fail-closed', async () => {
  const user = uid(1);
  const limits = VAULT_RECON_LIMITS as { maxLedgerPagesPerChunk: number }, saved = limits.maxLedgerPagesPerChunk;
  limits.maxLedgerPagesPerChunk = 3;
  try {
    const { db } = fakeDb({ flow_points_ledger: Array.from({ length: 3_000 }, (_, i) => ledgerRow(i, user)) });
    await expect(loadFullLedgers(db, [user])).rejects.toThrow('COMPLETE_RECONCILIATION_REQUIRED');
  } finally { limits.maxLedgerPagesPerChunk = saved; }
});
it('with more than 10,000 profiles, only candidate accounts are read, in bounded chunks', async () => {
  const profiles = Array.from({ length: 10_500 }, (_, i) => ({ id: uid(i), created_at: '2026-10-05T00:00:00Z', flow_points: 0, points_self: 0, points_referral_signup: 0, wallet_address: wallet(i) }));
  const candidates = Array.from({ length: 250 }, (_, i) => uid(10_000 + i));
  const { db, calls } = fakeDb({ profiles, flow_points_ledger: [] });
  const out = await loadVaultAccountReconciliation(db, candidates);
  expect(out.map(r => r.userId).sort()).toEqual([...candidates].sort());
  expect(Math.max(...calls.inSizes)).toBeLessThanOrEqual(VAULT_RECON_LIMITS.userChunk);
  expect(calls.profileQueries).toBe(3);
});
it('missing candidate profile fails closed', async () => {
  const { db } = fakeDb({ profiles: [], flow_points_ledger: [] });
  await expect(loadVaultAccountReconciliation(db, [uid(1)])).rejects.toThrow('COMPLETE_RECONCILIATION_REQUIRED');
});

const recon = (eligible: (id: string) => boolean) => vi.fn(async (_db: unknown, users: string[]) => users.map(u => ({ userId: u, classification: eligible(u) ? 'MATCH' : 'INSUFFICIENT_HISTORICAL_EVIDENCE', eligibleRowIds: eligible(u) ? [u] : [], wallet: wallet(Number(u.slice(-12))) })));
const MAX = 10n ** 30n;

it('1,000 excluded sources before an eligible one cannot starve it', async () => {
  const sources = Array.from({ length: 1_001 }, (_, i) => source(i));
  const { db, calls } = fakeDb({}, { sources });
  const load = recon(u => u === uid(1_000));
  const r = await scanEligibleVaultSources(db, MAX, null, load as never);
  expect(r.eligible.map(x => x.id)).toEqual([uid(1_000)]);
  expect(r.continuation).toBeNull();
  expect(calls.sourcePages).toBe(3);
  expect(load.mock.calls.flatMap(c => c[1] as string[])).toHaveLength(1_001); // each candidate reconciled once
});
it('scan bound returns a continuation, never a false "no eligible awards"', async () => {
  const total = VAULT_SOURCE_SCAN.pageSize * VAULT_SOURCE_SCAN.maxPages + 10;
  const { db } = fakeDb({}, { sources: Array.from({ length: total }, (_, i) => source(i)) });
  const r = await scanEligibleVaultSources(db, MAX, null, recon(() => false) as never);
  expect(r.eligible).toEqual([]);
  expect(r.continuation).toBe(uid(VAULT_SOURCE_SCAN.pageSize * VAULT_SOURCE_SCAN.maxPages - 1));
  const next = await scanEligibleVaultSources(db, MAX, r.continuation, recon(u => u === uid(total - 1)) as never);
  expect(next.eligible.map(x => x.id)).toEqual([uid(total - 1)]);
  expect(next.continuation).toBeNull();
});
it('stops once a bounded batch is full; later awards queue for the next batch', async () => {
  const { db, calls } = fakeDb({}, { sources: Array.from({ length: 5_000 }, (_, i) => source(i)) });
  const r = await scanEligibleVaultSources(db, 25n * 10n ** 18n, null, recon(() => true) as never);
  expect(calls.sourcePages).toBe(1);
  expect(r.eligible.length).toBe(VAULT_SOURCE_SCAN.pageSize);
});
it('wallet rebinding between earning and reconciliation excludes the source', async () => {
  const { db } = fakeDb({}, { sources: [source(1)] });
  const load = vi.fn(async () => [{ userId: uid(1), classification: 'MATCH', eligibleRowIds: [uid(1)], wallet: wallet(2) }]);
  expect((await scanEligibleVaultSources(db, MAX, null, load as never)).eligible).toEqual([]);
});
it('concurrent prepare cycles see identical deterministic candidate sets', async () => {
  const { db } = fakeDb({}, { sources: Array.from({ length: 1_700 }, (_, i) => source(1_700 - i)) });
  const load = recon(u => Number(u.slice(-12)) % 7 === 0);
  const [a, b] = await Promise.all([scanEligibleVaultSources(db, MAX, null, load as never), scanEligibleVaultSources(db, MAX, null, load as never)]);
  expect(a.eligible.map(x => x.id)).toEqual(b.eligible.map(x => x.id));
  expect(a.eligible.map(x => x.id)).toEqual([...a.eligible.map(x => x.id)].sort());
  expect(a.eligible).toHaveLength(242);
});
it('missing reconciliation for a scanned candidate fails closed', async () => {
  const { db } = fakeDb({}, { sources: [source(1)] });
  await expect(scanEligibleVaultSources(db, MAX, null, vi.fn(async () => []) as never)).rejects.toThrow('COMPLETE_RECONCILIATION_REQUIRED');
});
