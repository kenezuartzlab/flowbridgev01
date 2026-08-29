import { describe, expect, it } from 'vitest';
import { PRODUCTION_BYTECODE } from './productionBytecode';
import { STAGE_C1_ROUTER_ADDRESS } from './stageC1Settlement';
import {
  EXPLORER_EDGE_RETRY,
  STAGE_A_VERIFICATION_STATE,
  STAGE_B_VERIFICATION_STATE,
  STAGE_C2_LENS_ADDRESS,
  STAGE_C2_MUTATION_SURFACE,
  STAGE_C2_OBSERVED_READS,
  STAGE_C2_RUNTIME_PARITY,
  STAGE_C2_SOURCE_VERIFICATION,
  STAGE_C2_TRAFFIC_POLICY,
  STAGE_C2_TRANSACTION,
  STAGE_C2_VERDICT,
} from './stageC2Settlement';

describe('V30.1E Stage C.2 Router Lens settlement', () => {
  it('settled at the expected CREATE address from nonce 3 with zero value', () => {
    expect(STAGE_C2_LENS_ADDRESS.toLowerCase()).toBe(
      '0x48338d23640b09acdf0e7246844a9d867dc8205c',
    );
    expect(STAGE_C2_TRANSACTION.nonce).toBe(3);
    expect(STAGE_C2_TRANSACTION.status).toBe(1);
    expect(STAGE_C2_TRANSACTION.valueWei).toBe('0');
    expect(STAGE_C2_TRANSACTION.expectedAddressMatched).toBe(true);
    expect(BigInt(STAGE_C2_TRANSACTION.gasUsed)).toBeLessThan(
      BigInt(STAGE_C2_TRANSACTION.gasLimit),
    );
  });

  it('broadcast exactly the reviewed unsigned payload', () => {
    expect(STAGE_C2_TRANSACTION.unsignedDataKeccak256).toBe(
      '0x44efb54034d8c07c7437bd73c094ce2bfcff9f08bb463394623430327100b8a9',
    );
  });

  it('proves runtime parity modulo the immutable router slots only', () => {
    expect(STAGE_C2_RUNTIME_PARITY.frozenRuntimeSha256).toBe(
      PRODUCTION_BYTECODE.FlowBridgeRouterLens.runtimeSha256,
    );
    expect(STAGE_C2_RUNTIME_PARITY.sizesEqual).toBe(true);
    expect(STAGE_C2_RUNTIME_PARITY.runtimeBytes).toBe(7_829);
    expect(STAGE_C2_RUNTIME_PARITY.allDifferencesAreImmutableRouterSlots).toBe(true);
    expect(STAGE_C2_RUNTIME_PARITY.immutableSlotStarts).toHaveLength(
      STAGE_C2_RUNTIME_PARITY.differingRanges,
    );
    expect(STAGE_C2_RUNTIME_PARITY.differingBytes).toBe(
      STAGE_C2_RUNTIME_PARITY.differingRanges * 20,
    );
  });

  it('points only at Router V4 and reflects the empty registry', () => {
    expect(STAGE_C2_OBSERVED_READS.flowRouter).toBe(STAGE_C1_ROUTER_ADDRESS);
    expect(STAGE_C2_OBSERVED_READS.activeRoutersCount).toBe(0);
    expect(STAGE_C2_OBSERVED_READS.activeBridgesCount).toBe(0);
    expect(STAGE_C2_OBSERVED_READS.routersPageEmpty).toBe(true);
    expect(STAGE_C2_OBSERVED_READS.bridgesPageEmpty).toBe(true);
    expect(STAGE_C2_OBSERVED_READS.findBestV2RateFound).toBe(false);
    expect(STAGE_C2_OBSERVED_READS.getRouterZeroReverts).toBe('RouterIdOutOfRange');
    expect(STAGE_C2_OBSERVED_READS.getBridgeRouteConfigZeroReverts).toBe('BridgeIdOutOfRange');
  });

  it('cannot mutate router state or receive value', () => {
    expect(STAGE_C2_MUTATION_SURFACE.mutatingFunctions).toHaveLength(0);
    expect(STAGE_C2_MUTATION_SURFACE.payableEntries).toHaveLength(0);
    expect(STAGE_C2_MUTATION_SURFACE.hasReceiveOrFallback).toBe(false);
    expect(STAGE_C2_MUTATION_SURFACE.canMutateRouterState).toBe(false);
  });

  it('is publicly source verified through the v2 standard JSON route', () => {
    expect(STAGE_C2_SOURCE_VERIFICATION.isVerified).toBe(true);
    expect(STAGE_C2_SOURCE_VERIFICATION.status).toBe('PUBLICLY_VERIFIED');
    expect(STAGE_C2_SOURCE_VERIFICATION.reportedName).toBe('FlowBridgeRouterLens');
    expect(STAGE_C2_SOURCE_VERIFICATION.viaIR).toBe(true);
  });

  it('keeps Router v3 live with no registration, activation or funding', () => {
    expect(STAGE_C2_TRAFFIC_POLICY.migratesTraffic).toBe(false);
    expect(STAGE_C2_TRAFFIC_POLICY.v4Promotion).toBe('NOT_APPROVED');
    expect(STAGE_C2_TRAFFIC_POLICY.registryRegistrations).toBe(0);
    expect(STAGE_C2_TRAFFIC_POLICY.registryActivations).toBe(0);
    expect(STAGE_C2_TRAFFIC_POLICY.fundingActions).toBe(0);
  });

  it('records the Stage A/B retry as an explorer transport blocker only', () => {
    expect(EXPLORER_EDGE_RETRY.sourcesAltered).toBe(false);
    expect(EXPLORER_EDGE_RETRY.recompiled).toBe(false);
    expect(EXPLORER_EDGE_RETRY.redeployed).toBe(false);
    expect(EXPLORER_EDGE_RETRY.observedRejectedBodyBytes).toBeGreaterThan(
      EXPLORER_EDGE_RETRY.observedAcceptedBodyBytes,
    );
    for (const state of [STAGE_A_VERIFICATION_STATE, STAGE_B_VERIFICATION_STATE]) {
      expect(state.submissionHttpStatus).toBe(403);
      expect(state.blocker).toBe('EXPLORER_EDGE_BODY_SIZE_403');
      expect(state.status).toBe('DEPLOYED_ONCHAIN_VERIFIED_SOURCE_PENDING');
      expect(state.bundleBytes).toBeGreaterThan(EXPLORER_EDGE_RETRY.observedAcceptedBodyBytes);
    }
  });

  it('reports the settled verdict', () => {
    expect(STAGE_C2_VERDICT).toBe('STAGE_C2_SETTLED_VERIFIED');
  });
});
