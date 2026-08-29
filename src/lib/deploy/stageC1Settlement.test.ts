import { describe, expect, it } from 'vitest';
import { APPROVED_AUTHORITIES } from './mainnetDeploymentGate';
import { PRODUCTION_BYTECODE } from './productionBytecode';
import {
  STAGE_C1_OBSERVED_CONFIG,
  STAGE_C1_ROUTER_ADDRESS,
  STAGE_C1_RUNTIME_PARITY,
  STAGE_C1_SOURCE_VERIFICATION,
  STAGE_C1_TRAFFIC_POLICY,
  STAGE_C1_TRANSACTION,
  STAGE_C1_VERDICT,
  STAGE_C2_LENS_STATE,
  activationDelayAcceptable,
} from './stageC1Settlement';

describe('V30.1E Stage C.1 Router V4 settlement', () => {
  it('settled at the expected CREATE address from nonce 2', () => {
    expect(STAGE_C1_ROUTER_ADDRESS.toLowerCase()).toBe(
      '0x3c6fdaf93f39c72be931ab80196292962ebe6b06',
    );
    expect(STAGE_C1_TRANSACTION.nonce).toBe(2);
    expect(STAGE_C1_TRANSACTION.status).toBe(1);
    expect(STAGE_C1_TRANSACTION.valueWei).toBe('0');
    expect(BigInt(STAGE_C1_TRANSACTION.gasUsed)).toBeLessThan(
      BigInt(STAGE_C1_TRANSACTION.gasLimit),
    );
  });

  it('proves exact runtime parity with the frozen manifest', () => {
    expect(STAGE_C1_RUNTIME_PARITY.onchainRuntimeSha256).toBe(
      PRODUCTION_BYTECODE.FlowBridgeRouterV4.runtimeSha256,
    );
    expect(STAGE_C1_RUNTIME_PARITY.runtimeBytes).toBe(19_720);
    expect(STAGE_C1_RUNTIME_PARITY.byteDifferences).toBe(0);
  });

  it('binds governance and treasury authority with neutral fees', () => {
    expect(STAGE_C1_OBSERVED_CONFIG.owner).toBe(APPROVED_AUTHORITIES.governanceSafe);
    expect(STAGE_C1_OBSERVED_CONFIG.feeTreasury).toBe(APPROVED_AUTHORITIES.treasurySafe);
    expect(STAGE_C1_OBSERVED_CONFIG.pendingOwner).toBe(
      '0x0000000000000000000000000000000000000000',
    );
    expect(STAGE_C1_OBSERVED_CONFIG.globalFeeBps).toBe(0);
    expect(STAGE_C1_OBSERVED_CONFIG.maxFeeBps).toBe(500);
    expect(STAGE_C1_OBSERVED_CONFIG.feeConfigNonce).toBe(0);
    expect(STAGE_C1_OBSERVED_CONFIG.paused).toBe(false);
    expect(STAGE_C1_OBSERVED_CONFIG.routerCount).toBe(0);
    expect(STAGE_C1_OBSERVED_CONFIG.bridgeCount).toBe(0);
    expect(STAGE_C1_OBSERVED_CONFIG.bridgeExecutionEnabled).toBe(false);
  });

  it('tolerates a zero activation delay only while the registry is empty', () => {
    expect(activationDelayAcceptable(0, 0, 0)).toBe(true);
    expect(activationDelayAcceptable(0, 1, 0)).toBe(false);
    expect(activationDelayAcceptable(0, 0, 1)).toBe(false);
    expect(activationDelayAcceptable(86_400, 1, 1)).toBe(true);
    expect(activationDelayAcceptable(999_999, 1, 1)).toBe(false);
  });

  it('records public source verification', () => {
    expect(STAGE_C1_SOURCE_VERIFICATION.isVerified).toBe(true);
    expect(STAGE_C1_SOURCE_VERIFICATION.compiler).toBe('v0.8.20+commit.a1b79de6');
    expect(STAGE_C1_SOURCE_VERIFICATION.viaIR).toBe(true);
    expect(STAGE_C1_VERDICT).toBe('STAGE_C1_SETTLED_VERIFIED');
  });

  it('keeps the Lens unbroadcast, targeted at the deployed Router, payload unchanged', () => {
    expect(STAGE_C2_LENS_STATE.state).toBe('APPROVED_NOT_BROADCAST');
    expect(STAGE_C2_LENS_STATE.target).toBe(STAGE_C1_ROUTER_ADDRESS);
    expect(STAGE_C2_LENS_STATE.unsignedPayloadUnchanged).toBe(true);
    expect(STAGE_C2_LENS_STATE.unsignedDataKeccak256).toBe(
      '0x44efb54034d8c07c7437bd73c094ce2bfcff9f08bb463394623430327100b8a9',
    );
    expect(STAGE_C2_LENS_STATE.nonce).toBe(3);
  });

  it('keeps Router v3 authoritative with no traffic migration', () => {
    expect(STAGE_C1_TRAFFIC_POLICY.liveRouterVersion).toBe('v3-legacy');
    expect(STAGE_C1_TRAFFIC_POLICY.liveRouterHasCode).toBe(true);
    expect(STAGE_C1_TRAFFIC_POLICY.v4Promotion).toBe('NOT_APPROVED');
    expect(STAGE_C1_TRAFFIC_POLICY.migratesTraffic).toBe(false);
  });
});
