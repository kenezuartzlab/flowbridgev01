import { describe, expect, it } from 'vitest';
import {
  APPROVED_DEPLOYER_ADDRESS,
  STAGE_A_ARTIFACT,
  STAGE_A_OBSERVATION,
  STAGE_A_UNSIGNED_REVIEW,
  buildStageAApproval,
  evaluateDeployerPreflight,
  requiredReleaseFundingWei,
} from './stageADeployer';
import { validateStageApproval } from './deploymentTransport';
import { payloadFor } from './deploymentPayloads';
import {
  APPROVED_AUTHORITIES,
  V30_1E_CANDIDATE_DIGEST,
  V30_1E_DECISION_MANIFEST_HASH,
} from './mainnetDeploymentGate';
import { PRODUCTION_BYTECODE } from './productionBytecode';

describe('V30.1E Stage A deployer preflight', () => {
  it('passes against the recorded live observation', () => {
    const r = evaluateDeployerPreflight(STAGE_A_OBSERVATION);
    expect(r.verdict).toBe('PREFLIGHT_PASS');
    expect(r.blockers).toEqual([]);
  });

  it('computes required BOT from the live gas price, not a constant', () => {
    expect(requiredReleaseFundingWei(20_000_000_000n)).toBe(559_000_000_000_000_000n);
    expect(requiredReleaseFundingWei(40_000_000_000n)).toBe(1_118_000_000_000_000_000n);
  });

  it('blocks a contract deployer, wrong chain, drifted digest or underfunding', () => {
    for (const patch of [
      { deployerCode: '0x60' },
      { chainId: 968 },
      { candidateDigest: 'fnv1a64:deadbeefdeadbeef' },
      { decisionManifestHash: 'fnv1a64:deadbeefdeadbeef' },
      { safesVerified: false },
      { deployerBalanceWei: 1_000_000_000_000_000n },
    ] as const) {
      const r = evaluateDeployerPreflight({ ...STAGE_A_OBSERVATION, ...patch });
      expect(r.verdict).toBe('PREFLIGHT_BLOCKED');
      expect(r.blockers.length).toBeGreaterThan(0);
    }
  });

  it('blocks when the rebuilt artifact hashes drift from V30.1E.1', () => {
    const r = evaluateDeployerPreflight({
      ...STAGE_A_OBSERVATION,
      artifact: { ...STAGE_A_OBSERVATION.artifact, runtimeSha256: 'ff'.repeat(32) },
    });
    expect(r.verdict).toBe('PREFLIGHT_BLOCKED');
  });

  it('keeps frozen FlowToken artifact identity', () => {
    const f = PRODUCTION_BYTECODE.FlowToken;
    expect(STAGE_A_ARTIFACT.creationSha256).toBe(f.creationSha256);
    expect(STAGE_A_ARTIFACT.runtimeSha256).toBe(f.runtimeSha256);
  });
});

describe('V30.1E Stage A approval', () => {
  const approval = buildStageAApproval();

  it('binds deployer, chain, candidate, manifest, artifact and args', () => {
    expect(approval.stage).toBe('A_FLOW_TOKEN');
    expect(approval.chainId).toBe(677);
    expect(approval.candidateDigest).toBe(V30_1E_CANDIDATE_DIGEST);
    expect(approval.decisionManifestHash).toBe(V30_1E_DECISION_MANIFEST_HASH);
    expect(approval.deployerAddress).toBe(APPROVED_DEPLOYER_ADDRESS);
    expect(approval.constructorArgsHash).toBe(payloadFor('FlowToken').constructorArgsHash);
    const v = validateStageApproval({
      approval,
      candidateDigest: V30_1E_CANDIDATE_DIGEST,
      decisionManifestHash: V30_1E_DECISION_MANIFEST_HASH,
      chainId: 677,
      deployerAddress: APPROVED_DEPLOYER_ADDRESS,
      payload: payloadFor('FlowToken'),
    });
    expect(v.valid).toBe(true);
  });

  it('does not authorize another stage, deployer or funding', () => {
    expect(
      validateStageApproval({
        approval,
        candidateDigest: V30_1E_CANDIDATE_DIGEST,
        decisionManifestHash: V30_1E_DECISION_MANIFEST_HASH,
        chainId: 677,
        deployerAddress: '0x0000000000000000000000000000000000000009',
        payload: payloadFor('FlowToken'),
      }).valid,
    ).toBe(false);
    expect(
      validateStageApproval({
        approval,
        candidateDigest: V30_1E_CANDIDATE_DIGEST,
        decisionManifestHash: V30_1E_DECISION_MANIFEST_HASH,
        chainId: 677,
        deployerAddress: APPROVED_DEPLOYER_ADDRESS,
        payload: payloadFor('FlowRewardsMerkleDistributor'),
      }).valid,
    ).toBe(false);
  });

  it('the deployer is not a Safe or protocol role address', () => {
    const roles = Object.values(APPROVED_AUTHORITIES);
    expect(roles).not.toContain(APPROVED_DEPLOYER_ADDRESS.toLowerCase());
  });

  it('the unsigned review is complete and not broadcast', () => {
    expect(STAGE_A_UNSIGNED_REVIEW.broadcast).toBe('NOT_BROADCAST');
    expect(STAGE_A_UNSIGNED_REVIEW.to).toBeNull();
    expect(STAGE_A_UNSIGNED_REVIEW.treasuryRecipient.toLowerCase()).toBe(
      APPROVED_AUTHORITIES.treasurySafe,
    );
    expect(STAGE_A_UNSIGNED_REVIEW.constructorArgs.totalSupply_).toBe(
      (10n ** 27n).toString(),
    );
  });

  it('holds no secret-shaped field anywhere in the module surface', () => {
    const blob = JSON.stringify({ STAGE_A_UNSIGNED_REVIEW, approval });
    expect(/privatekey|private_key|mnemonic|seed|passphrase|keystore/i.test(blob)).toBe(false);
  });
});
