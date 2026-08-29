import { describe, expect, it } from 'vitest';
import { APPROVED_AUTHORITIES } from './mainnetDeploymentGate';
import { payloadFor } from './deploymentPayloads';
import { PRODUCTION_BYTECODE } from './productionBytecode';
import {
  STAGE_C_ARTIFACTS,
  STAGE_C_CONSTRUCTOR_ARGS,
  STAGE_C_EXPECTED_ROUTER_CONFIG,
  STAGE_C_OBSERVATION,
  STAGE_C_TRAFFIC_POLICY,
  STAGE_C_UNSIGNED_REVIEW,
  bufferedGasLimit,
  buildStageCApprovals,
  evaluateStageCPreflight,
  requiredStageCFundingWei,
} from './stageCDeployer';

describe('V30.1E Stage C preflight', () => {
  it('passes on the recorded live observation', () => {
    const r = evaluateStageCPreflight();
    expect(r.blockers).toEqual([]);
    expect(r.verdict).toBe('STAGE_C_PREFLIGHT_PASS');
  });

  it('keeps rebuilt artifact hashes equal to the frozen production manifest', () => {
    expect(STAGE_C_ARTIFACTS.FlowBridgeRouterV4.runtimeSha256).toBe(
      PRODUCTION_BYTECODE.FlowBridgeRouterV4.runtimeSha256,
    );
    expect(STAGE_C_ARTIFACTS.FlowBridgeRouterV4.runtimeBytes).toBe(19_720);
    expect(STAGE_C_ARTIFACTS.FlowBridgeRouterV4.creationSha256.startsWith('ca4eb473')).toBe(true);
    expect(STAGE_C_ARTIFACTS.FlowBridgeRouterV4.runtimeSha256.startsWith('5650a7c7')).toBe(true);
    expect(STAGE_C_ARTIFACTS.FlowBridgeRouterLens.creationSha256).toBe(
      PRODUCTION_BYTECODE.FlowBridgeRouterLens.creationSha256,
    );
  });

  it('blocks on artifact drift', () => {
    const r = evaluateStageCPreflight({
      ...STAGE_C_OBSERVATION,
      router: { ...STAGE_C_OBSERVATION.router, runtimeSha256: 'deadbeef' },
    });
    expect(r.verdict).toBe('STAGE_C_PREFLIGHT_BLOCKED');
  });

  it('blocks on an unexpected deployer nonce', () => {
    expect(evaluateStageCPreflight({ ...STAGE_C_OBSERVATION, nonce: 3 }).verdict).toBe(
      'STAGE_C_PREFLIGHT_BLOCKED',
    );
  });

  it('blocks when the deployer cannot cover both buffered gas envelopes', () => {
    const r = evaluateStageCPreflight({ ...STAGE_C_OBSERVATION, deployerBalanceWei: 1n });
    expect(r.verdict).toBe('STAGE_C_PREFLIGHT_BLOCKED');
    expect(BigInt(r.requiredStageFundingWei)).toBe(requiredStageCFundingWei());
  });

  it('blocks when Router v3 is no longer live or traffic would migrate', () => {
    expect(
      evaluateStageCPreflight({ ...STAGE_C_OBSERVATION, liveRouterV3HasCode: false }).verdict,
    ).toBe('STAGE_C_PREFLIGHT_BLOCKED');
    expect(STAGE_C_TRAFFIC_POLICY.migratesTraffic).toBe(false);
    expect(STAGE_C_TRAFFIC_POLICY.v4Promotion).toBe('NOT_APPROVED');
  });

  it('binds Router V4 to the Governance Safe owner and Treasury Safe fee treasury', () => {
    expect(STAGE_C_CONSTRUCTOR_ARGS.FlowBridgeRouterV4.initialOwner).toBe(
      APPROVED_AUTHORITIES.governanceSafe,
    );
    expect(STAGE_C_CONSTRUCTOR_ARGS.FlowBridgeRouterV4.initialFeeTreasury).toBe(
      APPROVED_AUTHORITIES.treasurySafe,
    );
    expect(payloadFor('FlowBridgeRouterV4').args).toHaveLength(2);
  });

  it('keeps bridge execution off and fee configuration neutral at genesis', () => {
    expect(STAGE_C_EXPECTED_ROUTER_CONFIG.bridgeProxyExecutionEnabled).toBe(false);
    expect(STAGE_C_EXPECTED_ROUTER_CONFIG.bridgeAdapterMainnetExecution).toBe(false);
    expect(STAGE_C_EXPECTED_ROUTER_CONFIG.globalFeeBps).toBe(0);
    expect(STAGE_C_EXPECTED_ROUTER_CONFIG.maxFeeBps).toBe(500);
    expect(STAGE_C_EXPECTED_ROUTER_CONFIG.routerCount).toBe(0);
    expect(STAGE_C_EXPECTED_ROUTER_CONFIG.bridgeCount).toBe(0);
  });

  it('orders the Lens after the Router and binds it to the Router CREATE address', () => {
    const [router, lens] = STAGE_C_UNSIGNED_REVIEW.transactions;
    expect(router!.nonce).toBe(2);
    expect(lens!.nonce).toBe(3);
    expect(lens!.constructorArgs.flowRouter_).toBe(router!.expectedAddress);
    expect(payloadFor('FlowBridgeRouterLens').unresolvedDependencies).toContain(
      'FlowBridgeRouterV4',
    );
  });

  it('buffers gas limits by 30% and never broadcasts', () => {
    expect(bufferedGasLimit(4_452_213n)).toBe(5_787_876n);
    expect(bufferedGasLimit(1_764_423n)).toBe(2_293_749n);
    expect(STAGE_C_UNSIGNED_REVIEW.broadcast).toBe('NOT_BROADCAST');
  });

  it('creates exactly two Stage C approvals scoped to this stage only', () => {
    const approvals = buildStageCApprovals();
    expect(approvals).toHaveLength(2);
    for (const a of approvals) {
      expect(a.stage).toBe('C_ROUTER_V4_AND_LENS');
      expect(a.chainId).toBe(677);
    }
    expect(new Set(approvals.map((a) => a.contractId)).size).toBe(2);
  });
});
