/**
 * Historical evidence exception review (pure). A Core Swap reward whose on-chain
 * trade is independently verified but whose original pricing record is
 * incomplete may be accepted only through an approved exception decision made
 * by a different super admin than the proposer. Amounts are never changed.
 */
export const EXCEPTION_POLICY_ID = 'HISTORICAL_PRICING_EXCEPTION_V1';
export const ACCEPTED_PROVENANCE: ReadonlySet<string> = new Set(['VERIFIED', 'EXCEPTION_APPROVED']);
export const isAcceptedProvenance = (state: string | null | undefined) => ACCEPTED_PROVENANCE.has(state ?? '');

export type ExceptionProposalInput = { rationale: string; uncertainty: string; priceSource?: string; priceUsd?: number | null };
export function validateExceptionProposal(i: ExceptionProposalInput): { ok: true } | { ok: false; error: string } {
  const rationale = (i.rationale ?? '').trim(), uncertainty = (i.uncertainty ?? '').trim();
  if (rationale.length < 20 || rationale.length > 2000) return { ok: false, error: 'Explain the decision in 20–2,000 characters.' };
  if (uncertainty.length < 5 || uncertainty.length > 1000) return { ok: false, error: 'Describe what remains uncertain.' };
  if ((i.priceSource ?? '').trim().length < 5) return { ok: false, error: 'Document the historical price evidence source. Missing evidence alone cannot be approved.' };
  if ((i.priceSource ?? '').length > 500) return { ok: false, error: 'Price source is too long.' };
  if (i.priceUsd != null && !(Number.isFinite(i.priceUsd) && i.priceUsd >= 0)) return { ok: false, error: 'Price must be a positive number.' };
  return { ok: true };
}

export function canDecideException(review: { status: string; proposedBy: string }, actor: { userId: string; role: string }) {
  if (actor.role !== 'super_admin') return { ok: false as const, reason: 'Only a super admin can decide an exception.' };
  if (review.status !== 'PROPOSED') return { ok: false as const, reason: `This review is already ${review.status.toLowerCase()}.` };
  if (review.proposedBy === actor.userId) return { ok: false as const, reason: 'A different reviewer must decide this exception.' };
  return { ok: true as const };
}

export const PIPELINE = ['Earned', 'Verified', 'Approved & Funded', 'Ready for Distribution', 'Published', 'Claimable', 'Claimed'] as const;
