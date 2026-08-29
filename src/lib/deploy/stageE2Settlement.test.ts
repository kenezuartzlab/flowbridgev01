import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  STAGE_E2_ARTIFACT,
  STAGE_E2_POST_SETTLEMENT,
  STAGE_E2_PRESIGN_REVALIDATION,
  STAGE_E2_PROHIBITED_ACTIONS_TAKEN,
  STAGE_E2_RUNTIME_PARITY,
  STAGE_E2_SOURCE_VERIFICATION,
  STAGE_E2_STAGE_LOCKS,
  STAGE_E2_TRANSACTION,
  STAGE_E2_VERDICT,
} from './stageE2Settlement';

describe('V30.1E.15 Stage E.2 Controller settlement', () => {
  it('broadcast exactly one authorized transaction at the approved nonce and address', () => {
    expect(STAGE_E2_TRANSACTION.broadcastCount).toBe(1);
    expect(STAGE_E2_TRANSACTION.status).toBe(1);
    expect(STAGE_E2_TRANSACTION.nonce).toBe(STAGE_E2_PRESIGN_REVALIDATION.nonce);
    expect(STAGE_E2_TRANSACTION.valueBOT).toBe(0);
    expect(STAGE_E2_TRANSACTION.contractAddress).toBe(STAGE_E2_PRESIGN_REVALIDATION.predictedAddress);
    expect(STAGE_E2_TRANSACTION.gasUsed).toBeLessThanOrEqual(STAGE_E2_TRANSACTION.gasLimit);
  });

  it('used the preserved compiler input that still reproduces the frozen artifact', () => {
    expect(STAGE_E2_ARTIFACT.doubleBuildReproducible).toBe(true);
    expect(STAGE_E2_ARTIFACT.manifestParity).toBe('EXACT_MATCH');
    const sha = createHash('sha256').update(readFileSync(STAGE_E2_ARTIFACT.standardJsonInputPath)).digest('hex');
    expect(sha).toBe(STAGE_E2_ARTIFACT.standardJsonInputSha256);
  });

  it('runtime differs only in the year1Start immutable', () => {
    expect(STAGE_E2_RUNTIME_PARITY.onchainRuntimeBytes).toBe(STAGE_E2_RUNTIME_PARITY.compiledRuntimeBytes);
    expect(STAGE_E2_RUNTIME_PARITY.differingRanges).toHaveLength(1);
    expect(STAGE_E2_RUNTIME_PARITY.differingRanges[0]!.decodedUint).toBe(STAGE_E2_TRANSACTION.blockTimestamp);
    expect(STAGE_E2_RUNTIME_PARITY.classification).toBe('EXACT_IMMUTABLE_AWARE_MATCH');
  });

  it('authority sits with the Governance Safe and no publisher exists', () => {
    const a = STAGE_E2_POST_SETTLEMENT.authority;
    expect(a.governanceIsDefaultAdmin && a.governanceIsGovernor).toBe(true);
    expect(a.deployerIsDefaultAdmin || a.deployerIsGovernor || a.deployerIsPublisher).toBe(false);
    expect(a.publisherRoleHolders).toBe(0);
    expect(a.governanceHasPublisherRole).toBe(false);
  });

  it('keeps Year-1 ceilings exact and the 50k weekly ceiling unactivated', () => {
    expect(STAGE_E2_POST_SETTLEMENT.year1Caps).toEqual({ genesisFlow: 1_000_000, standardFlow: 2_000_000, totalFlow: 3_000_000 });
    expect(STAGE_E2_POST_SETTLEMENT.budget.maxFlowPerEpoch).toBe('0');
    expect(STAGE_E2_POST_SETTLEMENT.budget.weeklyCeiling50kActivated).toBe(false);
  });

  it('is fail-closed: no oracle, no epoch, no vault, no reachable staking', () => {
    expect(STAGE_E2_POST_SETTLEMENT.oracle.configured).toBe(false);
    expect(STAGE_E2_POST_SETTLEMENT.oracle.dynamicBonusState).toBe('FAIL_CLOSED_UNAVAILABLE');
    expect(STAGE_E2_POST_SETTLEMENT.oracle.quoteEpochBudget).toBe('REVERTS_OracleNotConfigured');
    expect(STAGE_E2_POST_SETTLEMENT.epochState.epochsPublished).toBe(0);
    expect(STAGE_E2_POST_SETTLEMENT.epochState.rewardsReleased).toBe(0);
    expect(STAGE_E2_POST_SETTLEMENT.vault.configured).toBe(false);
    expect(STAGE_E2_POST_SETTLEMENT.products.publiclyStakeableNow).toBe(false);
    expect(STAGE_E2_POST_SETTLEMENT.custody).toEqual({ canMintFlow: false, holdsFlow: false, canMovePrincipal: false });
  });

  it('carries all five products with the frozen economics, unchanged in E.2', () => {
    const m = STAGE_E2_POST_SETTLEMENT.products.matrix;
    expect(m).toHaveLength(5);
    expect(STAGE_E2_POST_SETTLEMENT.products.reconfiguredInStageE2).toBe(0);
    for (const p of m) {
      expect(p.targetBps).toBeLessThanOrEqual(p.hardCapBps);
      if (p.lockSeconds === 0) expect(p.floorBps).toBe(0);
      else expect(p.floorBps).toBeGreaterThan(0);
    }
  });

  it('is publicly source verified and took no prohibited action', () => {
    expect(STAGE_E2_SOURCE_VERIFICATION.isVerified).toBe(true);
    expect(STAGE_E2_SOURCE_VERIFICATION.contractName).toBe('FlowStakingController');
    expect(Object.values(STAGE_E2_PROHIBITED_ACTIONS_TAKEN)).toEqual([0, 0, false, 0, 0, 0, 0, 0, 0, 0]);
    expect(STAGE_E2_STAGE_LOCKS.stageE3VaultAuthorized).toBe(false);
    expect(STAGE_E2_VERDICT).toBe('STAGE_E2_SETTLED_ONCHAIN_AND_SOURCE_VERIFIED');
  });
});
