/**
 * FlowBridge V30.1E Stage D — FlowBridgeActivityRegistry preflight, deterministic
 * unsigned deployment review and the one-time Stage D approval binding.
 *
 * Secret-safe by construction: public addresses and public chain observations
 * only. Nothing here signs, broadcasts, funds anything, submits an attestation,
 * fabricates historical activity, grants an unrelated role, touches the Router
 * registries or migrates Router v3 traffic.
 *
 * The Registry has its OWN frozen build line (`missingContractPackage`:
 * solc 0.8.20+commit.a1b79de6, optimizer runs 1, viaIR, EVM shanghai). Router
 * (runs 200) and Staking (0.8.24 / cancun) settings must never be inherited —
 * doing so produces different bytecode and destroys manifest parity.
 */
import { BOT_MAINNET_CHAIN_ID } from '@/lib/network/canonicalNetworks';
import {
  APPROVED_AUTHORITIES,
  GAS_SAFETY_BUFFER_BPS,
  V30_1E_CANDIDATE_DIGEST,
  V30_1E_DECISION_MANIFEST_HASH,
} from './mainnetDeploymentGate';
import { payloadFor } from './deploymentPayloads';
import { createStageApproval, type StageApproval } from './deploymentTransport';
import { PRODUCTION_BYTECODE } from './productionBytecode';
import { APPROVED_DEPLOYER_ADDRESS } from './stageADeployer';

/** Frozen build matrix for the Registry — its own line, not Router's, not Staking's. */
export const STAGE_D_BUILD_MATRIX = {
  buildLine: 'missingContractPackage',
  solc: '0.8.20+commit.a1b79de6.Emscripten.clang',
  optimizer: { enabled: true, runs: 1 },
  viaIR: true,
  evmVersion: 'shanghai',
  openzeppelin: '5.6.1',
  note: 'Optimizer runs is 1 by design for this build line. Rewriting it to 200 (Router) or switching to 0.8.24/cancun (Staking) creates new bytecode and breaks parity.',
} as const;

/** Rebuilt Stage D artifact — double build from the frozen production source. */
export const STAGE_D_ARTIFACT = {
  source: 'contracts/production/activity-registry/FlowBridgeActivityRegistry.sol',
  sourceSha256: '2735de22c1f59a4c7ba7c4c66a2944b03db19aa3c76d670d0ef9a20ff5aeca6e',
  creationSha256: '25ec99e2bc31648d9e0cb2376c00063c404d2b535afe887f1b9cb37ebfc2cc6d',
  runtimeSha256: '53a83eea932da41016a7021926113e4ed50612525768bb6ba0eb1ec876b3e03b',
  normalizedAbiSha256: 'e021c7402ce241fe89624df8c395b30347b82bdac888758530e4bfe597a8978d',
  creationBytes: 3490,
  runtimeBytes: 2713,
  doubleBuildReproducible: true,
} as const;

/** Exact deterministic constructor arguments (checksummed, from the frozen manifest). */
export const STAGE_D_CONSTRUCTOR_ARGS = {
  admin: '0x88a4cc1f5771523baeb83daeea07d323a3ce9507',
  attester: '0xfa3de5cfa1de8ecc36197dcc0fc34fef5c1c7e47',
  pauser: '0x1ce0b1df5d2055f6e92122d8cb7669609c2359ef',
} as const;

export const STAGE_D_ABI_ENCODED_ARGS =
  '0x00000000000000000000000088a4cc1f5771523baeb83daeea07d323a3ce9507' +
  '000000000000000000000000fa3de5cfa1de8ecc36197dcc0fc34fef5c1c7e47' +
  '0000000000000000000000001ce0b1df5d2055f6e92122d8cb7669609c2359ef';

/** Final intended role matrix at genesis. */
export const STAGE_D_ROLE_MATRIX = {
  DEFAULT_ADMIN_ROLE: 'GOVERNANCE_SAFE',
  ATTESTER_ROLE: 'ACTIVITY_ATTESTER',
  PAUSER_ROLE: 'OPERATIONS_SAFE',
  adminEqualsAttester: false,
  deployerHoldsAnyRole: false,
  unpauseAuthority: 'DEFAULT_ADMIN_ROLE',
} as const;

/** Predicted genesis state immediately after settlement. */
export const STAGE_D_PREDICTED_GENESIS = {
  recordedActivities: 0,
  paused: false,
  attestationsPausable: true,
  sourceLogIndexType: 'uint256',
  activityIdFormula: 'keccak256(abi.encode(uint256 sourceChainId, bytes32 sourceTxHash, uint256 sourceLogIndex, bytes32 actionType))',
  duplicateProtection: 'DuplicateActivity revert on repeated activityId',
  flowCustody: 'NONE',
  rewardAuthority: 'NONE',
  economicExecutionAuthority: 'NONE',
} as const;

export interface StageDObservation {
  chainId: number;
  blockNumber: number;
  deployerCode: string;
  deployerBalanceWei: bigint;
  nonce: number;
  gasPriceWei: bigint;
  gasEstimate: bigint;
  safesVerified: boolean;
  attesterIsEoa: boolean;
  attesterAddress: string;
  candidateDigest: string;
  decisionManifestHash: string;
  expectedAddress: string;
  expectedAddressHasCode: boolean;
  unsignedDataBytes: number;
  unsignedDataKeccak256: string;
  built: typeof STAGE_D_ARTIFACT;
}

/** Recorded live observation — BOT Mainnet 677, read-only JSON-RPC. */
export const STAGE_D_OBSERVATION: StageDObservation = {
  chainId: 677,
  blockNumber: 21_349_018,
  deployerCode: '0x',
  deployerBalanceWei: 2_327_654_980_000_000_000n,
  nonce: 4,
  gasPriceWei: 20_000_000_000n,
  gasEstimate: 733_319n,
  safesVerified: true,
  attesterIsEoa: true,
  attesterAddress: APPROVED_AUTHORITIES.activityAttester,
  candidateDigest: V30_1E_CANDIDATE_DIGEST,
  decisionManifestHash: V30_1E_DECISION_MANIFEST_HASH,
  expectedAddress: '0xa80d8740f378989f649ca14c54e4b4a42e68753c',
  expectedAddressHasCode: false,
  unsignedDataBytes: 3_586,
  unsignedDataKeccak256: '0xb802153f8ac61914fb7bf2fc78d45972e5f545051d7b180c8df75ada13fed443',
  built: STAGE_D_ARTIFACT,
};

export type StageDCheckId =
  | 'CHAIN_IS_BOT_MAINNET'
  | 'DEPLOYER_IS_APPROVED_EOA'
  | 'DEPLOYER_NONCE_EXPECTED'
  | 'CANDIDATE_DIGEST_UNCHANGED'
  | 'MANIFEST_HASH_UNCHANGED'
  | 'SAFES_VERIFIED'
  | 'ATTESTER_MATCHES_FROZEN_MANIFEST'
  | 'REGISTRY_ARTIFACT_PARITY'
  | 'DOUBLE_BUILD_REPRODUCIBLE'
  | 'OWN_BUILD_LINE_NOT_INHERITED'
  | 'EIP170_WITHIN_LIMIT'
  | 'CONSTRUCTOR_ARGS_MATCH_MANIFEST'
  | 'ADMIN_AND_ATTESTER_DIFFER'
  | 'PAUSER_IS_OPERATIONS_SAFE'
  | 'DEPLOYER_HOLDS_NO_ROLE'
  | 'GENESIS_HAS_NO_FABRICATED_ACTIVITY'
  | 'ATTESTATIONS_PAUSABLE'
  | 'CANONICAL_SOURCE_LOG_INDEX_UINT256'
  | 'NO_ECONOMIC_AUTHORITY'
  | 'CREATE_ADDRESS_UNOCCUPIED'
  | 'STAGE_FUNDING_COVERED';

export interface StageDCheck {
  id: StageDCheckId;
  ok: boolean;
  detail: string;
}

export interface StageDPreflightResult {
  verdict: 'STAGE_D_PREFLIGHT_PASS' | 'STAGE_D_PREFLIGHT_BLOCKED';
  deployerAddress: string;
  checks: readonly StageDCheck[];
  blockers: readonly string[];
  requiredStageFundingWei: string;
  balanceWei: string;
}

const EIP170_LIMIT = 24_576;
const lc = (v: string) => v.toLowerCase();

export function bufferedGasLimit(gasEstimate: bigint): bigint {
  return gasEstimate + (gasEstimate * BigInt(GAS_SAFETY_BUFFER_BPS)) / 10_000n;
}

export function requiredStageDFundingWei(obs: StageDObservation = STAGE_D_OBSERVATION): bigint {
  return bufferedGasLimit(obs.gasEstimate) * obs.gasPriceWei;
}

export function evaluateStageDPreflight(
  obs: StageDObservation = STAGE_D_OBSERVATION,
): StageDPreflightResult {
  const frozen = PRODUCTION_BYTECODE.FlowBridgeActivityRegistry;
  const payload = payloadFor('FlowBridgeActivityRegistry');
  const required = requiredStageDFundingWei(obs);
  const args = STAGE_D_CONSTRUCTOR_ARGS;

  const checks: StageDCheck[] = [
    {
      id: 'CHAIN_IS_BOT_MAINNET',
      ok: obs.chainId === BOT_MAINNET_CHAIN_ID,
      detail: `eth_chainId ${obs.chainId} must equal ${BOT_MAINNET_CHAIN_ID}`,
    },
    {
      id: 'DEPLOYER_IS_APPROVED_EOA',
      ok: obs.deployerCode === '0x',
      detail: `eth_getCode(${APPROVED_DEPLOYER_ADDRESS}) must be 0x (externally owned account)`,
    },
    {
      id: 'DEPLOYER_NONCE_EXPECTED',
      ok: obs.nonce === 4,
      detail: 'nonce must be exactly 4 (Stage A=0, B=1, C.1=2, C.2=3)',
    },
    {
      id: 'CANDIDATE_DIGEST_UNCHANGED',
      ok: obs.candidateDigest === V30_1E_CANDIDATE_DIGEST,
      detail: `candidate ${obs.candidateDigest} vs frozen ${V30_1E_CANDIDATE_DIGEST}`,
    },
    {
      id: 'MANIFEST_HASH_UNCHANGED',
      ok: obs.decisionManifestHash === V30_1E_DECISION_MANIFEST_HASH,
      detail: `manifest ${obs.decisionManifestHash} vs frozen ${V30_1E_DECISION_MANIFEST_HASH}`,
    },
    {
      id: 'SAFES_VERIFIED',
      ok: obs.safesVerified,
      detail: 'Treasury, Governance and Operations Safes must all verify (3 owners, threshold 2)',
    },
    {
      id: 'ATTESTER_MATCHES_FROZEN_MANIFEST',
      ok:
        lc(obs.attesterAddress) === lc(APPROVED_AUTHORITIES.activityAttester) &&
        lc(args.attester) === lc(APPROVED_AUTHORITIES.activityAttester),
      detail: `attester must be exactly ${APPROVED_AUTHORITIES.activityAttester}`,
    },
    {
      id: 'REGISTRY_ARTIFACT_PARITY',
      ok:
        obs.built.sourceSha256 === frozen.sourceSha256 &&
        obs.built.creationSha256 === frozen.creationSha256 &&
        obs.built.runtimeSha256 === frozen.runtimeSha256 &&
        obs.built.normalizedAbiSha256 === frozen.normalizedAbiSha256 &&
        obs.built.creationBytes === frozen.creationBytes &&
        obs.built.runtimeBytes === frozen.runtimeBytes,
      detail: 'rebuilt source/creation/runtime/ABI hashes and sizes must equal PRODUCTION_BYTECODE.json',
    },
    {
      id: 'DOUBLE_BUILD_REPRODUCIBLE',
      ok: obs.built.doubleBuildReproducible,
      detail: 'two clean builds must produce byte-identical creation, runtime and ABI',
    },
    {
      id: 'OWN_BUILD_LINE_NOT_INHERITED',
      ok:
        STAGE_D_BUILD_MATRIX.optimizer.runs === 1 &&
        STAGE_D_BUILD_MATRIX.evmVersion === 'shanghai' &&
        STAGE_D_BUILD_MATRIX.solc.startsWith('0.8.20+commit.a1b79de6') &&
        frozen.buildLine === 'missingContractPackage',
      detail:
        "Registry must use its own frozen build line (runs 1, shanghai, 0.8.20) — never Router's runs 200 or Staking's 0.8.24/cancun",
    },
    {
      id: 'EIP170_WITHIN_LIMIT',
      ok: obs.built.runtimeBytes <= EIP170_LIMIT,
      detail: `runtime ${obs.built.runtimeBytes} bytes must stay within ${EIP170_LIMIT}`,
    },
    {
      id: 'CONSTRUCTOR_ARGS_MATCH_MANIFEST',
      ok:
        payload.args.length === 3 &&
        lc(args.admin) === lc(APPROVED_AUTHORITIES.governanceSafe) &&
        lc(args.pauser) === lc(APPROVED_AUTHORITIES.operationsSafe) &&
        payload.unresolvedDependencies.length === 0,
      detail:
        'constructor is (admin, attester, pauser) with Governance Safe admin, approved attester and Operations pauser; no unresolved dependency',
    },
    {
      id: 'ADMIN_AND_ATTESTER_DIFFER',
      ok: lc(args.admin) !== lc(args.attester) && !STAGE_D_ROLE_MATRIX.adminEqualsAttester,
      detail: 'contract reverts AdminAttesterMustDiffer when admin == attester; they must differ',
    },
    {
      id: 'PAUSER_IS_OPERATIONS_SAFE',
      ok: lc(args.pauser) === lc(APPROVED_AUTHORITIES.operationsSafe),
      detail: 'pauser must be the frozen operational authority (Operations Safe)',
    },
    {
      id: 'DEPLOYER_HOLDS_NO_ROLE',
      ok:
        !STAGE_D_ROLE_MATRIX.deployerHoldsAnyRole &&
        [args.admin, args.attester, args.pauser].every(
          (a) => lc(a) !== lc(APPROVED_DEPLOYER_ADDRESS),
        ),
      detail: 'the deployer EOA must not receive admin, attester or pauser authority',
    },
    {
      id: 'GENESIS_HAS_NO_FABRICATED_ACTIVITY',
      ok: STAGE_D_PREDICTED_GENESIS.recordedActivities === 0,
      detail: 'registry must start with zero recorded activity; no seeding, no historical backfill',
    },
    {
      id: 'ATTESTATIONS_PAUSABLE',
      ok: STAGE_D_PREDICTED_GENESIS.attestationsPausable && !STAGE_D_PREDICTED_GENESIS.paused,
      detail: 'recordActivity must be whenNotPaused and start unpaused',
    },
    {
      id: 'CANONICAL_SOURCE_LOG_INDEX_UINT256',
      ok: STAGE_D_PREDICTED_GENESIS.sourceLogIndexType === 'uint256',
      detail:
        'sourceLogIndex must stay uint256 so activityId encoding matches the A2.1 verifier exactly',
    },
    {
      id: 'NO_ECONOMIC_AUTHORITY',
      ok:
        STAGE_D_PREDICTED_GENESIS.flowCustody === 'NONE' &&
        STAGE_D_PREDICTED_GENESIS.rewardAuthority === 'NONE' &&
        STAGE_D_PREDICTED_GENESIS.economicExecutionAuthority === 'NONE',
      detail: 'Registry must hold no FLOW, no reward authority and no economic execution power',
    },
    {
      id: 'CREATE_ADDRESS_UNOCCUPIED',
      ok: !obs.expectedAddressHasCode,
      detail: `expected CREATE address ${obs.expectedAddress} must currently be empty`,
    },
    {
      id: 'STAGE_FUNDING_COVERED',
      ok: obs.deployerBalanceWei >= required,
      detail: 'deployer balance must cover the live gas estimate +30% at the live gas price',
    },
  ];

  const blockers = checks.filter((c) => !c.ok).map((c) => c.detail);
  return {
    verdict: blockers.length === 0 ? 'STAGE_D_PREFLIGHT_PASS' : 'STAGE_D_PREFLIGHT_BLOCKED',
    deployerAddress: APPROVED_DEPLOYER_ADDRESS,
    checks,
    blockers,
    requiredStageFundingWei: required.toString(),
    balanceWei: obs.deployerBalanceWei.toString(),
  };
}

/**
 * One-time Stage D approval, bound to chain, deployer, candidate, manifest,
 * artifact creation hash and constructor-args hash. It authorizes exactly one
 * creation transaction and nothing else: no attestation, no funding, no role
 * grant beyond the constructor, no Router registry change, no v3 migration.
 */
export function buildStageDApproval(): StageApproval {
  const payload = payloadFor('FlowBridgeActivityRegistry');
  return createStageApproval({
    stage: 'D_ACTIVITY_REGISTRY',
    candidateDigest: V30_1E_CANDIDATE_DIGEST,
    decisionManifestHash: V30_1E_DECISION_MANIFEST_HASH,
    chainId: BOT_MAINNET_CHAIN_ID,
    deployerAddress: APPROVED_DEPLOYER_ADDRESS,
    contractId: 'FlowBridgeActivityRegistry',
    artifactCreationSha256: STAGE_D_ARTIFACT.creationSha256,
    constructorArgsHash: payload.constructorArgsHash,
    expectedEffect: payload.expectedEffect,
  });
}

/** Unsigned Stage D review returned to the owner before any signature. */
export const STAGE_D_UNSIGNED_REVIEW = {
  stage: 'D_ACTIVITY_REGISTRY',
  chainId: 677,
  from: APPROVED_DEPLOYER_ADDRESS,
  to: null,
  value: '0',
  nonce: 4,
  gasPriceWei: '20000000000',
  gasEstimate: '733319',
  gasLimit: '953314',
  creationBytes: STAGE_D_ARTIFACT.creationBytes,
  unsignedDataBytes: STAGE_D_OBSERVATION.unsignedDataBytes,
  unsignedDataKeccak256: STAGE_D_OBSERVATION.unsignedDataKeccak256,
  abiEncodedConstructorArgs: STAGE_D_ABI_ENCODED_ARGS,
  expectedAddress: STAGE_D_OBSERVATION.expectedAddress,
  constructorArgs: STAGE_D_CONSTRUCTOR_ARGS,
  roleMatrix: STAGE_D_ROLE_MATRIX,
  predictedGenesis: STAGE_D_PREDICTED_GENESIS,
  bufferedFeeWei: '19066280000000000',
  verificationPackage: {
    route: 'BLOCKSCOUT_V2_STANDARD_JSON',
    precedent: 'Router V4 and Router Lens verified publicly through this route',
    settings: STAGE_D_BUILD_MATRIX,
    license: 'MIT',
    fallbackClassification: 'EXPLORER_TRANSPORT_BLOCKED',
    hardStop: 'SOURCE_RUNTIME_COMPILER_MISMATCH',
    ready: true,
  },
  prohibited: [
    'ATTESTATION_SUBMISSION',
    'HISTORICAL_ACTIVITY_FABRICATION',
    'ASSET_TRANSFER',
    'UNRELATED_ROLE_GRANT',
    'FUNDING',
    'ROUTER_REGISTRY_MODIFICATION',
    'ROUTER_V3_TRAFFIC_MIGRATION',
  ],
  ownerApproval: 'RECORDED_PREFLIGHT_ONLY',
  broadcast: 'NOT_BROADCAST',
} as const;
