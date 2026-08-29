import { describe, expect, it } from 'vitest';
import { STAGE_B_SETTLEMENT, stageBReleaseComplete, stageBSettlementValid } from './stageBSettlement';
import { STAGE_A_SETTLEMENT } from './stageASettlement';
import { APPROVED_AUTHORITIES } from './mainnetDeploymentGate';

describe('V30.1E.7 Stage B settlement', () => {
  it('is a valid settlement', () => {
    expect(stageBSettlementValid()).toBe(true);
  });

  it('records the broadcast receipt facts', () => {
    expect(STAGE_B_SETTLEMENT.txHash).toBe(
      '0x289727efd8830a6b767a2be05cdd1dec6f70900ac98877f336c5242b775ad4da',
    );
    expect(STAGE_B_SETTLEMENT.blockNumber).toBe(21_317_987);
    expect(STAGE_B_SETTLEMENT.contractAddress).toBe('0x3824681c3560A63e1c9ceDABBfcAB2691c5673FB');
    expect(STAGE_B_SETTLEMENT.receiptStatus).toBe('success');
    expect(STAGE_B_SETTLEMENT.gasUsed).toBe(1_509_124n);
    expect(STAGE_B_SETTLEMENT.effectiveGasPriceWei).toBe(20_000_000_000n);
  });

  it('binds the deployed FlowToken and the approved authorities', () => {
    const lc = (v: string) => v.toLowerCase();
    expect(lc(STAGE_B_SETTLEMENT.token)).toBe(lc(STAGE_A_SETTLEMENT.contractAddress));
    expect(lc(STAGE_B_SETTLEMENT.admin)).toBe(APPROVED_AUTHORITIES.governanceSafe);
    expect(lc(STAGE_B_SETTLEMENT.budgetManager)).toBe(APPROVED_AUTHORITIES.governanceSafe);
    expect(lc(STAGE_B_SETTLEMENT.publisher)).toBe(APPROVED_AUTHORITIES.rootPublisher);
    expect(lc(STAGE_B_SETTLEMENT.pauser)).toBe(APPROVED_AUTHORITIES.operationsSafe);
    expect(lc(STAGE_B_SETTLEMENT.recoveryRecipient)).toBe(APPROVED_AUTHORITIES.treasurySafe);
  });

  it('deployed empty, unfunded and with no published epoch', () => {
    expect(STAGE_B_SETTLEMENT.campaignBudgetWei).toBe(0n);
    expect(STAGE_B_SETTLEMENT.totalReservedWei).toBe(0n);
    expect(STAGE_B_SETTLEMENT.totalClaimedWei).toBe(0n);
    expect(STAGE_B_SETTLEMENT.epochCount).toBe(0);
    expect(STAGE_B_SETTLEMENT.distributorFlowBalanceWei).toBe(0n);
    expect(STAGE_B_SETTLEMENT.funding).toBe('NOT_FUNDED');
  });

  it('holds no deployer privileges', () => {
    expect(STAGE_B_SETTLEMENT.adminIsDeployer).toBe(false);
    expect(STAGE_B_SETTLEMENT.publisherIsDeployer).toBe(false);
  });

  it('stays source-pending, so release is not complete and Stage C has not started', () => {
    expect(STAGE_B_SETTLEMENT.sourceVerification).toBe('EXPLORER_TRANSPORT_BLOCKED');
    expect(STAGE_B_SETTLEMENT.releaseStatus).toBe('DEPLOYED_ONCHAIN_VERIFIED_SOURCE_PENDING');
    expect(stageBReleaseComplete()).toBe(false);
    expect(STAGE_B_SETTLEMENT.stageC).toBe('NOT_STARTED');
  });
});
