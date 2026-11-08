/**
 * LEGACY_CARRYOVER_V2_20261108 — one-time fenced legacy carryover (pure).
 *
 * Owner decision 2026-11-08: unpaid historical FLOW Points move into Rewards
 * Vault V2 once, 1 PTS : 1 FLOW, after an exact Super Admin confirmation and
 * full backing. Unsupported/held rows are NEVER relabelled verified; they form
 * a separately budgeted OWNER_GOODWILL source. Profile aggregates, XP and
 * campaign PTS are never inputs. Published V1 leaves (claimed or not) stay in
 * V1 and are subtracted per wallet, oldest verified rows first.
 */
export const LEGACY_CARRYOVER_POLICY = 'LEGACY_CARRYOVER_V2_20261108';
export const MAINNET = 677;

export type CarryoverBin =
  | 'VERIFIED_UNPAID'          // authentic, program-authorized, provenance-verified, unpaid
  | 'GOODWILL_CANDIDATE'       // attributable bound user, but unsupported/held provenance
  | 'NEEDS_IDENTITY'           // missing or shared wallet binding: shown, never credited
  | 'EXCLUDED_PAID_V1'         // covered by a published V1 leaf or in-flight V1 approval
  | 'EXCLUDED_ALREADY_V2'      // already routed to Vault V2
  | 'EXCLUDED_NON_ECONOMIC';   // Testnet, zero or non-positive rows

export interface CarryoverLedgerRow {
  id: string; userId: string; reason: string; programId: string | null;
  fundingState: string; provenanceState: string; chainId: number | null;
  points: number; createdAt: string; vaultV2Destination: boolean;
}
export interface CarryoverInput {
  rows: CarryoverLedgerRow[];
  bindings: { userId: string; wallet: string | null }[];
  /** Published V1 leaves (claimed or not) + unbatched open V1 approvals, in whole FLOW. */
  v1Committed: { wallet: string; flow: number }[];
}
export interface CarryoverItem {
  ledgerId: string; economicId: string; userId: string; wallet: string | null;
  points: number; bin: CarryoverBin; source: 'LEGACY_VERIFIED' | 'OWNER_GOODWILL' | null; detail: string;
}

const isAddr = (w: string | null | undefined): w is string => !!w && /^0x[0-9a-f]{40}$/i.test(w) && BigInt(w) !== 0n;

/** Verified = program-authorized and genuine provenance. Never inferred from funding alone. */
export function verifiedLegacyRow(r: CarryoverLedgerRow): boolean {
  if ((r.reason === 'SIGNUP_BONUS_REFEREE' || r.reason === 'REFERRAL_SIGNUP_BONUS'))
    return r.programId === 'SIGNUP_BONUS' && r.fundingState === 'FUNDED';
  if (r.reason === 'CORE_SWAP_V2' || r.reason === 'CORE_SWAP')
    return r.programId === 'CORE_SWAP' && r.chainId === MAINNET && (r.provenanceState === 'VERIFIED' || r.provenanceState === 'EXCEPTION_APPROVED');
  if (r.programId === 'REFERRAL_MILESTONE') return r.provenanceState !== 'REJECTED';
  return false;
}

export function classifyLegacyCarryover(input: CarryoverInput): CarryoverItem[] {
  const wallets = new Map<string, string | null>();
  for (const b of input.bindings) wallets.set(b.userId, isAddr(b.wallet) ? b.wallet.toLowerCase() : null);
  const walletUsers = new Map<string, Set<string>>();
  for (const [u, w] of wallets) if (w) { const users = walletUsers.get(w) ?? new Set<string>(); users.add(u); walletUsers.set(w, users); }
  const committed = new Map<string, number>();
  for (const c of input.v1Committed) { const w = c.wallet.toLowerCase(); committed.set(w, (committed.get(w) ?? 0) + Math.max(0, c.flow)); }

  const seen = new Set<string>();
  const out: CarryoverItem[] = [];
  const live: { row: CarryoverLedgerRow; verified: boolean; wallet: string }[] = [];
  for (const r of input.rows) {
    if (seen.has(r.id)) continue; // duplicate input row: count once
    seen.add(r.id);
    const base = { ledgerId: r.id, economicId: `${LEGACY_CARRYOVER_POLICY}:${r.id}`, userId: r.userId, wallet: wallets.get(r.userId) ?? null, points: r.points };
    if (r.vaultV2Destination) { out.push({ ...base, bin: 'EXCLUDED_ALREADY_V2', source: null, detail: 'already routed to Vault V2' }); continue; }
    if (!Number.isInteger(r.points) || r.points <= 0 || (r.chainId !== null && r.chainId !== MAINNET)) { out.push({ ...base, bin: 'EXCLUDED_NON_ECONOMIC', source: null, detail: r.chainId !== null && r.chainId !== MAINNET ? 'non-Mainnet activity' : 'no positive points' }); continue; }
    const w = base.wallet;
    if (!w || (walletUsers.get(w)?.size ?? 0) !== 1) { out.push({ ...base, bin: 'NEEDS_IDENTITY', source: null, detail: w ? 'wallet bound to several accounts' : 'no verified wallet binding' }); continue; }
    live.push({ row: r, verified: verifiedLegacyRow(r), wallet: w });
  }
  // Subtract V1 commitments per wallet: verified first, then oldest, then id.
  live.sort((a, b) => a.wallet.localeCompare(b.wallet) || Number(b.verified) - Number(a.verified) || a.row.createdAt.localeCompare(b.row.createdAt) || a.row.id.localeCompare(b.row.id));
  for (const { row, verified, wallet } of live) {
    const base = { ledgerId: row.id, economicId: `${LEGACY_CARRYOVER_POLICY}:${row.id}`, userId: row.userId, wallet };
    const left = committed.get(wallet) ?? 0;
    const covered = Math.min(left, row.points);
    if (covered > 0) { committed.set(wallet, left - covered); out.push({ ...base, points: covered, bin: 'EXCLUDED_PAID_V1', source: null, detail: 'covered by V1 round or open V1 approval' }); }
    const rest = row.points - covered;
    if (rest > 0) out.push({ ...base, points: rest, bin: verified ? 'VERIFIED_UNPAID' : 'GOODWILL_CANDIDATE', source: verified ? 'LEGACY_VERIFIED' : 'OWNER_GOODWILL', detail: verified ? 'verified unpaid legacy award' : `unsupported/held provenance (${row.reason})` });
  }
  return out.sort((a, b) => a.ledgerId.localeCompare(b.ledgerId) || a.bin.localeCompare(b.bin));
}

export function summarizeCarryover(items: CarryoverItem[]) {
  const bins: Record<CarryoverBin, { rows: number; points: number }> = {
    VERIFIED_UNPAID: { rows: 0, points: 0 }, GOODWILL_CANDIDATE: { rows: 0, points: 0 }, NEEDS_IDENTITY: { rows: 0, points: 0 },
    EXCLUDED_PAID_V1: { rows: 0, points: 0 }, EXCLUDED_ALREADY_V2: { rows: 0, points: 0 }, EXCLUDED_NON_ECONOMIC: { rows: 0, points: 0 },
  };
  for (const i of items) { bins[i.bin].rows++; bins[i.bin].points += i.points; }
  const perWallet = new Map<string, { verified: number; goodwill: number }>();
  for (const i of items) if (i.source && i.wallet) {
    const p = perWallet.get(i.wallet) ?? { verified: 0, goodwill: 0 };
    if (i.source === 'LEGACY_VERIFIED') p.verified += i.points; else p.goodwill += i.points;
    perWallet.set(i.wallet, p);
  }
  return { policy: LEGACY_CARRYOVER_POLICY, bins, wallets: perWallet.size,
    fundingRequiredFlow: bins.VERIFIED_UNPAID.points + bins.GOODWILL_CANDIDATE.points };
}

/** Deterministic snapshot identity; any row, wallet, amount or bin change alters it. */
export async function carryoverSnapshotHash(items: CarryoverItem[]): Promise<string> {
  const canon = JSON.stringify(items.filter(i => i.source).map(i => [i.economicId, i.wallet, i.points, i.source]));
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canon));
  return '0x' + [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Super Admin confirmation must echo the exact snapshot; funding must fully back it. */
export function carryoverConfirmationGate(s: {
  isSuperAdmin: boolean; walletBound: boolean; snapshotHash: string; confirmedHash: string;
  verifiedPoints: number; confirmedVerified: number; goodwillPoints: number; confirmedGoodwillBudget: number;
  vaultFreeFlow: number; alreadyConfirmed: boolean;
}): 'OK' | string {
  if (s.alreadyConfirmed) return 'ALREADY_CONFIRMED';
  if (!s.isSuperAdmin || !s.walletBound) return 'SUPER_ADMIN_BOUND_WALLET_REQUIRED';
  if (s.confirmedHash.toLowerCase() !== s.snapshotHash.toLowerCase()) return 'SNAPSHOT_CHANGED';
  if (s.confirmedVerified !== s.verifiedPoints) return 'VERIFIED_TOTAL_MISMATCH';
  if (s.confirmedGoodwillBudget !== s.goodwillPoints) return 'GOODWILL_BUDGET_MISMATCH';
  if (s.vaultFreeFlow < s.verifiedPoints + s.goodwillPoints) return 'NOT_FULLY_BACKED';
  return 'OK';
}

/** Batches of <=100 wallets within caps; each wallet appears in exactly one batch. */
export function planCarryoverBatches(items: CarryoverItem[], batchCapFlow: number, maxWallets = 100) {
  const per = new Map<string, number>();
  for (const i of items) if (i.source && i.wallet) per.set(i.wallet, (per.get(i.wallet) ?? 0) + i.points);
  const batches: { wallet: string; flow: number }[][] = [];
  let cur: { wallet: string; flow: number }[] = []; let sum = 0;
  for (const [wallet, flow] of [...per].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (flow > batchCapFlow) throw new Error('WALLET_EXCEEDS_BATCH_CAP');
    if (cur.length >= maxWallets || sum + flow > batchCapFlow) { batches.push(cur); cur = []; sum = 0; }
    cur.push({ wallet, flow }); sum += flow;
  }
  if (cur.length) batches.push(cur);
  return batches;
}
