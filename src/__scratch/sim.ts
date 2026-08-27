import { evaluateReleaseFreeze, CURRENT_RELEASE_FREEZE_INPUT, currentCandidateDigest, APPROVED_SAFE_DECISION_VALUES, type DecisionSubmission } from '@/lib/deploy/mainnetReleaseFreeze';
const cd = currentCandidateDigest();
const base = { approvedByEmail: 'kenezuartzlab@gmail.com', approvedAt: new Date().toISOString(), candidateDigest: cd };
const subs: DecisionSubmission[] = [
  { ...base, decisionId: 'FLOW_ECONOMICS', action: 'APPROVE' },
  { ...base, decisionId: 'GOVERNANCE_SAFE_PLAN', action: 'REPLACE', value: APPROVED_SAFE_DECISION_VALUES.GOVERNANCE_SAFE_PLAN },
  { ...base, decisionId: 'TREASURY_SAFE_PLAN', action: 'REPLACE', value: { ...APPROVED_SAFE_DECISION_VALUES.TREASURY_SAFE_PLAN, concentrationApproved: false } },
  { ...base, decisionId: 'OPERATIONS_SAFE_PLAN', action: 'REPLACE', value: APPROVED_SAFE_DECISION_VALUES.OPERATIONS_SAFE_PLAN },
  { ...base, decisionId: 'TIMELOCK_POLICY', action: 'APPROVE' },
  { ...base, decisionId: 'REWARDS_LAUNCH_PLAN', action: 'APPROVE' },
  { ...base, decisionId: 'STAKING_LAUNCH_PLAN', action: 'REPLACE', value: { initialTreasuryFundingFlow: 10_000_000, year1TotalReleaseCeilingFlow: 3_000_000, maxWeeklyRewardBudgetFlow: 50_000, enabledProducts: [] } },
  { ...base, decisionId: 'GAS_BUDGET_PLAN', action: 'APPROVE' },
  { ...base, decisionId: 'DEPENDENCY_SNAPSHOT', action: 'APPROVE' },
  { ...base, decisionId: 'ROOT_PUBLISHER_ASSIGNMENT', action: 'REPLACE', value: { address: '0x1111111111111111111111111111111111111111' } },
  { ...base, decisionId: 'ACTIVITY_ATTESTER_ASSIGNMENT', action: 'REPLACE', value: { address: '0x2222222222222222222222222222222222222222' } },
];
const r = evaluateReleaseFreeze({ ...CURRENT_RELEASE_FREEZE_INPUT, submissions: subs, candidateDigest: cd });
console.log(r.verdict, r.stagedReadiness);
console.log('outstanding', r.outstanding);
console.log('findings', r.failClosedFindings);
console.log(r.decisions.filter(d=>d.blockers.length).map(d=>[d.id,d.status,d.blockers]));
