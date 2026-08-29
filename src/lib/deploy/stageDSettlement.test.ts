import { describe, expect, it } from 'vitest';
import { PRODUCTION_BYTECODE } from './productionBytecode';
import { APPROVED_AUTHORITIES } from './mainnetDeploymentGate';
import {
  STAGE_D_GENESIS_STATE,
  STAGE_D_PROHIBITED_ACTIONS_OBSERVED,
  STAGE_D_REGISTRY_ADDRESS,
  STAGE_D_ROLE_MATRIX,
  STAGE_D_RUNTIME_PARITY,
  STAGE_D_SOURCE_VERIFICATION,
  STAGE_D_TRANSACTION,
  STAGE_D_VERDICT,
} from './stageDSettlement';

describe('V30.1E Stage D Activity Registry settlement', () => {
  it('settled at the reviewed CREATE address from nonce 4 with zero value', () => {
    expect(STAGE_D_REGISTRY_ADDRESS.toLowerCase()).toBe(
      '0xa80d8740f378989f649ca14c54e4b4a42e68753c',
    );
    expect(STAGE_D_TRANSACTION.chainId).toBe(677);
    expect(STAGE_D_TRANSACTION.nonce).toBe(4);
    expect(STAGE_D_TRANSACTION.status).toBe(1);
    expect(STAGE_D_TRANSACTION.valueWei).toBe('0');
    expect(STAGE_D_TRANSACTION.expectedAddressMatched).toBe(true);
    expect(BigInt(STAGE_D_TRANSACTION.gasUsed)).toBeLessThan(
      BigInt(STAGE_D_TRANSACTION.gasLimit),
    );
  });

  it('broadcast exactly the authorized unsigned payload', () => {
    expect(STAGE_D_TRANSACTION.unsignedDataKeccak256).toBe(
      '0xb802153f8ac61914fb7bf2fc78d45972e5f545051d7b180c8df75ada13fed443',
    );
  });

  it('proves byte-exact runtime parity with the frozen artifact', () => {
    expect(STAGE_D_RUNTIME_PARITY.onchainRuntimeSha256).toBe(
      PRODUCTION_BYTECODE.FlowBridgeActivityRegistry.runtimeSha256,
    );
    expect(STAGE_D_RUNTIME_PARITY.frozenRuntimeSha256).toBe(
      STAGE_D_RUNTIME_PARITY.onchainRuntimeSha256,
    );
    expect(STAGE_D_RUNTIME_PARITY.runtimeBytes).toBe(
      PRODUCTION_BYTECODE.FlowBridgeActivityRegistry.runtimeBytes,
    );
    expect(STAGE_D_RUNTIME_PARITY.verdict).toBe('EXACT_MATCH');
  });

  it('holds the approved role separation with no deployer privilege', () => {
    expect(STAGE_D_ROLE_MATRIX.defaultAdmin).toBe(APPROVED_AUTHORITIES.governanceSafe);
    expect(STAGE_D_ROLE_MATRIX.attester).toBe(APPROVED_AUTHORITIES.activityAttester);
    expect(STAGE_D_ROLE_MATRIX.pauser).toBe(APPROVED_AUTHORITIES.operationsSafe);
    expect(STAGE_D_ROLE_MATRIX.governanceIsDefaultAdmin).toBe(true);
    expect(STAGE_D_ROLE_MATRIX.attesterHasAttesterRole).toBe(true);
    expect(STAGE_D_ROLE_MATRIX.operationsHasPauserRole).toBe(true);
    expect(STAGE_D_ROLE_MATRIX.adminEqualsAttester).toBe(false);
    expect(STAGE_D_ROLE_MATRIX.deployerHoldsAnyRole).toBe(false);
  });

  it('started with an empty, unpaused, non-custodial genesis state', () => {
    expect(STAGE_D_GENESIS_STATE.recordedActivities).toBe(0);
    expect(STAGE_D_GENESIS_STATE.activityRecordedEvents).toBe(0);
    expect(STAGE_D_GENESIS_STATE.paused).toBe(false);
    expect(STAGE_D_GENESIS_STATE.attestationsPausable).toBe(true);
    expect(STAGE_D_GENESIS_STATE.activityIdMatchesCanonicalUint256Encoding).toBe(true);
    expect(STAGE_D_GENESIS_STATE.sourceLogIndexAffectsIdentity).toBe(true);
    expect(STAGE_D_GENESIS_STATE.duplicateProtectionError).toBe('DuplicateActivity');
    expect(STAGE_D_GENESIS_STATE.payableFunctions).toHaveLength(0);
    expect(STAGE_D_GENESIS_STATE.hasReceiveOrFallback).toBe(false);
    expect(STAGE_D_GENESIS_STATE.tokenOrRewardCustody).toBe('NONE');
    expect(STAGE_D_GENESIS_STATE.economicExecutionAuthority).toBe('NONE');
  });

  it('classifies verification as explorer-blocked, never as artifact mismatch', () => {
    expect(STAGE_D_SOURCE_VERIFICATION.status).toBe('EXPLORER_TRANSPORT_BLOCKED');
    expect(STAGE_D_SOURCE_VERIFICATION.isVerified).toBe(false);
    expect(STAGE_D_SOURCE_VERIFICATION.onchainRuntimeMatchesFrozenArtifact).toBe(true);
    expect(STAGE_D_SOURCE_VERIFICATION.bundlePreserved).toContain('stage-d-verification');
    expect(STAGE_D_VERDICT).toBe('STAGE_D_SETTLED_ONCHAIN_VERIFIED_SOURCE_PENDING');
  });

  it('performed no prohibited Stage D action', () => {
    expect(Object.values(STAGE_D_PROHIBITED_ACTIONS_OBSERVED).every((v) => v === false)).toBe(
      true,
    );
  });
});
