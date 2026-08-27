/**
 * FlowBridge V30.1E.1 — required tests (§12) for production bytecode,
 * deterministic payloads, secure transport, stage approvals and the DRY_RUN
 * deployment state machine.
 */
import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_BYTECODE,
  ROUTER_INVENTORY,
  bytecodeStatus,
  compilerMatrixMatches,
  routerV4BuildParity,
  routerV4RequirementSatisfied,
  type ProductionContractId,
} from './productionBytecode';
import {
  DEPLOYMENT_PAYLOADS,
  payloadFor,
  payloadsForStage,
  resolvePayload,
} from './deploymentPayloads';
import {
  TRANSPORT_MODEL_FIELDS,
  approvalAuthorizesFunding,
  consumeStageApproval,
  createStageApproval,
  evaluateTransport,
  requiredStageFundingWei,
  transportModelHasNoSecretFields,
  validateStageApproval,
  type StageApproval,
  type TransportObservation,
} from './deploymentTransport';
import {
  fundingAvailable,
  isDryRunSafeMethod,
  runDeploymentDryRun,
  simulateContract,
  verificationPackages,
} from './deploymentDryRun';
import {
  APPROVED_AUTHORITIES,
  V30_1E_CANDIDATE_DIGEST,
  V30_1E_DECISION_MANIFEST_HASH,
} from './mainnetDeploymentGate';

const DEPLOYER = '0x00000000000000000000000000000000000decaf0';
const CONTRACT_IDS = Object.keys(PRODUCTION_BYTECODE) as ProductionContractId[];

const activeApproval = (overrides: Partial<StageApproval> = {}): StageApproval => {
  const payload = payloadFor('FlowToken');
  const base = createStageApproval({
    stage: 'A_FLOW_TOKEN',
    candidateDigest: V30_1E_CANDIDATE_DIGEST,
    decisionManifestHash: V30_1E_DECISION_MANIFEST_HASH,
    chainId: 677,
    deployerAddress: DEPLOYER,
    contractId: 'FlowToken',
    artifactCreationSha256: payload.creationSha256,
    constructorArgsHash: payload.constructorArgsHash,
    expectedEffect: payload.expectedEffect,
  });
  return { ...base, ...overrides };
};

const validate = (approval: StageApproval, over: Partial<{ candidateDigest: string; manifest: string; chainId: number; deployer: string | null }> = {}) =>
  validateStageApproval({
    approval,
    candidateDigest: over.candidateDigest ?? V30_1E_CANDIDATE_DIGEST,
    decisionManifestHash: over.manifest ?? V30_1E_DECISION_MANIFEST_HASH,
    chainId: over.chainId ?? 677,
    deployerAddress: over.deployer === undefined ? DEPLOYER : over.deployer,
    payload: payloadFor('FlowToken'),
  });

describe('V30.1E.1 production bytecode', () => {
  it('Router V4 runtimeSha256 is not null', () => {
    expect(PRODUCTION_BYTECODE.FlowBridgeRouterV4.runtimeSha256).toBeTruthy();
  });

  it('Router V4 build parity is PROVEN and within EIP-170', () => {
    expect(routerV4BuildParity()).toBe('PROVEN');
    expect(PRODUCTION_BYTECODE.FlowBridgeRouterV4.runtimeBytes).toBeLessThan(24_576);
  });

  it('every deployable contract has source, creation, runtime and ABI hashes', () => {
    for (const id of CONTRACT_IDS) {
      const e = PRODUCTION_BYTECODE[id];
      expect(e.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(e.creationSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(e.runtimeSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(e.normalizedAbiSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(bytecodeStatus(e)).not.toBe('BUILD_PARITY_BLOCKED');
    }
  });

  it('a missing runtime hash or non-reproducible build is BUILD_PARITY_BLOCKED', () => {
    expect(
      bytecodeStatus({ ...PRODUCTION_BYTECODE.FlowToken, runtimeSha256: null }),
    ).toBe('BUILD_PARITY_BLOCKED');
    expect(
      bytecodeStatus({ ...PRODUCTION_BYTECODE.FlowToken, doubleBuild: 'NON_REPRODUCIBLE' }),
    ).toBe('BUILD_PARITY_BLOCKED');
  });

  it('wrong compiler settings fail the parity matrix', () => {
    const good = PRODUCTION_BYTECODE.FlowBridgeRouterLens.compiler;
    expect(compilerMatrixMatches('FlowBridgeRouterLens', good)).toBe(true);
    expect(compilerMatrixMatches('FlowBridgeRouterLens', { ...good, optimizerRuns: 200 })).toBe(false);
    expect(
      compilerMatrixMatches('FlowBridgeRouterV4', {
        ...PRODUCTION_BYTECODE.FlowBridgeRouterV4.compiler,
        evmVersion: 'paris',
      }),
    ).toBe(false);
  });

  it('existing Router v3 cannot satisfy the Router V4 requirement', () => {
    const legacy = ROUTER_INVENTORY.find((r) => r.identity === 'LEGACY_EXISTING_V3')!;
    expect(legacy.satisfiesRouterV4Requirement).toBe(false);
    expect(legacy.appUsage).toBe('PRODUCTION_TRAFFIC');
    expect(routerV4RequirementSatisfied()).toBe(false);
  });

  it('legacy and promotion-pending router states coexist', () => {
    expect(ROUTER_INVENTORY.map((r) => r.identity)).toEqual([
      'LEGACY_EXISTING_V3',
      'ROUTER_V4_PROMOTION_PENDING',
    ]);
  });
});

describe('V30.1E.1 deterministic payloads', () => {
  it('FLOW constructor resolves to 1B supply and the Treasury Safe', () => {
    const p = payloadFor('FlowToken');
    expect(p.args.find((a) => a.name === 'treasury_')!.value).toBe(APPROVED_AUTHORITIES.treasurySafe);
    expect(p.args.find((a) => a.name === 'totalSupply_')!.value).toBe(
      '1000000000000000000000000000',
    );
  });

  it('rewards and staking bind to staged dependency references', () => {
    expect(payloadFor('FlowRewardsMerkleDistributor').unresolvedDependencies).toEqual(['FlowToken']);
    expect(payloadFor('FlowStakingVaultV2').unresolvedDependencies).toEqual([
      'FlowToken',
      'FlowStakingController',
      'FlowStakingRewardTreasury',
    ]);
    expect(payloadFor('FlowBridgeRouterLens').unresolvedDependencies).toEqual([
      'FlowBridgeRouterV4',
    ]);
  });

  it('payload hashes are deterministic and stage coverage is complete', () => {
    const again = payloadFor('FlowToken');
    expect(again.unsignedPayloadHash).toBe(payloadFor('FlowToken').unsignedPayloadHash);
    expect(DEPLOYMENT_PAYLOADS).toHaveLength(8);
    expect(payloadsForStage('C_ROUTER_V4_AND_LENS').map((p) => p.contractId)).toEqual([
      'FlowBridgeRouterV4',
      'FlowBridgeRouterLens',
    ]);
  });

  it('an unresolved dependency yields no resolved payload', () => {
    expect(resolvePayload(payloadFor('FlowStakingVaultV2'), {})).toBeNull();
    const resolved = resolvePayload(payloadFor('FlowBridgeRouterLens'), {
      FlowBridgeRouterV4: '0x1111111111111111111111111111111111111111',
    });
    expect(resolved?.args).toEqual(['0x1111111111111111111111111111111111111111']);
  });
});

describe('V30.1E.1 secure transport', () => {
  const base: TransportObservation = {
    signerMode: 'EXTERNAL_WALLET',
    connectedAddress: DEPLOYER,
    approvedDeployerAddress: DEPLOYER,
    connectedChainId: 677,
    deployerBalanceWei: 10n ** 18n,
    requiredBalanceWei: 5n * 10n ** 17n,
    stageApproved: true,
    autoBroadcast: false,
  };

  it('no private-key field exists in the transport model', () => {
    expect(transportModelHasNoSecretFields()).toBe(true);
    expect(TRANSPORT_MODEL_FIELDS).not.toContain('privateKey');
    expect(transportModelHasNoSecretFields([...TRANSPORT_MODEL_FIELDS, 'privateKey'])).toBe(false);
  });

  it('reaches STAGE_APPROVED only when every precondition holds', () => {
    expect(evaluateTransport(base)).toEqual({ state: 'STAGE_APPROVED', ready: true, blockers: [] });
  });

  it('no signer means NO_SIGNER and not ready', () => {
    const v = evaluateTransport({ ...base, signerMode: 'NONE', connectedAddress: null });
    expect(v.state).toBe('NO_SIGNER');
    expect(v.ready).toBe(false);
  });

  it('chain != 677 blocks the signer transport', () => {
    const v = evaluateTransport({ ...base, connectedChainId: 968 });
    expect(v.ready).toBe(false);
    expect(v.blockers.join(' ')).toContain('677');
  });

  it('a signer differing from the approved deployer blocks', () => {
    const v = evaluateTransport({ ...base, connectedAddress: '0x00000000000000000000000000000000000000ff' });
    expect(v.ready).toBe(false);
    expect(v.blockers.join(' ')).toContain('differs from the approved deployer');
  });

  it('a Safe or protocol role address may not be the deployer', () => {
    const v = evaluateTransport({
      ...base,
      connectedAddress: APPROVED_AUTHORITIES.treasurySafe,
      approvedDeployerAddress: APPROVED_AUTHORITIES.treasurySafe,
    });
    expect(v.ready).toBe(false);
  });

  it('insufficient BOT balance blocks at CHAIN_VERIFIED', () => {
    const v = evaluateTransport({ ...base, deployerBalanceWei: 1n });
    expect(v.state).toBe('CHAIN_VERIFIED');
    expect(v.ready).toBe(false);
  });

  it('no stage approval means no broadcast', () => {
    const v = evaluateTransport({ ...base, stageApproved: false });
    expect(v.state).toBe('FUNDED');
    expect(v.ready).toBe(false);
  });

  it('auto-broadcast is never permitted', () => {
    expect(evaluateTransport({ ...base, autoBroadcast: true }).ready).toBe(false);
  });

  it('required funding includes the 30% buffer', () => {
    expect(requiredStageFundingWei(1_000_000n, 20_000_000_000n)).toBe(26_000_000_000_000_000n);
  });
});

describe('V30.1E.1 stage approvals', () => {
  it('an intact approval validates', () => {
    expect(validate(activeApproval()).valid).toBe(true);
  });

  it('a constructor-argument change invalidates the approval', () => {
    const v = validate(activeApproval({ constructorArgsHash: 'fnv1a64:0000000000000000' }));
    expect(v.valid).toBe(false);
    expect(v.reasons.join(' ')).toContain('constructor arguments changed');
  });

  it('an artifact change invalidates the approval', () => {
    const v = validate(activeApproval({ artifactCreationSha256: 'deadbeef' }));
    expect(v.valid).toBe(false);
  });

  it('a candidate or manifest digest change invalidates all approvals', () => {
    expect(validate(activeApproval(), { candidateDigest: 'fnv1a64:1111111111111111' }).valid).toBe(false);
    expect(validate(activeApproval(), { manifest: 'fnv1a64:2222222222222222' }).valid).toBe(false);
  });

  it('a chain other than 677 invalidates the approval', () => {
    expect(validate(activeApproval(), { chainId: 968 }).valid).toBe(false);
  });

  it('a deployer change invalidates the approval', () => {
    expect(validate(activeApproval(), { deployer: null }).valid).toBe(false);
  });

  it('approval is one-time: consumed approvals no longer validate', () => {
    const consumed = consumeStageApproval(activeApproval());
    expect(consumed.status).toBe('CONSUMED');
    expect(validate(consumed).valid).toBe(false);
  });

  it('tampering with a bound field breaks the binding hash', () => {
    const v = validate(activeApproval({ expectedEffect: 'send everything to me' }));
    expect(v.valid).toBe(false);
    expect(v.reasons.join(' ')).toContain('binding hash mismatch');
  });

  it('a deployment approval never authorizes funding', () => {
    expect(approvalAuthorizesFunding(activeApproval())).toBe(false);
    expect(
      approvalAuthorizesFunding(activeApproval({ stage: 'G_FUNDING', contractId: null })),
    ).toBe(true);
  });
});

describe('V30.1E.1 DRY_RUN state machine', () => {
  it('dry run performs zero broadcasts and forbids write methods', () => {
    const result = runDeploymentDryRun();
    expect(result.mode).toBe('DRY_RUN');
    expect(result.broadcasts).toBe(0);
    expect(isDryRunSafeMethod('eth_getCode')).toBe(true);
    expect(isDryRunSafeMethod('eth_sendRawTransaction')).toBe(false);
    expect(isDryRunSafeMethod('wallet_sendTransaction')).toBe(false);
    expect(isDryRunSafeMethod('safe_execTransaction')).toBe(false);
  });

  it('the happy path verifies every stage in dependency order', () => {
    const result = runDeploymentDryRun();
    expect(result.allStagesVerified).toBe(true);
    expect(result.stages.map((s) => s.stage)).toEqual([
      'A_FLOW_TOKEN',
      'B_REWARDS_DISTRIBUTOR',
      'C_ROUTER_V4_AND_LENS',
      'D_ACTIVITY_REGISTRY',
      'E_STAKING_V2',
    ]);
    expect(result.totalGasEstimate).toBeGreaterThan(1_000_000);
    expect(result.fundingState).toBe('UNFUNDED');
    expect(result.featureState).toBe('PENDING_POOL');
  });

  it('a failed receipt stops progression', () => {
    const result = runDeploymentDryRun({
      observations: {
        FlowToken: {
          receiptStatus: 'REVERTED',
          observedRuntimeSha256: null,
          explorerSourceVerified: false,
          rolesMatchApproved: true,
          safeStateUnchanged: true,
        },
      },
    });
    expect(result.allStagesVerified).toBe(false);
    expect(result.stoppedAt).toBe('A_FLOW_TOKEN');
    expect(result.stages).toHaveLength(1);
  });

  it('a wrong runtime hash prevents source-verified status', () => {
    const r = simulateContract(payloadFor('FlowToken'), {
      receiptStatus: 'SUCCESS',
      observedRuntimeSha256: 'a'.repeat(64),
      explorerSourceVerified: true,
      rolesMatchApproved: true,
      safeStateUnchanged: true,
    });
    expect(r.state).toBe('RECEIPT_CONFIRMED');
    expect(r.stopped).toBe(true);
  });

  it('source verification failure prevents DEPLOYED_VERIFIED', () => {
    const r = simulateContract(payloadFor('FlowToken'), {
      receiptStatus: 'SUCCESS',
      observedRuntimeSha256: PRODUCTION_BYTECODE.FlowToken.runtimeSha256,
      explorerSourceVerified: false,
      rolesMatchApproved: true,
      safeStateUnchanged: true,
    });
    expect(r.state).toBe('BYTECODE_MATCHED');
    expect(r.stopped).toBe(true);
  });

  it('a wrong role or changed Safe state stops progression', () => {
    const wrongRole = simulateContract(payloadFor('FlowToken'), {
      receiptStatus: 'SUCCESS',
      observedRuntimeSha256: PRODUCTION_BYTECODE.FlowToken.runtimeSha256,
      explorerSourceVerified: true,
      rolesMatchApproved: false,
      safeStateUnchanged: true,
    });
    expect(wrongRole.state).toBe('SOURCE_VERIFIED');
    const safeDrift = simulateContract(payloadFor('FlowToken'), {
      receiptStatus: 'SUCCESS',
      observedRuntimeSha256: PRODUCTION_BYTECODE.FlowToken.runtimeSha256,
      explorerSourceVerified: true,
      rolesMatchApproved: true,
      safeStateUnchanged: false,
    });
    expect(safeDrift.state).toBe('NOT_DEPLOYED');
  });

  it('rewards/staking funding stays unavailable until deployed + source verified', () => {
    expect(fundingAvailable({ contractStates: ['BYTECODE_MATCHED'], ownerApproved: true })).toBe(false);
    expect(fundingAvailable({ contractStates: ['DEPLOYED_VERIFIED'], ownerApproved: false })).toBe(false);
    expect(fundingAvailable({ contractStates: ['DEPLOYED_VERIFIED'], ownerApproved: true })).toBe(true);
  });

  it('every contract has a scan.botchain.ai verification package with no secrets', () => {
    const packages = verificationPackages();
    expect(packages).toHaveLength(8);
    for (const p of packages) {
      expect(p.explorer).toBe('scan.botchain.ai');
      expect(p.compilerVersion).toMatch(/^0\.8\.(20|24)\+commit/);
      expect(p.fallback).toBe('STANDARD_JSON_MANUAL_PUBLICATION');
      expect(JSON.stringify(p)).not.toMatch(/private|secret|mnemonic/i);
    }
  });
});
