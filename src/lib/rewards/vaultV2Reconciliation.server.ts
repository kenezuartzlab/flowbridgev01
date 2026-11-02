import { reconcileAll, OWNER_REVIEW_DECISIONS, type ReconLedgerRow } from './historicalReconciliation';
type Admin = Awaited<typeof import('@/integrations/supabase/client.server')>['supabaseAdmin'];
export type VaultAccountReconciliation = { userId: string; classification: string; eligibleRowIds: string[]; wallet: string | null };

/** Bounds: chunked `in` lists and keyset pages, failing closed rather than reconciling a partial history. */
export const VAULT_RECON_LIMITS = { userChunk: 100, ledgerPage: 1000, maxLedgerPagesPerChunk: 500 } as const;

type LedgerRecord = { id: string; user_id: string; reason: string; points: number; chain_id: number | null; created_at: string; activity_key: string | null; tx_hash: string | null; source_log_index: number | null; verified_usd: number | string | null; day_key: string | null; metadata: unknown; reservation_id: string | null; funding_state: string | null; provenance_state: string | null };
type ProfileRecord = { id: string; created_at: string; flow_points: number; points_self: number; points_referral_signup: number; wallet_address: string | null };

const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Every ledger row for the given users, by deterministic id keyset; throws if any page fails or the bound is hit. */
export async function loadFullLedgers(db: Admin, userIds: string[]): Promise<LedgerRecord[]> {
  const out: LedgerRecord[] = [];
  for (const ids of chunks([...new Set(userIds)].sort(), VAULT_RECON_LIMITS.userChunk)) {
    let after: string | null = null;
    for (let page = 0; ; page++) {
      if (page >= VAULT_RECON_LIMITS.maxLedgerPagesPerChunk) throw new Error('COMPLETE_RECONCILIATION_REQUIRED');
      let q = db.from('flow_points_ledger').select('id,user_id,reason,points,chain_id,created_at,activity_key,tx_hash,source_log_index,verified_usd,day_key,metadata,reservation_id,funding_state,provenance_state').in('user_id', ids).order('id', { ascending: true }).limit(VAULT_RECON_LIMITS.ledgerPage);
      if (after) q = q.gt('id', after);
      const r = await q;
      if (r.error || !r.data) throw new Error('COMPLETE_RECONCILIATION_REQUIRED');
      const rows = r.data as LedgerRecord[];
      out.push(...rows);
      if (rows.length < VAULT_RECON_LIMITS.ledgerPage) break;
      after = rows[rows.length - 1].id;
    }
  }
  return out;
}

async function loadProfiles(db: Admin, userIds: string[]): Promise<ProfileRecord[]> {
  const out: ProfileRecord[] = [];
  for (const ids of chunks([...new Set(userIds)].sort(), VAULT_RECON_LIMITS.userChunk)) {
    const r = await db.from('profiles').select('id,created_at,flow_points,points_self,points_referral_signup,wallet_address').in('id', ids);
    if (r.error || !r.data) throw new Error('COMPLETE_RECONCILIATION_REQUIRED');
    out.push(...(r.data as ProfileRecord[]));
  }
  return out;
}

const toRow = (l: LedgerRecord): ReconLedgerRow => {
  const md = (l.metadata ?? {}) as Record<string, unknown>;
  return { id: l.id, reason: l.reason, points: l.points, chainId: l.chain_id, createdAt: l.created_at, evidenceKey: l.activity_key ?? (l.tx_hash ? `${l.tx_hash.toLowerCase()}:${l.source_log_index ?? ''}` : null), verifiedUsd: l.verified_usd == null ? null : Number(l.verified_usd), dayKey: l.day_key, refereeId: typeof md.refereeId === 'string' ? md.refereeId : null, reservationId: l.reservation_id, fundingState: l.funding_state, provenanceState: l.provenance_state };
};

/**
 * Reconciles only candidate accounts, each over its FULL ledger history, plus the full ledgers of any referees
 * those histories cite (milestone evidence). Results are returned only for candidates. Missing profiles fail closed.
 */
export async function loadVaultAccountReconciliation(db: Admin, candidateUserIds: string[]): Promise<VaultAccountReconciliation[]> {
  const candidates = [...new Set(candidateUserIds)].sort();
  if (!candidates.length) return [];
  const ledger = await loadFullLedgers(db, candidates);
  const referees = [...new Set(ledger.map(toRow).map(r => r.refereeId).filter((x): x is string => !!x && !candidates.includes(x)))];
  const refereeLedger = referees.length ? await loadFullLedgers(db, referees) : [];
  const profiles = await loadProfiles(db, [...candidates, ...referees]);
  if (candidates.some(id => !profiles.some(p => p.id === id))) throw new Error('COMPLETE_RECONCILIATION_REQUIRED');
  const byUser = new Map<string, ReconLedgerRow[]>();
  for (const l of [...ledger, ...refereeLedger]) byUser.set(l.user_id, [...(byUser.get(l.user_id) ?? []), toRow(l)]);
  const accounts = profiles.map(p => ({ userId: p.id, createdAt: p.created_at, storedFlowPoints: p.flow_points + (byUser.get(p.id) ?? []).filter(r => ['SIGNUP_BONUS_REFEREE', 'REFERRAL_SIGNUP_BONUS'].includes(r.reason)).reduce((s, r) => s + r.points, 0), storedPointsSelf: p.points_self, storedReferralSignup: p.points_referral_signup, ledger: byUser.get(p.id) ?? [] }));
  return reconcileAll(accounts, OWNER_REVIEW_DECISIONS).results
    .filter(r => candidates.includes(r.userId))
    .map(r => ({ userId: r.userId, classification: r.classification, eligibleRowIds: r.eligibleRowIds, wallet: profiles.find(p => p.id === r.userId)?.wallet_address ?? null }));
}
