import { describe, expect, it } from 'vitest';
import {
  R1_APPROVAL_BINDING_HASH,
  R1_APPROVED_CANDIDATE_DIGEST,
  R1_ARTIFACT,
  R1_GAS_LIMIT,
  R1_MAX_COST_WEI,
  R1_OBSERVATION,
  R1_TOTAL_SUPPLY_WEI,
  bufferedGasLimit,
  evaluateR1Preflight,
} from './v302aR1Preflight';
import {
  R6_VIA_IR_EXCEPTION,
  V30_2A_FROZEN_BUILDS,
  V30_2_DEPENDENCY_UNLOCK_POLICY,
  dependencyUnlocksDependents,
} from './v302aRedeployCandidate';

describe('V30.2A R1 FlowToken preflight', () => {
  it('passes every check and never broadcasts', () => {
    const r = evaluateR1Preflight();
    const failed = r.checks.filter((c) => !c.ok).map((c) => c.id);
    expect(failed).toEqual([]);
    expect(r.pass).toBe(true);
    expect(r.broadcast).toBe(false);
    expect(r.chainId).toBe(677);
  });

  it('is bound to the approved candidate digest', () => {
    const r = evaluateR1Preflight();
    expect(r.candidateDigest).toBe(R1_APPROVED_CANDIDATE_DIGEST);
    expect(R1_APPROVED_CANDIDATE_DIGEST).toBe('fnv1a64:e0ac31b5bb297880');
  });

  it('matches the frozen non-viaIR FlowToken build row exactly', () => {
    const frozen = V30_2A_FROZEN_BUILDS.find((b) => b.stage === 'R1')!;
    expect(frozen.viaIR).toBe(false);
    expect(R1_ARTIFACT.creationSha256).toBe(frozen.creationSha256);
    expect(R1_ARTIFACT.runtimeSha256).toBe(frozen.runtimeSha256);
    expect(R1_ARTIFACT.normalizedAbiSha256).toBe(frozen.normalizedAbiSha256);
    expect(R1_ARTIFACT.sourceSha256).toBe(frozen.sourceSha256);
  });

  it('fixes supply, decimals and gas envelope', () => {
    expect(R1_TOTAL_SUPPLY_WEI).toBe(1_000_000_000n * 10n ** 18n);
    expect(bufferedGasLimit(1_000n)).toBe(1_300n);
    expect(R1_GAS_LIMIT).toBeGreaterThan(R1_OBSERVATION.gasEstimate);
    expect(R1_OBSERVATION.balanceWei).toBeGreaterThan(R1_MAX_COST_WEI);
  });

  it('produces a stable one-time approval binding hash', () => {
    expect(R1_APPROVAL_BINDING_HASH).toMatch(/^fnv1a64:[0-9a-f]{16}$/);
    expect(evaluateR1Preflight().approvalBindingHash).toBe(R1_APPROVAL_BINDING_HASH);
  });
});

describe('V30.2 dependency unlock policy', () => {
  it('requires settled AND publicly verified', () => {
    expect(V30_2_DEPENDENCY_UNLOCK_POLICY.frozen).toBe(true);
    expect(dependencyUnlocksDependents({ onChainSettled: true, publiclySourceVerified: true })).toBe(true);
    expect(dependencyUnlocksDependents({ onChainSettled: true, publiclySourceVerified: false })).toBe(false);
    expect(dependencyUnlocksDependents({ onChainSettled: false, publiclySourceVerified: true })).toBe(false);
  });

  it('records the R6 viaIR exception without approving it', () => {
    expect(R6_VIA_IR_EXCEPTION.code).toBe('viaIR REQUIRED — STACK_TOO_DEEP');
    expect(R6_VIA_IR_EXCEPTION.status).toBe('REQUIRED_PENDING_REVIEW');
    expect(R6_VIA_IR_EXCEPTION.ownerApproved).toBe(false);
  });
});
