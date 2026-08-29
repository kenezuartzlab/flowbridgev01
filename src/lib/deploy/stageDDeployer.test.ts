import { describe, expect, it } from 'vitest';
import { APPROVED_AUTHORITIES } from './mainnetDeploymentGate';
import { PRODUCTION_BYTECODE } from './productionBytecode';
import {
  STAGE_D_ARTIFACT,
  STAGE_D_BUILD_MATRIX,
  STAGE_D_CONSTRUCTOR_ARGS,
  STAGE_D_OBSERVATION,
  STAGE_D_UNSIGNED_REVIEW,
  bufferedGasLimit,
  buildStageDApproval,
  evaluateStageDPreflight,
  requiredStageDFundingWei,
} from './stageDDeployer';
import { validateStageApproval } from './deploymentTransport';
import { payloadFor } from './deploymentPayloads';
import { APPROVED_DEPLOYER_ADDRESS } from './stageADeployer';

describe('V30.1E Stage D — Activity Registry preflight', () => {
  it('passes with the recorded live observation', () => {
    const r = evaluateStageDPreflight();
    expect(r.blockers).toEqual([]);
    expect(r.verdict).toBe('STAGE_D_PREFLIGHT_PASS');
  });

  it('rebuilt artifact matches the frozen production bytecode manifest exactly', () => {
    const frozen = PRODUCTION_BYTECODE.FlowBridgeActivityRegistry;
    expect(STAGE_D_ARTIFACT.sourceSha256).toBe(frozen.sourceSha256);
    expect(STAGE_D_ARTIFACT.creationSha256).toBe(frozen.creationSha256);
    expect(STAGE_D_ARTIFACT.runtimeSha256).toBe(frozen.runtimeSha256);
    expect(STAGE_D_ARTIFACT.normalizedAbiSha256).toBe(frozen.normalizedAbiSha256);
    expect(STAGE_D_ARTIFACT.runtimeBytes).toBe(2713);
    expect(STAGE_D_ARTIFACT.creationBytes).toBe(3490);
  });

  it('uses the Registry build line, never Router or Staking settings', () => {
    expect(STAGE_D_BUILD_MATRIX.optimizer.runs).toBe(1);
    expect(STAGE_D_BUILD_MATRIX.evmVersion).toBe('shanghai');
    expect(STAGE_D_BUILD_MATRIX.solc).toContain('0.8.20+commit.a1b79de6');
    const blocked = evaluateStageDPreflight({
      ...STAGE_D_OBSERVATION,
      built: { ...STAGE_D_ARTIFACT, runtimeSha256: 'router-style-runs-200' },
    });
    expect(blocked.verdict).toBe('STAGE_D_PREFLIGHT_BLOCKED');
  });

  it('blocks a non-reproducible double build', () => {
    const r = evaluateStageDPreflight({
      ...STAGE_D_OBSERVATION,
      built: { ...STAGE_D_ARTIFACT, doubleBuildReproducible: false },
    });
    expect(r.verdict).toBe('STAGE_D_PREFLIGHT_BLOCKED');
  });

  it('preserves the frozen role matrix with admin != attester', () => {
    expect(STAGE_D_CONSTRUCTOR_ARGS.admin).toBe(APPROVED_AUTHORITIES.governanceSafe);
    expect(STAGE_D_CONSTRUCTOR_ARGS.attester).toBe(APPROVED_AUTHORITIES.activityAttester);
    expect(STAGE_D_CONSTRUCTOR_ARGS.pauser).toBe(APPROVED_AUTHORITIES.operationsSafe);
    expect(STAGE_D_CONSTRUCTOR_ARGS.admin).not.toBe(STAGE_D_CONSTRUCTOR_ARGS.attester);
    for (const a of Object.values(STAGE_D_CONSTRUCTOR_ARGS)) {
      expect(a.toLowerCase()).not.toBe(APPROVED_DEPLOYER_ADDRESS.toLowerCase());
    }
  });

  it('blocks a wrong nonce, wrong chain or occupied CREATE address', () => {
    for (const patch of [
      { nonce: 5 },
      { chainId: 968 },
      { expectedAddressHasCode: true },
      { attesterAddress: '0x0000000000000000000000000000000000000001' },
    ] as const) {
      expect(evaluateStageDPreflight({ ...STAGE_D_OBSERVATION, ...patch }).verdict).toBe(
        'STAGE_D_PREFLIGHT_BLOCKED',
      );
    }
  });

  it('blocks when the balance cannot cover the buffered gas envelope', () => {
    const r = evaluateStageDPreflight({ ...STAGE_D_OBSERVATION, deployerBalanceWei: 1n });
    expect(r.verdict).toBe('STAGE_D_PREFLIGHT_BLOCKED');
  });

  it('buffers gas by +30%', () => {
    expect(bufferedGasLimit(733_319n)).toBe(953_314n);
    expect(requiredStageDFundingWei()).toBe(953_314n * 20_000_000_000n);
  });

  it('binds a one-time approval that validates against the frozen payload', () => {
    const approval = buildStageDApproval();
    expect(approval.status).toBe('ACTIVE');
    const verdict = validateStageApproval({
      approval,
      candidateDigest: STAGE_D_OBSERVATION.candidateDigest,
      decisionManifestHash: STAGE_D_OBSERVATION.decisionManifestHash,
      chainId: 677,
      deployerAddress: APPROVED_DEPLOYER_ADDRESS,
      payload: payloadFor('FlowBridgeActivityRegistry'),
    });
    expect(verdict.valid).toBe(true);
  });

  it('rejects a tampered approval binding', () => {
    const approval = { ...buildStageDApproval(), artifactCreationSha256: 'deadbeef' };
    const verdict = validateStageApproval({
      approval,
      candidateDigest: STAGE_D_OBSERVATION.candidateDigest,
      decisionManifestHash: STAGE_D_OBSERVATION.decisionManifestHash,
      chainId: 677,
      deployerAddress: APPROVED_DEPLOYER_ADDRESS,
      payload: payloadFor('FlowBridgeActivityRegistry'),
    });
    expect(verdict.valid).toBe(false);
  });

  it('unsigned review is a single non-broadcast creation transaction with no side authority', () => {
    expect(STAGE_D_UNSIGNED_REVIEW.broadcast).toBe('NOT_BROADCAST');
    expect(STAGE_D_UNSIGNED_REVIEW.to).toBeNull();
    expect(STAGE_D_UNSIGNED_REVIEW.value).toBe('0');
    expect(STAGE_D_UNSIGNED_REVIEW.nonce).toBe(4);
    expect(STAGE_D_UNSIGNED_REVIEW.unsignedDataKeccak256).toMatch(/^0x[0-9a-f]{64}$/);
    expect(STAGE_D_UNSIGNED_REVIEW.predictedGenesis.recordedActivities).toBe(0);
    expect(STAGE_D_UNSIGNED_REVIEW.predictedGenesis.sourceLogIndexType).toBe('uint256');
    expect(STAGE_D_UNSIGNED_REVIEW.prohibited).toContain('ROUTER_V3_TRAFFIC_MIGRATION');
    expect(STAGE_D_UNSIGNED_REVIEW.verificationPackage.ready).toBe(true);
  });
});
