/** Read-only assessment of authoritative originals. Never promotes or funds historical rows. */
import { coreSwapAward, DEFAULT_FLOW_POINTS_V2_POLICY, isFlowPointsV2Active } from './flowPointsV2';
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
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {};
  const a = context.activity;
  const blockers: string[] = [];
  if (context.restricted) blockers.push('OWNER_RESTRICTED');
  if (context.duplicate) blockers.push('DUPLICATE_EVIDENCE');
  if (!row.wallet_address || row.wallet_address.toLowerCase() !== context.boundWallet?.toLowerCase()) blockers.push('WALLET_MISMATCH');
  if (!a || a.source_chain_id !== 677 || row.chain_id !== 677 || a.source_tx_hash.toLowerCase() !== row.tx_hash?.toLowerCase() || a.source_log_index !== row.source_log_index || a.user_wallet.toLowerCase() !== row.wallet_address?.toLowerCase() || a.status !== 'CONFIRMED' || a.kind !== 'SWAP_EXECUTED' || !['ROUTER_V3_RECEIPT','ROUTER_V4_SWAP_ACTIVITY'].includes(a.evidence_source) || !/^\d+$/.test(a.amount_raw) || BigInt(a.amount_raw) <= 0n) blockers.push('TRANSACTION_EVIDENCE');
  if (row.policy_version !== DEFAULT_FLOW_POINTS_V2_POLICY.version || !a || !isFlowPointsV2Active(a.occurred_at) || row.verified_usd == null || !Number.isFinite(row.verified_usd) || row.verified_usd < 5 || row.points > Math.floor(row.verified_usd) || row.points <= 0 || context.dailyPoints > 1000) blockers.push('POLICY_OR_LIMIT_VIOLATION');
  if (row.funding_state === 'FUNDED') {
    const r = context.reservation;
    if (!r || r.reservation_id !== row.reservation_id || r.ledger_id !== row.id || r.user_id !== row.user_id || r.wallet_address?.toLowerCase() !== row.wallet_address?.toLowerCase() || r.points !== row.points || r.program_id !== 'CORE_SWAP') blockers.push('ORIGINAL_RESERVATION_MISMATCH');
  }
  if (blockers.length) return { status: 'BLOCKED' as EvidenceStatus, reasons: blockers, condition: blockers.join('|'), exceptionAllowed: false };
  if (row.provenance_state === 'VERIFIED' || row.provenance_state === 'EXCEPTION_APPROVED') return { status: 'SYSTEM_VERIFIED' as EvidenceStatus, reasons: [], condition: 'ACCEPTED', exceptionAllowed: false };
  const valuation = metadata.valuationEvidence as Record<string, unknown> | undefined;
  const price = Number(valuation?.priceUsd), decimals = Number(valuation?.decimals);
  const observed = Date.parse(String(valuation?.observedAt ?? ''));
  const eventTime = Date.parse(a?.occurred_at ?? '');
  const originalCalculation = valuation?.authority === 'SERVER_CANONICAL_INGEST_V1' && typeof valuation.source === 'string' && valuation.source.length > 0 && Number.isFinite(price) && price > 0 && Number.isInteger(decimals) && decimals >= 0 && decimals <= 36 && valuation.amountRaw === a?.amount_raw && Number.isFinite(observed) && observed >= eventTime && observed - eventTime <= 15 * 60_000 && metadata.validationStatus === 'PASS' && metadata.policyVersion === row.policy_version && metadata.dailyCoreSwapCap === 1000 && Number.isInteger(metadata.alreadyAwardedToday) && Number(metadata.alreadyAwardedToday) >= 0;
  const usd = a ? Number(a.amount_raw) / 10 ** decimals * price : NaN;
  const calculated = coreSwapAward(usd, Number(metadata.alreadyAwardedToday));
  if (originalCalculation && Math.abs(usd - Number(row.verified_usd)) <= Math.max(1e-9, usd * 1e-12) && calculated.award === row.points && calculated.base === row.base_points) return { status: 'ORIGINAL_EVIDENCE_ESTABLISHED' as EvidenceStatus, reasons: [], condition: 'ORIGINAL_SERVER_EVIDENCE', exceptionAllowed: false };
  return { status: 'NEEDS_EXCEPTION_REVIEW' as EvidenceStatus, reasons: ['ORIGINAL_VALUATION_NOT_REPRODUCIBLE'], condition: `${row.policy_version}|${a?.evidence_source}|ORIGINAL_VALUATION_NOT_REPRODUCIBLE`, exceptionAllowed: true };
}