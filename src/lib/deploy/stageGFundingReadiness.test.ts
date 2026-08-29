import { describe, expect, it } from 'vitest';
import {
  V30_1G_BROADCAST_LEDGER,
  V30_1G_ECONOMIC_CEILINGS,
  V30_1G_FUNDING_PAYLOADS,
  V30_1G_POST_WIRING_SNAPSHOT,
  V30_1G_SOURCE_VERIFICATION,
  V30_1G_VERDICT,
  evaluateFundingPath,
  type FundingPayload,
} from './stageGFundingReadiness';

const payload = (id: FundingPayload['id']) =>
  V30_1G_FUNDING_PAYLOADS.find((p) => p.id === id)!;

describe('V30.1G post-wiring snapshot', () => {
  it('F.2b, F.3 and F.4 are settled', () => {
    const s = V30_1G_POST_WIRING_SNAPSHOT;
    expect(s.roles.rewardTreasuryControllerRoleHeldByController).toBe(true);
    expect(s.roles.rewardTreasuryVaultRoleHeldByVault).toBe(true);
    expect(s.roles.vaultPauserHeldByOperationsSafe).toBe(true);
    expect(s.roles.vaultPauserRetainedByGovernanceSafe).toBe(true);
    expect(s.roles.vaultDefaultAdminRetainedByGovernanceSafe).toBe(true);
    expect(s.wiring.maxFlowPerEpoch).toBe('50000000000000000000000');
    expect(s.wiring.weeklyUsdBudget8).toBe('0');
    expect(s.wiring.oracle).toBe('0x0000000000000000000000000000000000000000');
    expect(s.wiring.controllerVault).toBe(V30_1G_POST_WIRING_SNAPSHOT.wiring.controllerVault);
  });

  it('staking and rewards remain economically inert', () => {
    const e = V30_1G_POST_WIRING_SNAPSHOT.economicEmptiness;
    for (const key of [
      'rewardTreasuryFlowBalance',
      'rewardTreasuryFreeBalance',
      'rewardTreasuryTotalObligations',
      'rewardTreasuryReservedGenesis',
      'rewardTreasuryReservedFloors',
      'rewardTreasuryCommittedEpoch',
      'rewardTreasuryAccruedUnclaimed',
      'vaultFlowBalance',
      'vaultTotalPrincipal',
      'vaultNextPositionId',
      'distributorFlowBalance',
      'distributorTotalReserved',
      'distributorEpochCount',
    ] as const) {
      expect(e[key]).toBe('0');
    }
    expect(e.vaultPaused).toBe(false);
  });

  it('Router V4 registry stays the empty safety boundary and v3 stays live', () => {
    const r = V30_1G_POST_WIRING_SNAPSHOT.routerBoundary;
    expect(r.registryActivationDelay).toBe('0');
    expect(r.routerCount).toBe('0');
    expect(r.bridgeCount).toBe('0');
    expect(r.v3RemainsLiveProductionRouter).toBe(true);
    expect(r.v4TrafficMigrated).toBe(false);
  });
});

describe('V30.1G funding payloads', () => {
  it('both transfers are ERC-20 transfer-only from the Treasury Safe', () => {
    expect(V30_1G_FUNDING_PAYLOADS).toHaveLength(2);
    for (const p of V30_1G_FUNDING_PAYLOADS) {
      expect(p.selector).toBe('0xa9059cbb');
      expect(p.calldata.startsWith('0xa9059cbb')).toBe(true);
      expect(p.calldata).toHaveLength(2 + 8 + 128);
      expect(p.value).toBe('0');
      expect(p.operation).toBe('CALL');
      expect(p.requiredConfirmations).toBe(2);
      expect(p.simulatedFromSafe).toBe('OK');
      expect(p.revertsFromDeployerEoa).toBe(true);
    }
  });

  it('amounts and destinations match the approved plan', () => {
    expect(payload('REWARDS_1M').amountTokenUnits).toBe('1000000000000000000000000');
    expect(payload('STAKING_10M').amountTokenUnits).toBe('10000000000000000000000000');
    expect(payload('REWARDS_1M').destination).toBe('0x3824681c3560A63e1c9ceDABBfcAB2691c5673FB');
    expect(payload('STAKING_10M').destination).toBe('0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e');
  });

  it('the two transfers are separate, never batched', () => {
    expect(new Set(V30_1G_FUNDING_PAYLOADS.map((p) => p.calldataHash)).size).toBe(2);
  });
});

describe('V30.1G fail-closed funding gate', () => {
  it('rewards funding is blocked while FlowToken or the Distributor is source-pending', () => {
    const r = evaluateFundingPath(payload('REWARDS_1M'));
    expect(r.readiness).toBe('BLOCKED_BY_SOURCE');
    expect(r.executable).toBe(false);
    expect(r.missingVerification).toEqual(['FlowToken', 'FlowRewardsMerkleDistributor']);
  });

  it('staking funding is blocked while FlowToken or Vault V2 is source-pending', () => {
    const r = evaluateFundingPath(payload('STAKING_10M'));
    expect(r.readiness).toBe('BLOCKED_BY_SOURCE');
    expect(r.executable).toBe(false);
    expect(r.missingVerification).toEqual(['FlowToken', 'FlowStakingVaultV2']);
  });

  it('verification alone never auto-executes funding', () => {
    const verified = {
      ...V30_1G_SOURCE_VERIFICATION,
      FlowToken: 'PUBLICLY_VERIFIED' as const,
      FlowStakingVaultV2: 'PUBLICLY_VERIFIED' as const,
    };
    const gated = evaluateFundingPath(payload('STAKING_10M'), verified);
    expect(gated.readiness).toBe('FUNDING_READY');
    expect(gated.executable).toBe(false);
    expect(evaluateFundingPath(payload('STAKING_10M'), verified, true).executable).toBe(true);
  });

  it('Activity Registry source state never gates funding', () => {
    for (const p of V30_1G_FUNDING_PAYLOADS) {
      expect(p.requiredVerifiedContracts).not.toContain('FlowBridgeActivityRegistry');
    }
  });
});

describe('V30.1G invariants', () => {
  it('Year-1 ceilings and epoch ceiling stay frozen', () => {
    expect(V30_1G_ECONOMIC_CEILINGS).toMatchObject({
      year1AuthorizedReleaseFlow: '3000000',
      genesisYear1MaxFlow: '1000000',
      standardYear1MaxFlow: '2000000',
      maxFlowPerEpochFlow: '50000',
      weeklyUsdBudget8: '0',
      oracleConfigured: false,
    });
  });

  it('nothing was signed or broadcast in this gate', () => {
    expect(V30_1G_BROADCAST_LEDGER).toEqual({
      transactionsSigned: 0,
      transactionsBroadcast: 0,
      flowTransferred: '0',
      roleChanges: 0,
      configurationWrites: 0,
      registryEntriesAdded: 0,
    });
    expect(V30_1G_VERDICT).toContain('PREPARED, NOT FUNDED');
  });
});
