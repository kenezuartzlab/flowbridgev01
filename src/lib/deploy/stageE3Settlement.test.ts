import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  STAGE_E3_ARTIFACT,
  STAGE_E3_POST_SETTLEMENT,
  STAGE_E3_PRESIGN_REVALIDATION,
  STAGE_E3_PROHIBITED_ACTIONS_TAKEN,
  STAGE_E3_RUNTIME_PARITY,
  STAGE_E3_SOURCE_VERIFICATION,
  STAGE_E3_STAGE_LOCKS,
  STAGE_E3_TRANSACTION,
  STAGE_E3_VERDICT,
} from './stageE3Settlement';

describe('V30.1E.16 Stage E.3 Vault V2 settlement', () => {
  it('broadcast exactly one authorized transaction at the approved nonce and address', () => {
    expect(STAGE_E3_TRANSACTION.broadcastCount).toBe(1);
    expect(STAGE_E3_TRANSACTION.status).toBe(1);
    expect(STAGE_E3_TRANSACTION.nonce).toBe(7);
    expect(STAGE_E3_TRANSACTION.valueBOT).toBe(0);
    expect(STAGE_E3_TRANSACTION.contractAddress).toBe(STAGE_E3_PRESIGN_REVALIDATION.predictedAddress);
    expect(STAGE_E3_TRANSACTION.gasUsed).toBeLessThanOrEqual(STAGE_E3_TRANSACTION.gasLimit);
  });

  it('used the preserved compiler input that still reproduces the frozen artifact', () => {
    expect(STAGE_E3_ARTIFACT.doubleBuildReproducible).toBe(true);
    expect(STAGE_E3_ARTIFACT.manifestParity).toBe('EXACT_MATCH');
    const sha = createHash('sha256').update(readFileSync(STAGE_E3_ARTIFACT.standardJsonInputPath)).digest('hex');
    expect(sha).toBe(STAGE_E3_ARTIFACT.standardJsonInputSha256);
  });

  it('matches the authorized artifact and payload hashes', () => {
    expect(STAGE_E3_PRESIGN_REVALIDATION.creationSha256Matches).toBe(true);
    expect(STAGE_E3_ARTIFACT.creationSha256.startsWith('159b8849')).toBe(true);
    expect(STAGE_E3_ARTIFACT.runtimeSha256.startsWith('af5ed43f')).toBe(true);
    expect(STAGE_E3_PRESIGN_REVALIDATION.unsignedDataKeccak).toBe(
      '0x654e7597031841556f69bdfdaa6522d708a0a1d78b31de05e31ff6ae9c613440',
    );
    expect(STAGE_E3_PRESIGN_REVALIDATION.gasEstimate).toBe(2390840);
    expect(STAGE_E3_PRESIGN_REVALIDATION.predictedAddressCodeless).toBe(true);
  });

  it('runtime differs only in immutable dependency address slots', () => {
    expect(STAGE_E3_RUNTIME_PARITY.onchainRuntimeBytes).toBe(STAGE_E3_RUNTIME_PARITY.compiledRuntimeBytes);
    expect(STAGE_E3_RUNTIME_PARITY.differingRangeWidthBytes).toBe(20);
    expect(STAGE_E3_RUNTIME_PARITY.differingRangeValues).toHaveLength(3);
    expect(STAGE_E3_RUNTIME_PARITY.classification).toBe('EXACT_IMMUTABLE_AWARE_MATCH');
  });

  it('binds exactly the deployed FLOW, Controller and Reward Treasury', () => {
    const b = STAGE_E3_POST_SETTLEMENT.bindings;
    expect(b.allMatchDeployedContracts).toBe(true);
    expect(b.token.toLowerCase()).toBe('0x535ddda826142ac42ce288154e9595f080940ae9');
    expect(b.controller).toBe('0x5095ecc7226AD6dEceE99846Bc83363cA41b52bf');
    expect(b.treasury).toBe('0xA861152Ca3676bcCf7B5FDAFB9eb6A57b9d32d0e');
  });

  it('gives the Governance Safe the initial authorities and the deployer none', () => {
    const a = STAGE_E3_POST_SETTLEMENT.authority;
    expect(a.governanceIsDefaultAdmin).toBe(true);
    expect(a.governanceIsPauser).toBe(true);
    expect(a.deployerIsDefaultAdmin).toBe(false);
    expect(a.deployerIsPauser).toBe(false);
    expect(a.deployerHasEpochRole).toBe(false);
    expect(a.epochRoleHolders).toBe(0);
  });

  it('is economically empty and cannot become active without the later gate', () => {
    const g = STAGE_E3_POST_SETTLEMENT.genesisState;
    expect(g.totalPrincipal).toBe('0');
    expect(g.totalPositions).toBe(0);
    expect(g.flowBalanceWei).toBe('0');
    expect(g.currentEpochCommitted).toBe('0');
    expect(g.currentEpochMoved).toBe('0');
    expect(g.totalStakedByProduct.every((v) => v === '0')).toBe(true);
    expect(g.varPerTokenStored.every((v) => v === '0')).toBe(true);
    const r = STAGE_E3_POST_SETTLEMENT.reachability;
    expect(r.controllerVaultIsUnset).toBe(true);
    expect(r.controllerMaxFlowPerEpoch).toBe('0');
    expect(r.vaultHasTreasuryRoles).toBe(false);
    expect(r.rewardInventoryFundedFlow).toBe(0);
    expect(r.economicallyActivePositionsPossibleNow).toBe(false);
  });

  it('preserves the frozen product and principal rules', () => {
    const p = STAGE_E3_POST_SETTLEMENT.productRules;
    expect(p.productCount).toBe(5);
    expect(p.lockedProductsFixedMaturity).toBe(true);
    expect(p.lockedMaturitySeconds).toEqual([2_592_000, 7_776_000, 15_552_000, 31_536_000]);
    expect(p.flexibleProductHasNoFixedLock).toBe(true);
    expect(p.matureWithdrawalPresent).toBe(true);
    expect(p.matureWithdrawalWorksWhilePaused).toBe(true);
    expect(p.normalEarlyWithdrawalForFixedLocks).toBe(false);
    const c = STAGE_E3_POST_SETTLEMENT.custody;
    expect(c.canMintFlow).toBe(false);
    expect(c.hasSlashingPath).toBe(false);
    expect(c.hasPrincipalConfiscationPath).toBe(false);
    expect(c.hasSweepOrRescuePath).toBe(false);
    expect(c.withdrawReturnsExactPrincipal).toBe(true);
  });

  it('keeps the frozen product-flag semantics and takes no prohibited action', () => {
    expect(STAGE_E3_POST_SETTLEMENT.productFlagSemantics.activeMeansPublicStakingAvailable).toBe(false);
    expect(STAGE_E3_POST_SETTLEMENT.productFlagSemantics.publicStakingAvailableNow).toBe(false);
    expect(Object.values(STAGE_E3_PROHIBITED_ACTIONS_TAKEN)).toEqual([0, 0, 0, 0, 0, '0', 0, false, 0, 0]);
    expect(STAGE_E3_STAGE_LOCKS.activationConfigurationStageAuthorized).toBe(false);
    expect(STAGE_E3_STAGE_LOCKS.routerV4PromotionAuthorized).toBe(false);
  });

  it('records source verification honestly as transport blocked', () => {
    expect(STAGE_E3_SOURCE_VERIFICATION.isVerified).toBe(false);
    expect(STAGE_E3_SOURCE_VERIFICATION.status).toBe('EXPLORER_TRANSPORT_BLOCKED');
    expect(STAGE_E3_SOURCE_VERIFICATION.exactPackagePreserved).toBe(true);
    expect(STAGE_E3_VERDICT).toBe('STAGE_E3_SETTLED_ONCHAIN_VERIFIED_SOURCE_PENDING');
  });
});
