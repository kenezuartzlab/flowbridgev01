/** Read-only assessment of authoritative originals. Never promotes or funds historical rows. */
import { DEFAULT_FLOW_POINTS_V2_POLICY, isFlowPointsV2Active } from './flowPointsV2';
export interface EvidenceRow {
  id: string; user_id: string; points: number; base_points: number; verified_usd: number | null;
  policy_version: string; chain_id: number | null; tx_hash: string | null; source_log_index: number | null;
  verified_activity_id: string | null; wallet_address: string | null; funding_state: string;
  reservation_id: string | null; provenance_state: string; day_key: string | null; metadata: unknown;
}
export interface ActivityEvidence { activity_id: string; source_chain_id: number; source_tx_hash: string; source_log_index: number; user_wallet: string; status: string; kind: string; evidence_source: string; amount_raw: string; occurred_at: string }
export interface ReservationEvidence { reservation_id: string; ledger_id: string; user_id: string; wallet_address: string | null; points: number; program_id: string }
export type EvidenceStatus = 'SYSTEM_VERIFIED' | 'ORIGINAL_EVIDENCE_ESTABLISHED' | 'NEEDS_EXCEPTION_REVIEW' | 'BLOCKED';
export function assessRewardEvidence(row: EvidenceRow, context: { activity?: ActivityEvidence; boundWallet?: string | null; reservation?: ReservationEvidence; duplicate: boolean; restricted: boolean; dailyPoints: number }) {
  const a = context.activity;
  const blockers: string[] = [];
  if (context.restricted) blockers.push('OWNER_RESTRICTED');
  if (context.duplicate) blockers.push('DUPLICATE_EVIDENCE');
  if (!row.wallet_address || row.wallet_address.toLowerCase() !== context.boundWallet?.toLowerCase()) blockers.push('WALLET_MISMATCH');
  if (!a || a.activity_id !== row.verified_activity_id || a.source_chain_id !== 677 || row.chain_id !== 677 || a.source_tx_hash.toLowerCase() !== row.tx_hash?.toLowerCase() || !Number.isSafeInteger(row.source_log_index) || Number(row.source_log_index)<0 || a.source_log_index !== row.source_log_index || a.user_wallet.toLowerCase() !== row.wallet_address?.toLowerCase() || a.status !== 'CONFIRMED' || a.kind !== 'SWAP_EXECUTED' || !['ROUTER_V3_RECEIPT','ROUTER_V4_SWAP_ACTIVITY'].includes(a.evidence_source) || !/^\d+$/.test(a.amount_raw) || BigInt(a.amount_raw) <= 0n) blockers.push('TRANSACTION_EVIDENCE');
  if (row.policy_version !== DEFAULT_FLOW_POINTS_V2_POLICY.version || !a || !isFlowPointsV2Active(a.occurred_at) || row.day_key !== a.occurred_at.slice(0,10) || row.verified_usd == null || !Number.isFinite(row.verified_usd) || row.verified_usd < 5 || row.points > Math.floor(row.verified_usd) || !Number.isSafeInteger(row.points) || row.points <= 0 || !Number.isSafeInteger(row.base_points) || row.base_points<row.points || !Number.isSafeInteger(context.dailyPoints) || context.dailyPoints<row.points || context.dailyPoints > 1000) blockers.push('POLICY_OR_LIMIT_VIOLATION');
  if (!['FUNDED','UNFUNDED'].includes(row.funding_state) || !['PENDING','VERIFIED','EXCEPTION_APPROVED'].includes(row.provenance_state) || (row.funding_state==='UNFUNDED' && row.reservation_id)) blockers.push('INVALID_LIFECYCLE');
  if (row.funding_state === 'FUNDED') {
    const r = context.reservation;
    if (!r || r.reservation_id !== row.reservation_id || r.ledger_id !== row.id || r.user_id !== row.user_id || r.wallet_address?.toLowerCase() !== row.wallet_address?.toLowerCase() || r.points !== row.points || r.program_id !== 'CORE_SWAP') blockers.push('ORIGINAL_RESERVATION_MISMATCH');
  }
  if (blockers.length) return { status: 'BLOCKED' as EvidenceStatus, reasons: blockers, condition: blockers.join('|'), exceptionAllowed: false };
  if (row.provenance_state === 'VERIFIED' || row.provenance_state === 'EXCEPTION_APPROVED') return { status: 'SYSTEM_VERIFIED' as EvidenceStatus, reasons: [], condition: 'ACCEPTED', exceptionAllowed: false };
  // Recorded JSON is diagnostic, not an independently authenticated historical price archive.
  return { status: 'NEEDS_EXCEPTION_REVIEW' as EvidenceStatus, reasons: ['ORIGINAL_VALUATION_NOT_REPRODUCIBLE'], condition: `${row.policy_version}|${a?.evidence_source}|ORIGINAL_VALUATION_NOT_REPRODUCIBLE`, exceptionAllowed: true };
}