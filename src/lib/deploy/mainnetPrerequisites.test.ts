/**
 * V30.1D acceptance tests — mainnet economic + governance prerequisite closure.
 * Everything is pure evaluation: no deployment, signature or transaction.
 */
import { describe, it, expect } from 'vitest';
import {
  UNAPPROVED_PREREQUISITE_INPUTS,
  REQUIRED_GOVERNANCE_ROLES,
  REQUIRED_DEPENDENCY_IDS,
  evaluateMainnetPrerequisites,
  evaluateTokenFreeze,
  evaluateStakingFunding,
  evaluateOracleGate,
  evaluateDependencyFreeze,
  evaluateRewardsFunding,
  evaluateGovernanceMatrix,
  simulateDeploymentOrder,
  estimatedDeploymentGasUnits,
  assertMainnetTarget,
  type MainnetPrerequisiteInputs,
} from './mainnetPrerequisites';
import { STAKING_V2_CONSTANTS } from '@/lib/staking/stakingV2Matrix';

const TESTNET_FLOW = '0xCE14Ca1CF2012F1996D5FBc7d369FA051aa641Ac';
const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;

/** Synthetic, illustrative approved fixture — used only to prove the gate can pass. */
function approvedFixture(): MainnetPrerequisiteInputs {
  return {
    token: {
      name: 'Flow',
      symbol: 'FLOW',
      decimals: 18,
      totalSupplyFlow: 100_000_000,
      treasuryRecipient: addr(0x71),
      treasuryIsReviewedMultisig: true,
      allocationPlanRef: 'docs/treasury/allocation-v1',
    },
    governance: REQUIRED_GOVERNANCE_ROLES.map((r, i) => ({
      system: r.system,
      role: r.role,
      address: addr(0x100 + i),
      reviewedMultisig: true,
      responsibleOwner: 'FlowBridge Governance Council',
      timelockDelaySeconds: 172_800,
    })),
    rewards: {
      initialFundingFlow: 500_000,
      approvedTreasuryAllocationFlow: 1_000_000,
      enabledCampaignBudgetsFlow: 250_000,
      rootDelaySeconds: 86_400,
      replenishmentPolicyRef: 'docs/rewards/replenishment-v1',
    },
    staking: {
      launchFundingFlow: 900_000,
      genesisFundingFlow: 300_000,
      standardFundingFlow: 600_000,
      maxFlowPerEpoch: 25_000,
      enabledProductKeys: ['flexible', 'lock30', 'lock90'],
    },
    oracle: {
      mechanism: 'BDEX FLOW/USDT 7-day TWAP',
      feedAddress: addr(0x900),
      chainId: 677,
      bytecodeVerified: true,
      observationWindowSeconds: 7 * 86_400,
      updateCadenceSeconds: 3_600,
      minLiquidityUsd: 250_000,
      maxFreshnessSeconds: 7_200,
      maxDeviationBps: 1_000,
      failClosedProven: true,
    },
    dependencies: REQUIRED_DEPENDENCY_IDS.map((id, i) => ({
      id,
      label: id,
      address: addr(0x200 + i),
      url: `https://${id}.example`,
      chainId: 677,
      bytecodeVerified: true,
    })),
    approvedGasBudgetWei: 5n * 10n ** 17n,
    directBridgeGatewayVerified: true,
  };
}

describe('V30.1D — current production reality', () => {
  const result = evaluateMainnetPrerequisites(UNAPPROVED_PREREQUISITE_INPUTS);

  it('is BLOCKED with nothing approved', () => {
    expect(result.verdict).toBe('BLOCKED');
    expect(result.blockers.length).toBeGreaterThan(10);
  });

  it('never marks any contract READY_FOR_DEPLOYMENT', () => {
    expect(result.contractReadiness.every((c) => !c.readyForDeployment)).toBe(true);
  });

  it('reports zero public-chain writes', () => {
    expect(result.publicWrites).toEqual({
      mainnetDeployments: 0,
      testnetDeployments: 0,
      signatures: 0,
      transactions: 0,
      flowTransfers: 0,
      rewardsClaims: 0,
      stakingActions: 0,
    });
  });

  it('targets only BOT Mainnet 677', () => {
    expect(result.chainId).toBe(677);
    expect(() => assertMainnetTarget(968)).toThrow();
    expect(() => assertMainnetTarget(1024)).toThrow();
    expect(() => assertMainnetTarget(677)).not.toThrow();
  });
});

describe('V30.1D — approved fixture closes the gate', () => {
  const result = evaluateMainnetPrerequisites(approvedFixture());

  it('passes every prerequisite', () => {
    expect(result.blockers).toEqual([]);
    expect(result.verdict).toBe('PASS');
  });

  it('simulates the token deployment and role-transfer sequence deterministically', () => {
    const plan = simulateDeploymentOrder(approvedFixture());
    expect(plan[0]?.resolved).toBe(true);
    const token = plan.find((s) => s.contractId === 'FlowToken');
    expect(token?.resolved).toBe(true);
    expect(token?.constructorArgs['treasury']).toBe(addr(0x71));
    // Dependent steps stay honestly unresolved until earlier addresses exist.
    const vault = plan.find((s) => s.contractId === 'FlowStakingVaultV2');
    expect(vault?.resolved).toBe(false);
    expect(plan.map((s) => s.order)).toEqual(plan.map((_, i) => i + 1));
  });

  it('estimates a buffered gas budget', () => {
    expect(estimatedDeploymentGasUnits()).toBeGreaterThan(16_000_000);
  });
});

describe('V30.1D — acceptance blockers', () => {
  it('blocks an unapproved / testnet treasury for FlowToken', () => {
    const dev = evaluateTokenFreeze({
      ...approvedFixture().token,
      treasuryIsReviewedMultisig: false,
    });
    expect(dev.find((c) => c.id === 'TOKEN_TREASURY_APPROVED')?.status).toBe('NEEDS_APPROVAL');

    const reused = evaluateTokenFreeze({
      ...approvedFixture().token,
      treasuryRecipient: TESTNET_FLOW,
    });
    expect(reused.find((c) => c.id === 'TOKEN_TREASURY_APPROVED')?.status).toBe('BLOCKED');
  });

  it('blocks an unapproved Router owner', () => {
    const gov = approvedFixture().governance.filter(
      (g) => !(g.system === 'Router V4' && g.role === 'owner'),
    );
    const checks = evaluateGovernanceMatrix(gov);
    expect(checks.find((c) => c.id === 'ROLE_ROUTER_V4_OWNER')?.status).toBe('NEEDS_APPROVAL');
  });

  it('blocks Activity Registry when admin == attester', () => {
    const gov = approvedFixture().governance.map((g) =>
      g.system === 'Activity Registry' && g.role === 'attester' ? { ...g, address: addr(0x108) } : g,
    );
    const same = gov.map((g) =>
      g.system === 'Activity Registry' && (g.role === 'admin' || g.role === 'attester')
        ? { ...g, address: addr(0x108) }
        : g,
    );
    expect(
      evaluateGovernanceMatrix(same).find((c) => c.id === 'REGISTRY_ADMIN_NOT_ATTESTER')?.status,
    ).toBe('BLOCKED');
  });

  it('blocks staking funding above the Year-1 ceilings', () => {
    const over = evaluateStakingFunding({
      ...approvedFixture().staking,
      launchFundingFlow: STAKING_V2_CONSTANTS.TOTAL_YEAR1_CAP_FLOW + 1,
      genesisFundingFlow: STAKING_V2_CONSTANTS.GENESIS_YEAR1_CAP_FLOW + 1,
      standardFundingFlow: STAKING_V2_CONSTANTS.STANDARD_YEAR1_CAP_FLOW,
    });
    expect(over.find((c) => c.id === 'STAKING_LAUNCH_FUNDING_FROZEN')?.status).toBe('BLOCKED');
  });

  it('blocks a product enabled without funded reserve capacity', () => {
    const thin = evaluateStakingFunding({
      ...approvedFixture().staking,
      genesisFundingFlow: 0,
      standardFundingFlow: 0,
    });
    expect(thin.find((c) => c.id === 'STAKING_PRODUCT_CAPACITY_BACKED')?.status).toBe('BLOCKED');
  });

  it('blocks a rewards budget above funded allocation', () => {
    const over = evaluateRewardsFunding({
      ...approvedFixture().rewards,
      enabledCampaignBudgetsFlow: 900_000,
    });
    expect(over.find((c) => c.id === 'REWARDS_BUDGET_WITHIN_FUNDING')?.status).toBe('BLOCKED');
  });

  it('blocks a missing or weak oracle', () => {
    expect(
      evaluateOracleGate(UNAPPROVED_PREREQUISITE_INPUTS.oracle).every((c) => c.status === 'BLOCKED'),
    ).toBe(true);

    const weak = evaluateOracleGate({
      ...approvedFixture().oracle,
      observationWindowSeconds: 600,
      failClosedProven: false,
    });
    expect(weak.find((c) => c.id === 'ORACLE_WINDOW_APPROVED')?.status).toBe('BLOCKED');
    expect(weak.find((c) => c.id === 'ORACLE_FAILS_CLOSED')?.status).toBe('BLOCKED');
  });

  it('blocks testnet contamination and legacy 1024 in the dependency manifest', () => {
    const deps = approvedFixture().dependencies.map((d) =>
      d.id === 'bdexSwapRouter' ? { ...d, address: TESTNET_FLOW } : d,
    );
    expect(
      evaluateDependencyFreeze(deps, true).find((c) => c.id === 'DEP_BDEXSWAPROUTER')?.status,
    ).toBe('BLOCKED');

    const legacy = approvedFixture().dependencies.map((d) =>
      d.id === 'wrappedNative' ? { ...d, chainId: 1024 } : d,
    );
    expect(
      evaluateDependencyFreeze(legacy, true).find((c) => c.id === 'DEP_WRAPPEDNATIVE')?.status,
    ).toBe('BLOCKED');
  });

  it('blocks bridge release status without direct gateway verification', () => {
    expect(
      evaluateDependencyFreeze(approvedFixture().dependencies, false).find(
        (c) => c.id === 'DIRECT_BRIDGE_GATEWAY_VERIFIED',
      )?.status,
    ).toBe('BLOCKED');
  });

  it('blocks readiness when the gas budget is unapproved', () => {
    const result = evaluateMainnetPrerequisites({
      ...approvedFixture(),
      approvedGasBudgetWei: null,
    });
    expect(result.verdict).toBe('BLOCKED');
    expect(result.contractReadiness.every((c) => !c.readyForDeployment)).toBe(true);
  });
});
