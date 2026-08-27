import { describe, expect, it } from 'vitest';
import {
  APPROVED_AUTHORITIES,
  DEPLOYMENT_STAGE_ORDER,
  V30_1E_CANDIDATE_DIGEST,
  V30_1E_DECISION_MANIFEST_HASH,
  deploymentGateVerdict,
  evaluateFundingCheckpoint,
  evaluateInvariantSnapshot,
  evaluateStageBroadcast,
  requiredGasWei,
  type DeploymentStageId,
  type SafeObservation,
  type StageBroadcastInput,
  type StageState,
} from './mainnetDeploymentGate';

const safe = (address: string): SafeObservation => ({
  address,
  owners: ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222', '0x3333333333333333333333333333333333333333'],
  threshold: 2,
  hasCode: true,
});

const deps = [
  { name: 'wbot', address: '0xd545', hasCode: true, runtimeSha256: 'aa', frozenRuntimeSha256: 'AA' },
];

function input(overrides: Partial<StageBroadcastInput> = {}): StageBroadcastInput {
  return {
    stage: 'A_FLOW_TOKEN',
    candidateDigest: V30_1E_CANDIDATE_DIGEST,
    decisionManifestHash: V30_1E_DECISION_MANIFEST_HASH,
    rpcChainId: 677,
    completedStages: {},
    treasurySafe: safe(APPROVED_AUTHORITIES.treasurySafe),
    governanceSafe: safe(APPROVED_AUTHORITIES.governanceSafe),
    operationsSafe: safe(APPROVED_AUTHORITIES.operationsSafe),
    dependencies: deps,
    artifactBuildParityProven: true,
    deploymentSecretPresent: true,
    gasPriceWei: 1_000_000_000n,
    deployerBalanceWei: 10n ** 20n,
    stageApprovedByOwner: true,
    ...overrides,
  };
}

describe('V30.1E stage broadcast authorization', () => {
  it('authorizes stage A when every frozen precondition holds', () => {
    const v = evaluateStageBroadcast(input());
    expect(v.blockers).toEqual([]);
    expect(v.authorized).toBe(true);
  });

  it('blocks when the candidate digest or decision manifest changed', () => {
    expect(evaluateStageBroadcast(input({ candidateDigest: 'fnv1a64:dead' })).authorized).toBe(false);
    expect(
      evaluateStageBroadcast(input({ decisionManifestHash: 'fnv1a64:dead' })).authorized,
    ).toBe(false);
  });

  it('rejects any chain other than 677, including 968 and legacy 1024', () => {
    for (const chain of [968, 1024, 56, null]) {
      expect(evaluateStageBroadcast(input({ rpcChainId: chain })).authorized).toBe(false);
    }
  });

  it('enforces staged ordering — a later stage needs all prior stages DEPLOYED_VERIFIED', () => {
    const later = evaluateStageBroadcast(input({ stage: 'E_STAKING_V2' }));
    expect(later.authorized).toBe(false);
    const completed = Object.fromEntries(
      DEPLOYMENT_STAGE_ORDER.slice(0, 4).map((s) => [s, 'DEPLOYED_VERIFIED' as StageState]),
    ) as Partial<Record<DeploymentStageId, StageState>>;
    expect(
      evaluateStageBroadcast(input({ stage: 'E_STAKING_V2', completedStages: completed })).authorized,
    ).toBe(true);
  });

  it('blocks on any Safe owner/threshold mismatch after the freeze', () => {
    expect(
      evaluateStageBroadcast(input({ treasurySafe: { ...safe(APPROVED_AUTHORITIES.treasurySafe), threshold: 1 } }))
        .authorized,
    ).toBe(false);
    expect(evaluateStageBroadcast(input({ governanceSafe: null })).authorized).toBe(false);
  });

  it('blocks on dependency drift, unproven build parity, missing credential or thin gas', () => {
    expect(
      evaluateStageBroadcast(
        input({ dependencies: [{ ...deps[0]!, runtimeSha256: 'bb' }] }),
      ).authorized,
    ).toBe(false);
    expect(evaluateStageBroadcast(input({ artifactBuildParityProven: false })).authorized).toBe(false);
    expect(evaluateStageBroadcast(input({ deploymentSecretPresent: false })).authorized).toBe(false);
    expect(evaluateStageBroadcast(input({ deployerBalanceWei: 1n })).authorized).toBe(false);
    expect(evaluateStageBroadcast(input({ stageApprovedByOwner: false })).authorized).toBe(false);
  });

  it('includes the 30% buffer in the required gas budget', () => {
    expect(requiredGasWei(1n)).toBe(27_950_000n);
  });
});

const okSnapshot = {
  flowTotalSupplyFlow: 1_000_000_000,
  treasurySafeFlowBalance: 1_000_000_000,
  rewardsDistributorFlowBalance: 0,
  rewardsTotalReserved: 0,
  rewardsTokenAddress: '0xF10W',
  flowTokenAddress: '0xf10w',
  stakingTreasuryFlowBalance: 0,
  stakingPrincipalLiabilities: 0,
  stakingPositions: 0,
  rewardEpochs: 0,
  routerBridgeProxyEnabled: false,
  bridgeAdapterMainnetEnabled: false,
  activityRegistryRecords: 0,
  activityAdmin: APPROVED_AUTHORITIES.governanceSafe,
  activityAttester: APPROVED_AUTHORITIES.activityAttester,
  routerOwner: APPROVED_AUTHORITIES.governanceSafe,
  routerFeeTreasury: APPROVED_AUTHORITIES.treasurySafe,
  stakingProducts: ['FLEXIBLE', 'D30', 'D90', 'D180', 'D365'],
  stakingYear1GenesisCapFlow: 1_000_000,
  stakingYear1StandardCapFlow: 2_000_000,
  stakingYear1TotalCapFlow: 3_000_000,
  stakingWeeklyBudgetFlow: 50_000,
  genesisMaxRewardDays: 90,
  oracleState: 'PENDING_POOL' as const,
  dynamicBonusActive: false,
  unexpectedAllowances: 0,
};

describe('V30.1E post-deployment invariant snapshot', () => {
  it('passes the frozen zero-funding, zero-activity snapshot', () => {
    const v = evaluateInvariantSnapshot(okSnapshot);
    expect(v.violations).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it('flags funded rewards, live positions, enabled bridge proxy and active dynamic bonus', () => {
    expect(
      evaluateInvariantSnapshot({ ...okSnapshot, rewardsDistributorFlowBalance: 1_000_000 }).ok,
    ).toBe(false);
    expect(evaluateInvariantSnapshot({ ...okSnapshot, stakingPositions: 1 }).ok).toBe(false);
    expect(evaluateInvariantSnapshot({ ...okSnapshot, routerBridgeProxyEnabled: true }).ok).toBe(false);
    expect(evaluateInvariantSnapshot({ ...okSnapshot, dynamicBonusActive: true }).ok).toBe(false);
  });

  it('flags wrong authorities, cap drift and admin==attester', () => {
    expect(evaluateInvariantSnapshot({ ...okSnapshot, routerOwner: '0xdead' }).ok).toBe(false);
    expect(
      evaluateInvariantSnapshot({ ...okSnapshot, stakingYear1TotalCapFlow: 5_000_000 }).ok,
    ).toBe(false);
    expect(
      evaluateInvariantSnapshot({
        ...okSnapshot,
        activityAdmin: APPROVED_AUTHORITIES.activityAttester,
      }).ok,
    ).toBe(false);
  });
});

describe('V30.1E funding checkpoints', () => {
  const base = {
    contractsDeployedVerified: true,
    governanceHandoffProven: true,
    fundingSource: APPROVED_AUTHORITIES.treasurySafe,
    invariantSnapshotOk: true,
    ownerApproved: true,
  };

  it('authorizes only the exact approved amounts from the Treasury Safe', () => {
    expect(
      evaluateFundingCheckpoint({ ...base, checkpoint: 'REWARDS_FUNDING', amountFlow: 1_000_000 })
        .authorized,
    ).toBe(true);
    expect(
      evaluateFundingCheckpoint({ ...base, checkpoint: 'STAKING_FUNDING', amountFlow: 10_000_000 })
        .authorized,
    ).toBe(true);
    expect(
      evaluateFundingCheckpoint({ ...base, checkpoint: 'STAKING_FUNDING', amountFlow: 3_000_000 })
        .authorized,
    ).toBe(false);
    expect(
      evaluateFundingCheckpoint({
        ...base,
        checkpoint: 'REWARDS_FUNDING',
        amountFlow: 1_000_000,
        fundingSource: APPROVED_AUTHORITIES.operationsSafe,
      }).authorized,
    ).toBe(false);
  });

  it('never authorizes funding before deployment verification and handoff', () => {
    expect(
      evaluateFundingCheckpoint({
        ...base,
        contractsDeployedVerified: false,
        checkpoint: 'REWARDS_FUNDING',
        amountFlow: 1_000_000,
      }).authorized,
    ).toBe(false);
  });
});

describe('V30.1E deployment verdict', () => {
  it('is BLOCKED while nothing is deployed', () => {
    expect(
      deploymentGateVerdict({
        stages: [],
        invariants: null,
        governanceHandoffProven: false,
        explorerVerifiedForAllStages: false,
      }),
    ).toBe('FLOWBRIDGE V30.1E BOT MAINNET DEPLOYMENT VERIFICATION BLOCKED');
  });

  it('is PASS only with every stage verified, handoff proven and invariants clean', () => {
    const stages = DEPLOYMENT_STAGE_ORDER.map((stage) => ({
      stage,
      state: 'DEPLOYED_VERIFIED' as StageState,
    }));
    expect(
      deploymentGateVerdict({
        stages,
        invariants: evaluateInvariantSnapshot(okSnapshot),
        governanceHandoffProven: true,
        explorerVerifiedForAllStages: true,
      }),
    ).toBe('FLOWBRIDGE V30.1E BOT MAINNET DEPLOYMENT VERIFICATION PASS');
    expect(
      deploymentGateVerdict({
        stages,
        invariants: evaluateInvariantSnapshot(okSnapshot),
        governanceHandoffProven: false,
        explorerVerifiedForAllStages: true,
      }),
    ).toBe('FLOWBRIDGE V30.1E BOT MAINNET DEPLOYMENT VERIFICATION BLOCKED');
  });
});
