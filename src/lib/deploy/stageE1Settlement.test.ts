import { describe, expect, it } from 'vitest';
import {
  STAGE_E1_ABI_ENCODED_ARGS,
  STAGE_E1_ARTIFACT,
  STAGE_E1_BUILD_MATRIX,
  STAGE_E1_CONSTRUCTOR_ARGS,
  STAGE_E1_POST_SETTLEMENT,
  STAGE_E1_PRESIGN_REVALIDATION,
  STAGE_E1_PROHIBITED_ACTIONS_NOT_TAKEN,
  STAGE_E1_RUNTIME_PARITY,
  STAGE_E1_SOURCE_VERIFICATION,
  STAGE_E1_TRANSACTION,
  STAGE_E1_VERDICT,
  STAGE_E_NEXT_STAGE_LOCK,
} from './stageE1Settlement';

describe('Stage E.1 reward treasury settlement', () => {
  it('binds exactly the authorized transaction envelope', () => {
    expect(STAGE_E1_PRESIGN_REVALIDATION.chainId).toBe(677);
    expect(STAGE_E1_PRESIGN_REVALIDATION.nonce).toBe(5);
    expect(STAGE_E1_TRANSACTION.nonce).toBe(5);
    expect(STAGE_E1_TRANSACTION.valueBOT).toBe('0');
    expect(STAGE_E1_TRANSACTION.status).toBe(1);
    expect(STAGE_E1_PRESIGN_REVALIDATION.unsignedDataKeccak).toBe(
      '0x967f90fbf5e2d32762cc7b073245b59f38092e77c727e22c5b4bfaff115fdd7b',
    );
    expect(STAGE_E1_TRANSACTION.deployedAddress).toBe(
      STAGE_E1_PRESIGN_REVALIDATION.expectedAddress,
    );
    expect(STAGE_E1_PRESIGN_REVALIDATION.expectedAddressCodeBefore).toBe('0x');
    expect(Number(STAGE_E1_TRANSACTION.gasUsed)).toBeLessThanOrEqual(
      STAGE_E1_TRANSACTION.gasLimit,
    );
  });

  it('keeps the frozen stakingV2 build line and artifact hashes', () => {
    expect(STAGE_E1_BUILD_MATRIX.solc).toBe('0.8.24+commit.e11b9ed9.Emscripten.clang');
    expect(STAGE_E1_BUILD_MATRIX.optimizer.runs).toBe(200);
    expect(STAGE_E1_BUILD_MATRIX.viaIR).toBe(true);
    expect(STAGE_E1_BUILD_MATRIX.evmVersion).toBe('cancun');
    expect(STAGE_E1_ARTIFACT.creationBytes).toBe(4604);
    expect(STAGE_E1_ARTIFACT.runtimeBytes).toBe(4137);
    expect(STAGE_E1_ARTIFACT.doubleBuildReproducible).toBe(true);
    expect(STAGE_E1_ARTIFACT.manifestParity).toBe('EXACT_MATCH');
  });

  it('proves immutable-aware runtime parity with no foreign bytes', () => {
    expect(STAGE_E1_RUNTIME_PARITY.onchainRuntimeBytes).toBe(
      STAGE_E1_RUNTIME_PARITY.frozenRuntimeBytes,
    );
    expect(STAGE_E1_RUNTIME_PARITY.immutableSlotRanges).toHaveLength(5);
    expect(STAGE_E1_RUNTIME_PARITY.allDeltasAreImmutableTokenAddress).toBe(true);
    expect(STAGE_E1_RUNTIME_PARITY.immutableSubstitutedValue).toBe(
      STAGE_E1_CONSTRUCTOR_ARGS.token,
    );
    expect(STAGE_E1_RUNTIME_PARITY.verdict).toBe('EXACT_IMMUTABLE_AWARE_MATCH');
  });

  it('encodes the approved constructor authorities', () => {
    for (const value of Object.values(STAGE_E1_CONSTRUCTOR_ARGS)) {
      expect(STAGE_E1_ABI_ENCODED_ARGS.toLowerCase()).toContain(
        value.slice(2).toLowerCase(),
      );
    }
  });

  it('starts fail-closed with zero balance, zero buckets and no deployer authority', () => {
    expect(STAGE_E1_POST_SETTLEMENT.tokenIsCanonicalFlow).toBe(true);
    expect(STAGE_E1_POST_SETTLEMENT.defaultAdminIsGovernanceSafe).toBe(true);
    expect(STAGE_E1_POST_SETTLEMENT.recoveryRecipientIsTreasurySafe).toBe(true);
    expect(STAGE_E1_POST_SETTLEMENT.deployerHasDefaultAdmin).toBe(false);
    expect(STAGE_E1_POST_SETTLEMENT.deployerHasVaultRole).toBe(false);
    expect(STAGE_E1_POST_SETTLEMENT.deployerHasControllerRole).toBe(false);
    expect(STAGE_E1_POST_SETTLEMENT.flowBalanceWei).toBe('0');
    expect(STAGE_E1_POST_SETTLEMENT.reservedGenesisWei).toBe('0');
    expect(STAGE_E1_POST_SETTLEMENT.reservedFloorsWei).toBe('0');
    expect(STAGE_E1_POST_SETTLEMENT.committedEpochWei).toBe('0');
    expect(STAGE_E1_POST_SETTLEMENT.accruedUnclaimedWei).toBe('0');
    expect(STAGE_E1_POST_SETTLEMENT.totalObligationsWei).toBe('0');
    expect(STAGE_E1_POST_SETTLEMENT.recoveryBoundedToFreeBalance).toBe(true);
    expect(STAGE_E1_POST_SETTLEMENT.mintPathPresent).toBe(false);
    expect(STAGE_E1_POST_SETTLEMENT.fundedTenMillionInventory).toBe(false);
  });

  it('records public source verification and the frozen stage locks', () => {
    expect(STAGE_E1_SOURCE_VERIFICATION.isVerified).toBe(true);
    expect(STAGE_E1_SOURCE_VERIFICATION.status).toBe('PUBLICLY_VERIFIED');
    expect(STAGE_E1_VERDICT).toBe('STAGE_E1_SETTLED_ONCHAIN_AND_SOURCE_VERIFIED');
    expect(STAGE_E_NEXT_STAGE_LOCK.stageE2Controller).toContain('UNAUTHORIZED');
    expect(STAGE_E_NEXT_STAGE_LOCK.stageE3VaultV2).toContain('UNAUTHORIZED');
    expect(STAGE_E_NEXT_STAGE_LOCK.routerTrafficPolicy).toContain('ROUTER_V3');
  });

  it('lists prohibited actions that were not taken', () => {
    expect(STAGE_E1_PROHIBITED_ACTIONS_NOT_TAKEN).toContain('FLOW_FUNDING_OF_TREASURY');
    expect(STAGE_E1_PROHIBITED_ACTIONS_NOT_TAKEN).toContain('CONTROLLER_BROADCAST');
    expect(STAGE_E1_PROHIBITED_ACTIONS_NOT_TAKEN).toContain('VAULT_V2_BROADCAST');
    expect(STAGE_E1_PROHIBITED_ACTIONS_NOT_TAKEN).toContain('ORACLE_CONFIGURATION');
  });
});
