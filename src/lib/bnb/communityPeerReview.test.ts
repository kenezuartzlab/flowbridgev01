import { describe, expect, it } from 'vitest';
import { REVIEWED_ABI_SHA256, REVIEWED_RUNTIME_KECCAK, REVIEWED_SOURCE_SHA256, SLITHER_HIGH_FINDINGS, summarizePeerReview, validateHumanResponse, type HumanReviewResponse } from './communityPeerReview';

const NOW = new Date('2026-11-26T04:00:00Z');
const response = (patch: Partial<HumanReviewResponse> = {}): HumanReviewResponse => ({
  schema: 'flowbridge-bnb-v113-human-response-v1',
  reviewer: { name: 'Synthetic Human Fixture', contact: 'reviewer-one@example.invalid' },
  signedAt: '2026-11-25T00:00:00Z', validUntil: '2027-02-23T00:00:00Z',
  sourceSha256: REVIEWED_SOURCE_SHA256, abiSha256: REVIEWED_ABI_SHA256, runtimeKeccak: REVIEWED_RUNTIME_KECCAK,
  signature: { kind: 'PGP', value: 'synthetic-test-signature-not-a-real-attestation' },
  findings: SLITHER_HIGH_FINDINGS.map((finding) => ({ slitherId: finding.slitherId, outcome: 'UNVERIFIED', justification: 'Synthetic test fixture: not independently reproduced; live target behavior remains unverified.' })),
  ...patch,
});

describe('private substantive human review workflow', () => {
  it('actual current packet has zero reviewers and no certification or launch approval', () => {
    expect(summarizePeerReview([], NOW)).toEqual({ status: 'ZERO_REVIEWERS', substantiveSignedResponses: 0, rejectedResponses: 0, confirmedFindingIds: [], launchApproval: false, certification: 'NONE' });
  });
  it('accepts one substantive signed response and reports ONE_REVIEWER', () => {
    const result = summarizePeerReview([response()], NOW);
    expect(result.status).toBe('ONE_REVIEWER');
    expect(result.substantiveSignedResponses).toBe(1);
    expect(result.launchApproval).toBe(false);
  });
  it('deduplicates a reviewer and supports MULTIPLE_REVIEWERS', () => {
    const second = response({ reviewer: { name: 'Another Human Fixture', contact: 'reviewer-two@example.invalid' } });
    expect(summarizePeerReview([response(), response(), second], NOW).status).toBe('MULTIPLE_REVIEWERS');
    expect(summarizePeerReview([response(), response(), second], NOW).substantiveSignedResponses).toBe(2);
  });
  it('supports confirmed, justified false-positive and unverified outcomes', () => {
    const confirmed = response();
    confirmed.findings[0] = { ...confirmed.findings[0]!, outcome: 'FINDING_CONFIRMED', justification: 'Synthetic fixture only: a concrete reproduction trace and impact statement exceed sixty characters.' };
    confirmed.findings[1] = { ...confirmed.findings[1]!, outcome: 'FALSE_POSITIVE_WITH_JUSTIFICATION', justification: 'Synthetic fixture only: this detailed justification explains why the warned state transition cannot affect value movement, identifies the exact lock and fixed target, and is longer than one hundred twenty characters.' };
    expect(validateHumanResponse(confirmed, NOW)).toEqual([]);
    expect(summarizePeerReview([confirmed], NOW).confirmedFindingIds).toEqual([SLITHER_HIGH_FINDINGS[0]!.slitherId]);
  });
  it('rejects AI sign-off, wrong hashes, expiry and missing findings', () => {
    expect(validateHumanResponse(response({ reviewer: { name: 'AI reviewer', contact: 'ai@example.invalid' } }), NOW)).toContain('REVIEWER_REQUIRED');
    expect(validateHumanResponse(response({ sourceSha256: '0'.repeat(64) }), NOW)).toContain('HASH_MISMATCH');
    expect(validateHumanResponse(response({ validUntil: '2026-11-26T00:00:00Z' }), NOW)).toContain('EXPIRED');
    expect(validateHumanResponse(response({ findings: [] }), NOW)).toContain('INCOMPLETE_FINDINGS');
  });
  it('rejects a false-positive label without detailed justification', () => {
    const value = response();
    value.findings = value.findings.map((finding) => ({ ...finding, outcome: 'FALSE_POSITIVE_WITH_JUSTIFICATION', justification: 'Looks safe' }));
    expect(validateHumanResponse(value, NOW)).toContain('INSUFFICIENT_JUSTIFICATION');
  });
});
