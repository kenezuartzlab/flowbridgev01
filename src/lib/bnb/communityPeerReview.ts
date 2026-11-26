// V1.15 private community peer-review workflow — records only substantive signed human responses.
// This module cannot create attestations, certify the candidate, approve launch or modify the frozen source.
export const REVIEWED_SOURCE_SHA256 = '5e82f02854d6cdd0a34ba16e2d2bc0e1c1e605319b4094ebfb2fe9549d6b0425';
export const REVIEWED_ABI_SHA256 = 'd4453c306a097b9141ef62403bcefa3c436a7fd90dcc888805e75d94e5b9b856';
export const REVIEWED_RUNTIME_KECCAK = '0x8410959bb5c8d0d69f4a1ab9c3c4cc9a4748e6cf35af58c73f6fa53ae059469f';
export const REVIEW_RESPONSE_MAX_AGE_DAYS = 90;
export const REVIEW_REVISION_RULE = 'Any Solidity, ABI or runtime-bytecode change requires a new candidate/packet revision and voids every earlier response. Responses also expire after 90 days.';

export const SLITHER_HIGH_FINDINGS = [
  { key: 'swapExactBnbForUsdt|deposit|wbnbBefore', slitherId: '35bbdd20078e1184ac60bb820046e27ed822c6b0b4d5afe4b93a15db21ab7190' },
  { key: 'swapExactUsdtForBnb|_safeTransferFrom|wbnbBefore', slitherId: '39e09e6f46da48fcc6637535a3b9e68eee3d28e0824aacb871a95734f7d2311a' },
  { key: 'swapExactUsdtForBnb|_swap|wbnbBefore', slitherId: '643f5e0602aefd6a089f4c1f47c3b480c40efd862a9280d9f9efc0a0de4a0042' },
  { key: 'swapExactBnbForUsdt|_swap|usdtBefore', slitherId: 'be23b08d0d903b9351a60acae031b18c0e8eebda8d91d548a981504a9ca86d4f' },
  { key: 'swapExactUsdtForBnb|_safeTransferFrom|usdtBefore', slitherId: 'c6ff56409ede0d3e80f9c35555eb7abc485d20e1c0c07a72f52387c59ad9d176' },
  { key: 'swapExactBnbForUsdt|deposit|usdtBefore', slitherId: 'd34aa27be72a6343f53d92f611f0082b8e1c60a5272c143d0f5771e019b313a1' },
] as const;

export type FindingOutcome = 'FINDING_CONFIRMED' | 'FALSE_POSITIVE_WITH_JUSTIFICATION' | 'UNVERIFIED';
export type HumanFindingResponse = { slitherId: string; outcome: FindingOutcome; justification: string };
export type HumanReviewResponse = {
  schema: 'flowbridge-bnb-v113-human-response-v1';
  reviewer: { name: string; contact: string };
  signedAt: string;
  validUntil: string;
  sourceSha256: string;
  abiSha256: string;
  runtimeKeccak: string;
  signature: { kind: 'PGP' | 'SAFE_MESSAGE' | 'GITHUB_SIGNED_COMMIT'; value: string };
  findings: HumanFindingResponse[];
};
export type ReviewRejection = 'BAD_SCHEMA' | 'REVIEWER_REQUIRED' | 'SIGNATURE_REQUIRED' | 'HASH_MISMATCH' | 'BAD_DATES' | 'EXPIRED' | 'INCOMPLETE_FINDINGS' | 'INSUFFICIENT_JUSTIFICATION';

const DAY_MS = 86_400_000;
const validDate = (value: string) => Number.isFinite(Date.parse(value));

export function validateHumanResponse(response: HumanReviewResponse, now = new Date()): ReviewRejection[] {
  const reasons = new Set<ReviewRejection>();
  if (response.schema !== 'flowbridge-bnb-v113-human-response-v1') reasons.add('BAD_SCHEMA');
  if (!response.reviewer.name.trim() || !response.reviewer.contact.trim() || /\b(AI|ChatGPT|Claude|Lovable|bot)\b/i.test(response.reviewer.name)) reasons.add('REVIEWER_REQUIRED');
  if (!response.signature.value.trim() || response.signature.value.trim().length < 20) reasons.add('SIGNATURE_REQUIRED');
  if (response.sourceSha256 !== REVIEWED_SOURCE_SHA256 || response.abiSha256 !== REVIEWED_ABI_SHA256 || response.runtimeKeccak !== REVIEWED_RUNTIME_KECCAK) reasons.add('HASH_MISMATCH');
  const signedMs = Date.parse(response.signedAt), expiryMs = Date.parse(response.validUntil);
  if (!validDate(response.signedAt) || !validDate(response.validUntil) || expiryMs <= signedMs || expiryMs - signedMs > REVIEW_RESPONSE_MAX_AGE_DAYS * DAY_MS) reasons.add('BAD_DATES');
  if (validDate(response.validUntil) && expiryMs <= now.getTime()) reasons.add('EXPIRED');
  const expected: ReadonlySet<string> = new Set(SLITHER_HIGH_FINDINGS.map((finding) => finding.slitherId));
  const actual = response.findings.map((finding) => finding.slitherId);
  if (response.findings.length !== expected.size || new Set(actual).size !== expected.size || actual.some((id) => !expected.has(id))) reasons.add('INCOMPLETE_FINDINGS');
  for (const finding of response.findings) {
    const minimum = finding.outcome === 'FALSE_POSITIVE_WITH_JUSTIFICATION' ? 120 : finding.outcome === 'FINDING_CONFIRMED' ? 60 : 30;
    if (finding.justification.trim().length < minimum) reasons.add('INSUFFICIENT_JUSTIFICATION');
  }
  return [...reasons];
}

export function summarizePeerReview(responses: readonly HumanReviewResponse[], now = new Date()) {
  const accepted = responses.filter((response) => validateHumanResponse(response, now).length === 0);
  const uniqueReviewers = new Map<string, HumanReviewResponse>();
  for (const response of accepted) uniqueReviewers.set(response.reviewer.contact.trim().toLowerCase(), response);
  const substantive = [...uniqueReviewers.values()];
  return {
    status: substantive.length === 0 ? 'ZERO_REVIEWERS' : substantive.length === 1 ? 'ONE_REVIEWER' : 'MULTIPLE_REVIEWERS',
    substantiveSignedResponses: substantive.length,
    rejectedResponses: responses.length - accepted.length,
    confirmedFindingIds: [...new Set(substantive.flatMap((response) => response.findings.filter((finding) => finding.outcome === 'FINDING_CONFIRMED').map((finding) => finding.slitherId)))],
    launchApproval: false,
    certification: 'NONE',
  } as const;
}
