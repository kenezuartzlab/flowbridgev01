import { describe, expect, it } from 'vitest';
import {
  buildStageBApproval,
  evaluateStageBPreflight,
  requiredStageBFundingWei,
  STAGE_B_ARTIFACT,
  STAGE_B_CONSTRUCTOR_ARGS,
  STAGE_B_OBSERVATION,
  STAGE_B_UNSIGNED_REVIEW,
} from './stageBDeployer';
import { PRODUCTION_BYTECODE } from './productionBytecode';
import { STAGE_A_SETTLEMENT } from './stageASettlement';
import { validateStageApproval } from './deploymentTransport';
import { payloadFor } from './deploymentPayloads';
import {
  V30_1E_CANDIDATE_DIGEST,
  V30_1E_DECISION_MANIFEST_HASH,
} from './mainnetDeploymentGate';

describe('V30.1E.6 Stage B preflight', () => {
  it('passes on the recorded live observation', () => {
    const r = evaluateStageBPreflight();
    expect(r.verdict).toBe('STAGE_B_PREFLIGHT_PASS');
    expect(r.blockers).toEqual([]);
  });

  it('frozen artifact identity equals the production bytecode evidence', () => {
    const f = PRODUCTION_BYTECODE.FlowRewardsMerkleDistributor;
    expect(STAGE_B_ARTIFACT.creationSha256).toBe(f.creationSha256);
    expect(STAGE_B_ARTIFACT.runtimeSha256).toBe(f.runtimeSha256);
    expect(STAGE_B_ARTIFACT.normalizedAbiSha256).toBe(f.normalizedAbiSha256);
  });

  it('binds to the settled FlowToken address with a 24h publish delay', () => {
    expect(STAGE_B_CONSTRUCTOR_ARGS.token_).toBe(STAGE_A_SETTLEMENT.contractAddress);
    expect(STAGE_B_CONSTRUCTOR_ARGS.minPublishDelay_).toBe(86_400);
  });

  it('blocks when the token binding drifts', () => {
    const r = evaluateStageBPreflight({
      ...STAGE_B_OBSERVATION,
      flowTokenAddress: '0x0000000000000000000000000000000000000001',
    });
    expect(r.verdict).toBe('STAGE_B_PREFLIGHT_BLOCKED');
  });

  it('blocks when the rebuild is not reproducible', () => {
    const r = evaluateStageBPreflight({
      ...STAGE_B_OBSERVATION,
      artifact: { ...STAGE_B_OBSERVATION.artifact, doubleBuildReproducible: false },
    });
    expect(r.verdict).toBe('STAGE_B_PREFLIGHT_BLOCKED');
  });

  it('blocks on a wrong chain or a non-EOA deployer', () => {
    expect(evaluateStageBPreflight({ ...STAGE_B_OBSERVATION, chainId: 968 }).verdict).toBe(
      'STAGE_B_PREFLIGHT_BLOCKED',
    );
    expect(evaluateStageBPreflight({ ...STAGE_B_OBSERVATION, deployerCode: '0x60' }).verdict).toBe(
      'STAGE_B_PREFLIGHT_BLOCKED',
    );
  });

  it('blocks when the deployer cannot cover gas +30%', () => {
    const r = evaluateStageBPreflight({ ...STAGE_B_OBSERVATION, deployerBalanceWei: 1n });
    expect(r.verdict).toBe('STAGE_B_PREFLIGHT_BLOCKED');
  });

  it('buffers required funding by 30%', () => {
    expect(requiredStageBFundingWei(100n, 1000n)).toBe(130_000n);
  });

  it('creates a Stage B approval valid only for this exact payload', () => {
    const approval = buildStageBApproval();
    const v = validateStageApproval({
      approval,
      candidateDigest: V30_1E_CANDIDATE_DIGEST,
      decisionManifestHash: V30_1E_DECISION_MANIFEST_HASH,
      chainId: 677,
      deployerAddress: approval.deployerAddress,
      payload: payloadFor('FlowRewardsMerkleDistributor'),
    });
    expect(v.valid).toBe(true);
    const wrong = validateStageApproval({
      approval,
      candidateDigest: V30_1E_CANDIDATE_DIGEST,
      decisionManifestHash: V30_1E_DECISION_MANIFEST_HASH,
      chainId: 677,
      deployerAddress: approval.deployerAddress,
      payload: payloadFor('FlowToken'),
    });
    expect(wrong.valid).toBe(false);
  });

  it('unsigned review is unfunded, unapproved and not broadcast', () => {
    expect(STAGE_B_UNSIGNED_REVIEW.initialFunding).toBe('0');
    expect(STAGE_B_UNSIGNED_REVIEW.initialReservedObligations).toBe('0');
    expect(STAGE_B_UNSIGNED_REVIEW.ownerApproval).toBe('NOT_RECORDED');
    expect(STAGE_B_UNSIGNED_REVIEW.broadcast).toBe('NOT_BROADCAST');
  });
});
