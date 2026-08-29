import { describe, it, expect } from 'vitest';
import {
  V30_1F_CURRENT_STATE,
  V30_1F_CEILING_DERIVATION,
  V30_1F_PAUSE_AUTHORITY_PLAN,
  V30_1F_PREPARED_TXS,
  V30_1F_PROHIBITED_ACTIONS_TAKEN,
  V30_1F_ROUTER_DELAY_STATUS,
  V30_1F_SOURCE_VERIFICATION_STATUS,
  V30_1F_VERDICT,
} from './stageF1WiringPreflight';

const GOV = '0x88A4CC1F5771523baeB83DaEea07D323a3ce9507';

describe('V30.1F wiring preflight', () => {
  it('records a pre-wiring state that is economically inert', () => {
    expect(V30_1F_CURRENT_STATE.controller.vaultIsUnset).toBe(true);
    expect(V30_1F_CURRENT_STATE.controller.maxFlowPerEpoch).toBe('0');
    expect(V30_1F_CURRENT_STATE.controller.oracleUnset).toBe(true);
    expect(V30_1F_CURRENT_STATE.rewardTreasury.flowBalance).toBe('0');
    expect(V30_1F_CURRENT_STATE.vault.totalPrincipal).toBe('0');
    expect(V30_1F_CURRENT_STATE.vault.nextPositionId).toBe('0');
    expect(V30_1F_CURRENT_STATE.rewardsDistributor.epochCount).toBe('0');
    expect(V30_1F_CURRENT_STATE.routerV4.routerCount).toBe(0);
    expect(V30_1F_CURRENT_STATE.routerV4.promoted).toBe(false);
  });

  it('prepares every governance call from the Governance Safe only', () => {
    for (const tx of V30_1F_PREPARED_TXS) {
      expect(tx.from).toBe(GOV);
      expect(tx.deployerCanCall).toBe(false);
      expect(tx.simulation).toBe('OK');
      expect(tx.calldata.startsWith(tx.selector)).toBe(true);
      expect(tx.calldataHash).toMatch(/^0x[0-9a-f]{64}$/);
    }
  });

  it('approves exactly the five staking wiring steps', () => {
    const approved = V30_1F_PREPARED_TXS.filter((t) => t.approved);
    expect(approved).toHaveLength(5);
    expect(V30_1F_PREPARED_TXS.filter((t) => !t.approved).map((t) => t.selector)).toEqual([
      '0x7e64facf',
    ]);
  });

  it('encodes the 50,000 FLOW ceiling without creating spendable rewards', () => {
    expect(V30_1F_CEILING_DERIVATION.encodedValue).toBe('50000000000000000000000');
    expect(V30_1F_CEILING_DERIVATION.weeklyUsdBudget8StaysZero).toBe(true);
    expect(V30_1F_CEILING_DERIVATION.oracleStaysUnset).toBe(true);
    expect(V30_1F_CEILING_DERIVATION.createsSpendableRewards).toBe(false);
  });

  it('does not revoke Governance pause authority without an explicit policy', () => {
    expect(V30_1F_PAUSE_AUTHORITY_PLAN.grantOperationsPauser).toBe(true);
    expect(V30_1F_PAUSE_AUTHORITY_PLAN.revokeGovernancePauser).toBe(false);
    expect(V30_1F_PAUSE_AUTHORITY_PLAN.governanceRetainsDefaultAdmin).toBe(true);
  });

  it('never infers the Router registry delay from the general timelock', () => {
    expect(V30_1F_ROUTER_DELAY_STATUS.status).toBe('ROUTER_DELAY_DECISION_REQUIRED');
    expect(V30_1F_ROUTER_DELAY_STATUS.exactApprovedRouterRegistryDelaySeconds).toBeNull();
    expect(V30_1F_ROUTER_DELAY_STATUS.inferenceAllowed).toBe(false);
  });

  it('keeps source-pending contracts unchanged', () => {
    expect(V30_1F_SOURCE_VERIFICATION_STATUS.redeployed).toBe(false);
    expect(V30_1F_SOURCE_VERIFICATION_STATUS.sourceOrCompilerModified).toBe(false);
    expect(V30_1F_SOURCE_VERIFICATION_STATUS.bundlesPreservedUnchanged).toBe(true);
  });

  it('broadcasts nothing and moves no value', () => {
    expect(V30_1F_PROHIBITED_ACTIONS_TAKEN).toEqual({
      transactionsBroadcast: 0,
      safeTransactionsSigned: 0,
      flowFundedWei: '0',
      stakesCreated: 0,
      rootsOrEpochsPublished: 0,
      oracleConfigurations: 0,
      routerOrBridgeRegistrations: 0,
      routerV4TrafficMigrations: 0,
      activityAttestations: 0,
      liquidityActions: 0,
    });
    expect(V30_1F_VERDICT).toContain('PREFLIGHT PASS - APPROVED, NOT BROADCAST');
  });
});
