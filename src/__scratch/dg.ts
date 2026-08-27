import { currentCandidateDigest, APPROVED_SAFE_DECISION_VALUES } from '@/lib/deploy/mainnetReleaseFreeze';
console.log(currentCandidateDigest());
console.log(JSON.stringify(APPROVED_SAFE_DECISION_VALUES, null, 1));
