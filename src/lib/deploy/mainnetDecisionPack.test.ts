/**
 * FlowBridge V30.1D.1 §9 — decision-pack acceptance tests.
 */
import { describe, expect, it } from 'vitest';
import {
  CURRENT_DECISION_PACK_INPUT,
  EMPTY_ORACLE_FEASIBILITY,
  RECORDED_CHAIN_OBSERVATIONS,
  REQUIRED_TWAP_WINDOW_SECONDS,
  GOVERNANCE_AUTHORITIES,
  canonicalFlowProposal,
  evaluateAuthorities,
  evaluateDecisionPack,
  evaluateOracleFeasibility,
  verifyOfficialDependencies,
  type AuthorityAssignment,
  type OwnerApprovalRecord,
  type StagedReadinessInput,
} from './mainnetDecisionPack';

const OWNER = 'owner@flowbridge';
const AT = '2026-08-26T14:00:00.000Z';
const approve = (id: string): OwnerApprovalRecord => ({ id, approved: true, approvedBy: OWNER, approvedAt: AT });

const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';
const C = '0x3333333333333333333333333333333333333333';
const D = '0x4444444444444444444444444444444444444444';
const E = '0x5555555555555555555555555555555555555555';

const safe = (id: AuthorityAssignment['id'], address: string, extra: Partial<AuthorityAssignment> = {}): AuthorityAssignment => ({
  id,
  address,
  safeOwners: [A, B, C],
  threshold: 2,
  timelockDelaySeconds: 86_400,
  approvedBy: OWNER,
  ...extra,
});

function pack(over: Partial<StagedReadinessInput> = {}) {
  return evaluateDecisionPack({ ...CURRENT_DECISION_PACK_INPUT, ...over });
}

describe('V30.1D.1 canonical FLOW proposal', () => {
  it('pre-fills canonical economics but never self-approves them', () => {
    const p = canonicalFlowProposal();
    expect(p.supplyFlow).toBe(1_000_000_000);
    expect(p.decimals).toBe(18);
    expect(p.postDeploymentMintAuthority).toBe(false);
    expect(p.allocationSumFlow).toBe(1_000_000_000);
    expect(p.allocationSumPercent).toBe(100);
    expect(p.internallyConsistent).toBe(true);
    expect(p.approval).toBe('CANONICAL_PROPOSAL_NEEDS_OWNER_APPROVAL');
  });

  it('only becomes approved with an explicit approval record', () => {
    expect(canonicalFlowProposal([approve('FLOW_SUPPLY_AND_ALLOCATION')]).approval).toBe('OWNER_APPROVED');
    expect(
      canonicalFlowProposal([{ id: 'FLOW_SUPPLY_AND_ALLOCATION', approved: false, approvedBy: OWNER, approvedAt: AT }]).approval,
    ).toBe('OWNER_REJECTED');
  });
});

describe('V30.1D.1 official BOT dependencies', () => {
  it('stays DOCUMENTED_OFFICIAL without a chain 677 observation', () => {
    const deps = verifyOfficialDependencies([]);
    expect(deps.every((d) => d.state === 'DOCUMENTED_OFFICIAL')).toBe(true);
  });

  it('marks recorded 677 bytecode observations VERIFIED', () => {
    const deps = verifyOfficialDependencies(RECORDED_CHAIN_OBSERVATIONS);
    const byId = (id: string) => deps.find((d) => d.id === id)!;
    expect(byId('wrappedNative').state).toBe('VERIFIED');
    expect(byId('bdexSwapRouter').state).toBe('VERIFIED');
    expect(byId('directBridgeGateway').state).toBe('VERIFIED');
    expect(byId('botUsdt').state).toBe('VERIFIED');
    expect(byId('bridgeUsdtResourceId').state).toBe('DOCUMENTED_OFFICIAL');
  });

  it('rejects wrong chain, missing bytecode and wrong USDT decimals', () => {
    const deps = verifyOfficialDependencies([
      { id: 'wrappedNative', chainId: 968, codeBytes: 100, observedAt: AT },
      { id: 'bdexSwapRouter', chainId: 677, codeBytes: 0, observedAt: AT },
      { id: 'botUsdt', chainId: 677, codeBytes: 6188, decimals: 18, observedAt: AT },
      { id: 'bdexV3Factory', chainId: 1024, codeBytes: 500, observedAt: AT },
    ]);
    const byId = (id: string) => deps.find((d) => d.id === id)!;
    expect(byId('wrappedNative').state).toBe('REJECTED');
    expect(byId('bdexSwapRouter').state).toBe('REJECTED');
    expect(byId('botUsdt').state).toBe('REJECTED');
    expect(byId('bdexV3Factory').state).toBe('REJECTED');
  });
});

describe('V30.1D.1 governance consolidation', () => {
  it('requires owner-provided Safe owners, threshold and address', () => {
    const evals = evaluateAuthorities([]);
    expect(evals.every((e) => e.status === 'NEEDS_OWNER_INPUT')).toBe(true);
  });

  it('blocks admin == activity attester even when both are multisigs', () => {
    const evals = evaluateAuthorities([safe('GOVERNANCE_SAFE', A), safe('ACTIVITY_ATTESTER', A)]);
    expect(evals.find((e) => e.id === 'ACTIVITY_ATTESTER')!.status).toBe('BLOCKED');
  });

  it('blocks root publisher sharing the governance or treasury address', () => {
    const evals = evaluateAuthorities([safe('GOVERNANCE_SAFE', A), safe('ROOT_PUBLISHER', A)]);
    expect(evals.find((e) => e.id === 'ROOT_PUBLISHER')!.status).toBe('BLOCKED');
  });

  it('denies the root publisher any budget or recovery capability', () => {
    const pub = GOVERNANCE_AUTHORITIES.find((a) => a.id === 'ROOT_PUBLISHER')!;
    expect(pub.roles).not.toContain('Rewards admin');
    expect(pub.roles).not.toContain('Rewards campaignManager');
    expect(pub.capabilityLimits.join(' ')).toMatch(/cannot change campaign budgets/);
    expect(pub.capabilityLimits.join(' ')).toMatch(/cannot recover or withdraw funds/);
  });

  it('blocks a sub-minimum Safe threshold and duplicate signers', () => {
    const low = evaluateAuthorities([safe('GOVERNANCE_SAFE', A, { threshold: 1 })]);
    expect(low.find((e) => e.id === 'GOVERNANCE_SAFE')!.status).toBe('BLOCKED');
    const dup = evaluateAuthorities([safe('GOVERNANCE_SAFE', A, { safeOwners: [A, A, A] })]);
    expect(dup.find((e) => e.id === 'GOVERNANCE_SAFE')!.status).toBe('BLOCKED');
  });

  it('blocks treasury/governance membership concentration unless explicitly approved', () => {
    const shared = evaluateAuthorities([safe('GOVERNANCE_SAFE', A), safe('TREASURY_SAFE', B)]);
    expect(shared.find((e) => e.id === 'TREASURY_SAFE')!.status).toBe('BLOCKED');
    const ok = evaluateAuthorities([
      safe('GOVERNANCE_SAFE', A),
      safe('TREASURY_SAFE', B, { concentrationApproved: true }),
    ]);
    expect(ok.find((e) => e.id === 'TREASURY_SAFE')!.status).toBe('VERIFIED');
  });

  it('requires an approved timelock delay for the governance Safe', () => {
    const evals = evaluateAuthorities([safe('GOVERNANCE_SAFE', A, { timelockDelaySeconds: null })]);
    expect(evals.find((e) => e.id === 'GOVERNANCE_SAFE')!.status).toBe('NEEDS_OWNER_INPUT');
  });
});

describe('V30.1D.1 oracle sequencing', () => {
  it('never assumes an external feed and never blocks deployment', () => {
    const v = evaluateOracleFeasibility(EMPTY_ORACLE_FEASIBILITY);
    expect(v.externalFeedAvailable).toBe(false);
    expect(v.blocksDeployment).toBe(false);
    expect(v.status).toBe('PENDING_POOL');
    expect(v.dynamicStakingFeatureActive).toBe(false);
    expect(v.variableBonusBps).toBe(0);
    expect(v.genesisAndFloorOracleIndependent).toBe(true);
  });

  it('blocks dynamic staking without 7-day observation history', () => {
    const v = evaluateOracleFeasibility({
      poolAddress: D,
      poolFromOfficialFactory: true,
      feeTier: 3000,
      observeSupported: true,
      observationCardinality: 300,
      observedWindowSeconds: REQUIRED_TWAP_WINDOW_SECONDS - 1,
      poolLiquidityUsd: 500_000,
      minLiquidityUsd: 250_000,
      maxFreshnessSeconds: 900,
      maxDeviationBps: 500,
    });
    expect(v.dynamicStakingFeatureActive).toBe(false);
    expect(v.blockers.join(' ')).toMatch(/7-day observation window/);
  });

  it('blocks dynamic staking on insufficient pool liquidity', () => {
    const v = evaluateOracleFeasibility({
      poolAddress: D,
      poolFromOfficialFactory: true,
      feeTier: 3000,
      observeSupported: true,
      observationCardinality: 300,
      observedWindowSeconds: REQUIRED_TWAP_WINDOW_SECONDS,
      poolLiquidityUsd: 1_000,
      minLiquidityUsd: 250_000,
      maxFreshnessSeconds: 900,
      maxDeviationBps: 500,
    });
    expect(v.dynamicStakingFeatureActive).toBe(false);
    expect(v.blockers.join(' ')).toMatch(/liquidity/);
  });

  it('becomes READY only when provenance, TWAP support, window, liquidity and thresholds all pass', () => {
    const v = evaluateOracleFeasibility({
      poolAddress: D,
      poolFromOfficialFactory: true,
      feeTier: 3000,
      observeSupported: true,
      observationCardinality: 300,
      observedWindowSeconds: REQUIRED_TWAP_WINDOW_SECONDS,
      poolLiquidityUsd: 500_000,
      minLiquidityUsd: 250_000,
      maxFreshnessSeconds: 900,
      maxDeviationBps: 500,
    });
    expect(v.status).toBe('READY');
    expect(v.dynamicStakingFeatureActive).toBe(true);
  });
});

describe('V30.1D.1 staged readiness', () => {
  const fullApprovals = [
    'FLOW_SUPPLY_AND_ALLOCATION',
    'GOVERNANCE_SAFE',
    'TREASURY_SAFE',
    'TIMELOCK_POLICY',
    'OPERATIONAL_AUTHORITIES',
    'REWARDS_LAUNCH',
    'STAKING_LAUNCH',
    'LIQUIDITY_PLAN',
    'GAS_BUDGET',
    'LEGAL_SIGNOFF',
  ].map(approve);

  const authorities: AuthorityAssignment[] = [
    safe('GOVERNANCE_SAFE', A),
    safe('TREASURY_SAFE', B, { concentrationApproved: true }),
    safe('OPERATIONS_SAFE', C),
    safe('ROOT_PUBLISHER', D),
    safe('ACTIVITY_ATTESTER', E),
  ];

  it('blocks DEPLOYMENT_READY while Safe inputs are unapproved', () => {
    const r = pack();
    expect(r.contracts.every((c) => c.stage === 'SOURCE_READY')).toBe(true);
    expect(r.contracts[0]!.deploymentBlockers.join(' ')).toMatch(/NEEDS_OWNER_INPUT/);
  });

  it('reaches DEPLOYMENT_READY with approvals, authorities and verified dependencies — oracle absent', () => {
    const r = pack({ approvals: fullApprovals, authorities, gasBudgetApproved: true });
    for (const c of r.contracts) {
      expect(c.stage, `${c.contractId}: ${c.deploymentBlockers.join(', ')}`).toBe('DEPLOYMENT_READY');
    }
    expect(r.oracle.dynamicStakingFeatureActive).toBe(false);
  });

  it('missing oracle blocks only dynamic staking activation', () => {
    const r = pack({ approvals: fullApprovals, authorities, gasBudgetApproved: true });
    const dynamic = r.features.find((f) => f.feature === 'STAKING_DYNAMIC')!;
    expect(dynamic.active).toBe(false);
    expect(dynamic.blocksDeployment).toBe(false);
    expect(r.contracts.find((c) => c.contractId === 'FlowToken')!.stage).toBe('DEPLOYMENT_READY');
  });

  it('keeps rewards deployed-but-inactive without funding', () => {
    const r = pack({
      approvals: fullApprovals,
      authorities,
      gasBudgetApproved: true,
      deployedVerified: ['FlowRewardsMerkleDistributor'],
    });
    expect(r.contracts.find((c) => c.contractId === 'FlowRewardsMerkleDistributor')!.stage).toBe('DEPLOYED_VERIFIED');
    expect(r.features.find((f) => f.feature === 'REWARDS_CLAIMS')!.active).toBe(false);
  });

  it('activates genesis/floor staking only when reserves are funded', () => {
    const unfunded = pack({ approvals: fullApprovals, authorities, gasBudgetApproved: true, deployedVerified: ['FlowStakingVaultV2'] });
    expect(unfunded.features.find((f) => f.feature === 'STAKING_GENESIS_AND_FLOORS')!.active).toBe(false);
    const funded = pack({
      approvals: fullApprovals,
      authorities,
      gasBudgetApproved: true,
      deployedVerified: ['FlowStakingVaultV2'],
      fundedVerified: ['FlowStakingVaultV2'],
    });
    expect(funded.features.find((f) => f.feature === 'STAKING_GENESIS_AND_FLOORS')!.active).toBe(true);
    expect(funded.features.find((f) => f.feature === 'STAKING_DYNAMIC')!.active).toBe(false);
  });

  it('surfaces the owner decision sheet with no hidden defaults and records zero public writes', () => {
    const r = pack();
    expect(r.ownerDecisionSheet).toHaveLength(10);
    expect(r.ownerDecisionSheet.every((i) => i.hiddenDefault === false)).toBe(true);
    expect(r.ownerDecisionSheet.every((i) => i.state === 'CANONICAL_PROPOSAL_NEEDS_OWNER_APPROVAL')).toBe(true);
    expect(r.missingOwnerInputs).toHaveLength(10);
    expect(Object.values(r.publicWrites).every((v) => v === 0)).toBe(true);
    expect(r.chainId).toBe(677);
  });

  it('is READY once every derivable value is populated, blocked when a dependency is rejected', () => {
    expect(pack().verdict).toBe('READY');
    const bad = pack({
      dependencyObservations: [
        { id: 'bdexSwapRouter', chainId: 968, codeBytes: 10, observedAt: AT },
        ...RECORDED_CHAIN_OBSERVATIONS,
      ],
    });
    expect(bad.verdict).toBe('BLOCKED');
  });
});
