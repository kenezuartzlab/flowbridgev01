/** Presentation only. These states never authorize funding, renewal or signing. */
export function payoutStatus(input: {
  securityAccepted: boolean; evidenceBlocked: boolean; qualifiedFlow: number;
  scheduleNeedsRenewal: boolean; readyForReview: boolean; confirmed: boolean;
}) {
  const eligible = !input.evidenceBlocked && input.qualifiedFlow > 0;
  return {
    security: input.securityAccepted ? 'SECURITY READY' : 'SECURITY BLOCKED',
    evidence: input.evidenceBlocked ? 'REWARD EVIDENCE UNDER REVIEW' : 'REWARD EVIDENCE VERIFIED',
    batch: eligible ? 'BATCH ELIGIBLE' : 'BATCH INELIGIBLE',
    schedule: input.scheduleNeedsRenewal ? 'SCHEDULE NEEDS RENEWAL' : 'SCHEDULE VALID',
    publication: input.confirmed ? 'CONFIRMED ON-CHAIN' : eligible && input.readyForReview
      ? 'AWAITING AUTHORIZED SIGNATURE' : 'PUBLICATION BLOCKED',
    nextAction: input.evidenceBlocked || !input.securityAccepted || !eligible ? 'Re-check' : input.scheduleNeedsRenewal ? 'Review renewal proposal' : 'Review',
  };
}