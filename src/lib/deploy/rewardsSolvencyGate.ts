/**
 * FlowBridge V30.1B.2 — rewards distributor mainnet solvency gate.
 *
 * Pure, descriptive and fail-closed. It records the canonical architecture
 * decision, the solvency formula, the measured build identity and the evidence
 * produced by the isolated audit workspace. It never compiles, deploys, signs,
 * broadcasts or funds anything.
 */
import { EIP170_LIMIT_BYTES } from './securityGate';
import { REWARDS_MODEL_DECISION } from '@/lib/rewards/flowRewardsModel';

export const CANONICAL_REWARDS_CONTRACT_ID = 'FlowRewardsMerkleDistributor';

export interface RewardsBuildLine {
  version: string;
  optimizer: { enabled: boolean; runs: number };
  viaIR: boolean;
  evmVersion: string;
  openZeppelin: string;
}

/** Frozen build line for the final candidate. Changing it invalidates the hashes. */
export const REWARDS_BUILD_LINE: RewardsBuildLine = {
  version: '0.8.24',
  optimizer: { enabled: true, runs: 200 },
  viaIR: true,
  evmVersion: 'cancun',
  openZeppelin: '5.6.1',
};

export interface RewardsBuildIdentity {
  contractId: string;
  sourcePath: string;
  creationBytes: number;
  runtimeBytes: number;
  sourceSha256: string;
  creationSha256: string;
  runtimeSha256: string;
  normalizedAbiSha256: string;
}

export const CANONICAL_REWARDS_IDENTITY: RewardsBuildIdentity = {
  contractId: CANONICAL_REWARDS_CONTRACT_ID,
  sourcePath: 'contracts/production/rewards-distributor/FlowRewardsMerkleDistributor.sol',
  creationBytes: 7_181,
  runtimeBytes: 5_861,
  sourceSha256: 'cbf90ce714c2c6ca6df9b55637a2a671e820da6a2a0404d7813590450bec0d43',
  creationSha256: 'b7eb1e3033512f1598c53094ddf47cd207d7952468efe613a97ce13257c9ba3a',
  runtimeSha256: '180611b009e3472d50c4691d742438372bdb1d73ffd8222bb5c506635008d3d1',
  normalizedAbiSha256: '821333ca4a60c6c2ce6354835a95066b3f94c74acf2a657712646ea4e783fa79',
};

/**
 * Solvency formula, enforced by contract state (not by server trust):
 *
 *   freeBalance   = max(0, balanceOf(distributor) - totalReserved)
 *   budgetHeadroom= max(0, campaignBudget - (totalClaimed + totalReserved))
 *
 * publishEpoch(root, allocation) reverts unless
 *   balanceOf(distributor) >= totalReserved + allocation   (funded)
 *   totalClaimed + totalReserved + allocation <= campaignBudget  (budgeted)
 */
export const SOLVENCY_MODEL = {
  reservedDefinition: 'Sum of unclaimed allocation across live (published, not cancelled/released) epochs.',
  spentDefinition: 'totalClaimed — FLOW already transferred to users, incremented before each transfer.',
  freeFormula: 'freeBalance = max(0, token.balanceOf(distributor) - totalReserved)',
  recoveryBound: 'recoverFree(amount) reverts when amount > freeBalance, and pays only recoveryRecipient.',
  releaseRules: [
    'cancelEpoch: BUDGET_MANAGER only, strictly before claimStart, releases allocation - claimed.',
    'releaseExpiredEpoch: BUDGET_MANAGER only, strictly after claimEnd, releases allocation - claimed.',
  ],
  mintPaths: 0,
} as const;

export interface RewardsRoleRow {
  role: string;
  holder: 'APPROVED_MULTISIG_REQUIRED' | 'SERVER_SECRET' | 'OPERATOR_KEY' | 'NONE' | 'USER';
  capabilities: readonly string[];
  cannot: readonly string[];
}

export const REWARDS_ROLE_MATRIX: readonly RewardsRoleRow[] = [
  {
    role: 'DEFAULT_ADMIN_ROLE',
    holder: 'APPROVED_MULTISIG_REQUIRED',
    capabilities: ['rotate roles', 'set minPublishDelay within [1h, 7d]', 'set recovery recipient', 'unpause', 'recover free balance'],
    cannot: ['mint FLOW', 'touch reserved allocations', 'redirect a user claim', 'publish an epoch', 'raise the campaign budget'],
  },
  {
    role: 'BUDGET_MANAGER_ROLE',
    holder: 'APPROVED_MULTISIG_REQUIRED',
    capabilities: ['set the campaign budget at or above committed spend', 'cancel a pre-claim epoch', 'release expired allocation'],
    cannot: ['publish an epoch root', 'move FLOW to itself', 'reduce the budget below totalClaimed + totalReserved'],
  },
  {
    role: 'PUBLISHER_ROLE',
    holder: 'SERVER_SECRET',
    capabilities: ['publish epoch roots inside the approved budget and funded balance'],
    cannot: ['exceed campaignBudget', 'publish against unfunded capacity', 'shorten the publish delay', 'withdraw FLOW'],
  },
  {
    role: 'PAUSER_ROLE',
    holder: 'OPERATOR_KEY',
    capabilities: ['pause claims and publication in an emergency'],
    cannot: ['unpause (admin only)', 'move funds', 'destroy a live obligation'],
  },
  {
    role: 'claimant',
    holder: 'USER',
    capabilities: ['claim exactly the leaf-committed amount once, to the committed account'],
    cannot: ['claim twice', 'claim another account to itself', 'claim outside the epoch window'],
  },
] as const;

export const ROLE_ROTATION_BEHAVIOUR = [
  'Rotating PUBLISHER/BUDGET_MANAGER/PAUSER/admin never mutates epochs, roots, reservations or the claim bitmap.',
  'A published, funded epoch therefore stays claimable across any rotation — no deterministic reissue path is needed.',
  'The retired EIP-712 model, by contrast, invalidated every live signature on setRewardSigner; this is a reason it was rejected for mainnet.',
] as const;

export interface SolidityEvidence {
  suitePath: string;
  passing: number;
  fuzzProperties: number;
  fuzzRunsPerProperty: number;
  highlights: readonly string[];
}

export const SOLIDITY_EVIDENCE: SolidityEvidence = {
  suitePath: 'contracts/production/rewards-distributor/test/V30_1B2_RewardsSolvency.t.sol',
  passing: 24,
  fuzzProperties: 2,
  fuzzRunsPerProperty: 256,
  highlights: [
    'test_ConcurrentEpochsCannotOverbookFunding — the second 60-FLOW epoch against 100 FLOW funding reverts InsufficientFunding and totalReserved is unchanged.',
    'test_FullyReservedFundingLeavesNoRecoverableBalance — freeBalance() == 0 and recoverFree(1) reverts ExceedsFreeBalance.',
    'test_AdditionalFundingOnlyIncreasesFreeCapacity — top-up raises free capacity only, never a reservation.',
    'test_AdminCannotRecoverReservedFunds — recoverFree(reserved) reverts and the balance is untouched.',
    'test_ClaimReducesReservationAndPaysOnce — claim pays exactly once, then reverts AlreadyClaimed.',
    'test_ThirdPartySubmitterCannotRedirectPayout — a foreign submitter pays the committed account, not itself.',
    'test_ForeignChainLeafRejected — a leaf built for another chainId fails proof verification.',
    'test_ReentrantTokenCannotDoubleClaim — a re-entering reward token reverts and leaves accounting intact.',
    'test_PauseBlocksClaimsAndCreatesNoTheftPath — pause halts claims and opens no admin withdrawal of reserved FLOW.',
    'test_RoleRotationPreservesLiveObligations — the obligation survives publisher rotation.',
    'test_ExpiryReleasesOnlyUnclaimedRemainder / test_CancelAfterClaimsStartedReverts — explicit release rules only.',
    'testFuzz_SolvencyInvariantHolds / testFuzz_RecoveryNeverTouchesReserved — balance >= totalReserved holds across 512 randomized runs.',
  ],
};

export interface SlitherFinding {
  check: string;
  impact: string;
  count: number;
  disposition: string;
}

export const SLITHER_RUN = {
  tool: 'slither-analyzer',
  version: '0.11.3',
  solc: '0.8.24',
  args: '--via-ir --optimize --optimize-runs 200 --exclude-dependencies',
  contractsAnalyzed: 14,
  detectors: 100,
  results: 25,
  ownContractResults: 5,
} as const;

export const SLITHER_TRIAGE: readonly SlitherFinding[] = [
  {
    check: 'timestamp',
    impact: 'Low',
    count: 4,
    disposition:
      'By design: claimStart/claimEnd/minPublishDelay are coarse-grained windows measured in hours-to-days. Miner timestamp drift of seconds cannot open a window early enough to defeat the publish delay, and no accounting depends on exact timestamps.',
  },
  {
    check: 'pragma',
    impact: 'Informational',
    count: 1,
    disposition:
      'Mixed pragma ranges come from the pinned OpenZeppelin 5.6.1 interfaces; the distributor itself is compiled at exactly 0.8.24. No change.',
  },
];

export const REWARDS_GOVERNANCE_PREPARATION = {
  admin: null as string | null,
  budgetManager: null as string | null,
  publisher: null as string | null,
  pauser: null as string | null,
  recoveryRecipient: null as string | null,
  minPublishDelaySeconds: 21_600,
  note:
    'Constructor inputs are deliberately unassigned. DEFAULT_ADMIN must be the approved production multisig/timelock, never a developer wallet, and the publisher key must never be reachable from the browser, Flow AI, ordinary app routes, logs or analytics.',
} as const;

export interface RewardsSolvencyVerdict {
  pass: boolean;
  /** Solvency is enforced in canonical contract state. */
  solvencyEnforced: boolean;
  /** Blockers that must close before the distributor may be deployed. */
  deploymentBlockers: readonly string[];
  reasons: readonly string[];
}

/**
 * Fail-closed gate evaluation. PASS means the selected contract enforces funded
 * obligations and is ready for independent audit review. It never authorizes a
 * deployment, and governance assignment remains an explicit later gate.
 */
export function evaluateRewardsSolvencyGate(): RewardsSolvencyVerdict {
  const reasons: string[] = [];

  if (REWARDS_MODEL_DECISION.chosen !== 'BUDGETED_MERKLE_EPOCH') {
    reasons.push('No canonical mainnet rewards architecture is selected.');
  }
  if (CANONICAL_REWARDS_IDENTITY.runtimeBytes > EIP170_LIMIT_BYTES) {
    reasons.push('Canonical distributor runtime exceeds EIP-170.');
  }
  if (SOLIDITY_EVIDENCE.passing < 24 || SOLIDITY_EVIDENCE.fuzzProperties < 2) {
    reasons.push('Solidity solvency/claim/governance evidence is incomplete.');
  }
  if (SLITHER_TRIAGE.length === 0) {
    reasons.push('Static analysis findings are untriaged.');
  }
  if (SOLVENCY_MODEL.mintPaths !== 0) {
    reasons.push('A mint path exists in the reward flow.');
  }

  const deploymentBlockers = [
    'V30.1B-G1 — approved production multisig/timelock for DEFAULT_ADMIN/BUDGET_MANAGER is not assigned.',
    'V30.1B.2-E1 — approved campaign budget, epoch cadence and Points→FLOW allocation economics are not signed off.',
    'V30.1B.2-P1 — publisher key custody, monitoring and rotation runbook not provisioned in the production secret store.',
    'V30.1B.2-M1 — epoch manifest generator/publication pipeline (root + proof distribution) not built or reviewed.',
  ];

  return {
    pass: reasons.length === 0,
    solvencyEnforced: reasons.length === 0,
    deploymentBlockers,
    reasons,
  };
}
